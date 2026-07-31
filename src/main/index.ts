import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { initDatabase, closeDatabase, checkpointDatabase } from '../database/connection'
import { registerIpcHandlers } from './ipc'
import { listWorkspaces, deleteWorkspace } from '../database/repositories/workspaceRepo'
import { backgroundImporter } from '../importer/backgroundImporter'
import { shutdownSemanticWorker } from '../search/semantic'

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
      backgroundColor: '#0f0f0f',
      icon: join(process.cwd(), 'build', 'icon.ico'),
      // 隐藏系统标题栏的关闭按钮行为由 tray 接管
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
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

    // 外部链接用系统浏览器打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    // 开发环境加载 dev server，生产环境加载打包文件
    if (process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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

    // 清理重复的默认工作区
    cleanupDuplicateDefaultWorkspaces()

    // 注册 IPC 处理器
    registerIpcHandlers()

    // 创建托盘 + 窗口
    createTray()
    createWindow()

    // 后台静默导入：加载配置，绑定窗口，若启用则启动
    backgroundImporter.loadConfig()
    backgroundImporter.setWindow(mainWindow)
    if (backgroundImporter.getConfig().enabled) {
      backgroundImporter.start()
    }

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
    // 终止语义搜索 worker 线程，避免阻止 Electron 干净退出
    shutdownSemanticWorker()
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
