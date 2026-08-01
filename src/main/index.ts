import { app, BrowserWindow, shell, Tray, Menu, nativeImage, session, protocol, net } from 'electron'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { initDatabase, closeDatabase, checkpointDatabase } from '../database/connection'
import { registerIpcHandlers } from './ipc'
import { listWorkspaces, deleteWorkspace } from '../database/repositories/workspaceRepo'
import { backgroundImporter } from '../importer/backgroundImporter'
import { shutdownSemanticWorker } from '../search/semantic'
import { decayConfidence } from '../database/repositories/preferencesRepo'
import { runMemoryLifecycle } from './memoryLifecycle'
import { backupService } from './backup'
import { logger } from './logger'
import { initAutoUpdater } from './updater'

// ===== 全局异常处理器 =====
// 防止未捕获的异步/同步错误导致进程静默崩溃，记录日志后保持进程存活
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', {
    error: reason instanceof Error ? reason.stack : String(reason)
  })
})
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.stack })
})

// ===== 自定义协议注册（必须在 app.ready 之前） =====
// 用 app:// 协议替代 file:// 加载渲染进程：
// 1. 解决 file:// 下动态 import() 加载 chunk 失败（路径解析为根目录）的问题
// 2. 恢复 React.lazy 代码分割能力，减小首屏 bundle 体积
// 3. app:// 作为 privileged scheme 支持 fetch API、stream、secure context
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

// ===== MCP Server 模式 =====
// 通过 `electron --mcp` 启动时，运行 MCP Server 而非 GUI
const isMcpMode = process.argv.includes('--mcp')

if (isMcpMode) {
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    if (app.dock) app.dock.hide()
    initDatabase()
    const { startMcpServer } = await import('../mcp/server')
    await startMcpServer()
  })
  app.on('window-all-closed', () => { /* MCP 模式不退出 */ })
} else {
  startGui()
}

function startGui(): void {
  // 将 userData 重定向到项目目录下（开发期绕过系统目录权限限制）
  const isDev = !app.isPackaged
  if (isDev) {
    app.setPath('userData', join(process.cwd(), '.data'))
  }

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let isQuiting = false
  let lifecycleTimer: NodeJS.Timeout | null = null

  /** 创建系统托盘 */
  function createTray(): void {
    // 找图标：打包后用 build/icon.ico，开发期用项目根目录
    const iconCandidates = [
      join(process.cwd(), 'build', 'icon.ico'),
      join(__dirname, '../../build/icon.ico'),
      join(__dirname, '../renderer/icon.ico')
    ]
    const iconPath = iconCandidates.find((p) => existsSync(p))
    if (!iconPath) return

    const icon = nativeImage.createFromPath(iconPath)
    // 缩小到托盘合适尺寸（16x16 或 32x32）
    const trayIcon = icon.resize({ width: 16, height: 16 })
    tray = new Tray(trayIcon)
    tray.setToolTip('Memora - AI 记忆工作台')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuiting = true
          app.quit()
        }
      }
    ])
    tray.setContextMenu(contextMenu)

    // 点击托盘图标切换窗口显示
    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
  }

  function createWindow(): void {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 960,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      title: 'Memora',
      backgroundColor: '#0f0e12',
      icon: join(process.cwd(), 'build', 'icon.ico'),
      // 隐藏系统标题栏的关闭按钮行为由 tray 接管
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        // 启用沙箱 + contextIsolation，渲染进程无法直接访问 Node API
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
    })

    // 页面加载失败时给出可见提示，避免静默黑屏
    // 注意：errorDescription/validatedURL 来自网络层，必须转义防止 XSS
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.error('Renderer load failed', { errorCode, errorDescription, validatedURL })
      const esc = (s: unknown) => String(s).replace(/[<>&"']/g, (c) => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
      }[c]!))
      mainWindow?.webContents.loadURL(`data:text/html;charset=utf-8,
        <html>
        <body style="background:#0f0e12;color:#e8e6f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center;max-width:400px">
            <h2>页面加载失败</h2>
            <p style="color:#a09cb8">错误代码: ${esc(errorCode)}</p>
            <p style="color:#6e6a82;font-size:13px">${esc(errorDescription)}</p>
            <p style="color:#6e6a82;font-size:11px;word-break:break-all">${esc(validatedURL)}</p>
          </div>
        </body>
        </html>
      `)
    })

    // 关闭窗口时最小化到托盘（而非退出）
    mainWindow.on('close', (e) => {
      if (!isQuiting && tray) {
        e.preventDefault()
        mainWindow?.hide()
        return
      }
      mainWindow = null
    })

    // 外部链接用系统浏览器打开（仅放行 https/mailto，防止 file:// 或自定义协议 RCE）
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
          shell.openExternal(url)
        }
      } catch {
        // 无效 URL 静默拒绝
      }
      return { action: 'deny' }
    })

    // 设置 CSP 头：禁止内联脚本/动态脚本执行，只允许同源资源
    // 注意：React 组件的 inline style 需 'unsafe-inline'；img data: URI 用于部分图标
    // 开发模式需放宽 CSP：Vite HMR 使用 WebSocket + eval source map
    const isDevMode = !app.isPackaged
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = isDevMode
        ? "default-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; " +
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
          "font-src 'self' data:; " +
          "connect-src 'self' ws: wss:;"
        : "default-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; " +
          "script-src 'self'; " +
          "font-src 'self' data:;"
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      })
    })

    // 开发环境加载 dev server，生产环境用 app:// 自定义协议加载（替代 file://）
    // app:// 协议下动态 import() 的 chunk 路径能正确解析，支持 React.lazy 代码分割
    if (process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadURL('app://renderer/index.html')
    }
  }

  /** 清理重复的默认工作区（保留第一个） */
  function cleanupDuplicateDefaultWorkspaces(): void {
    try {
      const workspaces = listWorkspaces()
      const defaults = workspaces.filter((w) => w.name === '默认工作区')
      if (defaults.length > 1) {
        // 保留第一个，删除其余
        for (let i = 1; i < defaults.length; i++) {
          deleteWorkspace(defaults[i].id)
        }
      }
    } catch {
      // 清理失败不影响启动
    }
  }

  app.whenReady().then(() => {
    // 初始化数据库
    initDatabase()

    // 注册 app:// 协议处理器（生产模式下用自定义协议替代 file://）
    // app://renderer/index.html → {rendererDist}/index.html
    // app://renderer/assets/xxx.js → {rendererDist}/assets/xxx.js
    // 路径遍历防护：resolve 后校验最终路径在 rendererDist 目录内
    const rendererDist = join(__dirname, '../renderer')
    protocol.handle('app', (request) => {
      const url = new URL(request.url)
      // pathname: /index.html, /assets/xxx.js
      const filePath = join(rendererDist, url.pathname)
      const resolved = resolve(filePath)
      if (!resolved.startsWith(rendererDist)) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(resolved).toString())
    })

    // 清理重复的默认工作区
    cleanupDuplicateDefaultWorkspaces()

    // 记忆衰减：启动时对超过 30 天未访问的偏好降低置信度
    try {
      const decayed = decayConfidence()
      if (decayed > 0) {
        logger.info('Memory decay on startup', { decayed, daysThreshold: 30 })
      }
    } catch (e) {
      logger.warn('Memory decay failed (non-blocking)', { error: String(e) })
    }

    // 注册 IPC 处理器
    registerIpcHandlers()

    // 创建托盘 + 窗口
    createTray()
    createWindow()

    // 自动更新检查（仅打包模式）：启动后检查 GitHub Releases 新版本
    if (app.isPackaged && mainWindow) {
      initAutoUpdater(mainWindow)
    }

    // 后台静默导入：加载配置，绑定窗口，若启用则启动
    backgroundImporter.loadConfig()
    backgroundImporter.setWindow(mainWindow)
    if (backgroundImporter.getConfig().enabled) {
      backgroundImporter.start()
    }

    // 自动热备份：启动定时备份（v1.6）
    backupService.start()

    // 记忆生命周期自动调度：启动时执行一次 + 每 6 小时定期执行
    // 归档过弱记忆、更新访问时间、统计层级变化
    try {
      const result = runMemoryLifecycle()
      if (result.archived > 0 || result.promoted > 0) {
        logger.info('Memory lifecycle on startup', result)
      }
    } catch (e) {
      logger.warn('Memory lifecycle failed (non-blocking)', { error: String(e) })
    }
    const timer = setInterval(() => {
      try {
        const result = runMemoryLifecycle()
        if (result.archived > 0 || result.promoted > 0) {
          logger.info('Memory lifecycle scheduled', result)
        }
      } catch (e) {
        logger.warn('Memory lifecycle scheduled failed', { error: String(e) })
      }
    }, 6 * 60 * 60 * 1000)  // 6 小时
    lifecycleTimer = timer

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        backgroundImporter.setWindow(mainWindow)
      } else {
        mainWindow?.show()
      }
    })
  })

  // 真正退出时才关闭数据库
  app.on('before-quit', () => {
    isQuiting = true
    // 停止后台导入定时器，避免退出后定时器访问已关闭的数据库
    backgroundImporter.stop()
    // 停止自动热备份定时器（v1.6）
    backupService.stop()
    // 停止记忆生命周期定时器
    if (lifecycleTimer) clearInterval(lifecycleTimer)
    // 终止语义搜索 worker 线程，避免阻止 Electron 干净退出
    shutdownSemanticWorker()
    // 释放本地嵌入模型资源（v1.8 #15，best-effort）
    import('@ai/localEmbedder')
      .then(({ disposeLocalEmbedder }) => disposeLocalEmbedder())
      .catch(() => {})
    // 退出前将 WAL 写回主库 + 优化查询计划，避免 WAL 膨胀导致下次启动变慢
    checkpointDatabase()
    closeDatabase()
  })

  // macOS 除外，窗口全关时退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !tray) {
      app.quit()
    }
    // 有托盘时不退出，留在后台
  })
} // end startGui
