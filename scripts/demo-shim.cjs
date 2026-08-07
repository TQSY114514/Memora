/**
 * Electron 最小 shim —— 仅供 demo 脚本在 ELECTRON_RUN_AS_NODE 下加载真实仓库/工具链路。
 *
 * 真实 DB（better-sqlite3 为 Electron ABI）只能在 Electron 的 Node 运行时加载，
 * 而该运行时 `require('electron')` 返回的是路径字符串而非 API。
 * 本 shim 拦截 'electron' 模块，返回最小 API 面，使纯业务模块（repositories / mcp tools）
 * 无需真实 Electron 即可运行，从而产出真实数据流的 demo 输出。
 */
const Module = require('module')
const os = require('os')
const path = require('path')

// 优先使用 MEMORA_USER_DATA（与 src/main/index.ts MCP 模式一致），否则落到临时目录
const userData = process.env.MEMORA_USER_DATA || process.env.MEMORA_DEMO_USER_DATA || path.join(os.tmpdir(), 'memora-demo')

const electronStub = {
  app: {
    getPath: (name) => (name === 'userData' ? userData : os.tmpdir()),
    getVersion: () => '1.14.0',
    setPath: () => {},
    whenReady: () => Promise.resolve(),
    on: () => {},
    once: () => {},
    quit: () => {},
    disableHardwareAcceleration: () => {},
    dock: { hide: () => {} }
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => null,
    decryptString: () => null
  },
  BrowserWindow: class {},
  ipcMain: { handle: () => {} },
  ipcRenderer: { invoke: async () => {}, on: () => {}, send: () => {} },
  contextBridge: { exposeInMainWorld: () => {} },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  session: { defaultSession: { webRequest: { onHeadersReceived: () => {} } } },
  net: { fetch: () => Promise.resolve() },
  shell: { openExternal: () => {} },
  Tray: class {},
  Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
  nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
  powerMonitor: { on: () => {} }
}

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return electronStub
  }
  return origLoad.apply(this, arguments)
}