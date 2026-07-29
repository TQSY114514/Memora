import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase } from '../database/connection'
import { registerIpcHandlers } from './ipc'

// ===== MCP Server 模式 =====
// 通过 `electron --mcp` 启动时，运行 MCP Server 而非 GUI
const isMcpMode = process.argv.includes('--mcp')

if (isMcpMode) {
  // MCP 模式不需要 GUI
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

app.whenReady().then(() => {
  // 初始化数据库
  initDatabase()

  // 注册 IPC 处理器
  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
} // end startGui
