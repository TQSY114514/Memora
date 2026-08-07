import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type {
  ImportResult,
  ExtractedSession,
  ScanResult,
  DetectedApp,
  BackgroundImportConfig,
  BackgroundImportStatus,
  BackgroundImportProgress,
  BackgroundImportRunResult
} from '@shared/types'

// ===== Importer =====
export const importApi = {
  file: (filePath: string, options?: { folderId?: string }): Promise<ImportResult> =>
    ipcRenderer.invoke(IPC.IMPORT_FILE, filePath, options),
  files: (filePaths: string[], options?: { folderId?: string }): Promise<ImportResult> =>
    ipcRenderer.invoke(IPC.IMPORT_FILES, filePaths, options),
  directory: (dirPath: string, options?: { folderId?: string }): Promise<ImportResult> =>
    ipcRenderer.invoke(IPC.IMPORT_DIRECTORY, dirPath, options),
  /** 导入已扒取的对话（内存中，可编辑标题/来源） */
  extracted: (
    sessions: ExtractedSession[],
    options?: { folderId?: string }
  ): Promise<ImportResult> => ipcRenderer.invoke(IPC.IMPORT_EXTRACTED, sessions, options),
  /** 监听大文件流式导入进度（main -> renderer 事件） */
  onProgress: (
    cb: (p: { filePath: string; loaded: number; total: number }) => void
  ): (() => void) => {
    const h = (_e: unknown, p: { filePath: string; loaded: number; total: number }): void =>
      cb(p)
    ipcRenderer.on(IPC.IMPORT_PROGRESS, h)
    return () => ipcRenderer.removeListener(IPC.IMPORT_PROGRESS, h)
  },
  /** 监听数据变更广播（import 等写库后 main 推送，常用于刷新统计） */
  onDataChanged: (cb: () => void): (() => void) => {
    const h = (): void => cb()
    ipcRenderer.on(IPC.DATA_CHANGED, h)
    return () => ipcRenderer.removeListener(IPC.DATA_CHANGED, h)
  }
}

// ===== 扫描器（智能导入中心） =====
// 安全：扫描范围由主进程返回的默认目录决定，且需用户主动触发
export const scanner = {
  /** 获取默认扫描目录（Downloads / Documents / Desktop） */
  getDefaultDirs: (): Promise<string[]> => ipcRenderer.invoke(IPC.SCANNER_GET_DEFAULT_DIRS),
  /** 扫描指定目录列表，返回候选 AI 对话文件 */
  scan: (
    dirs: string[],
    options?: { maxDepth?: number; maxFiles?: number }
  ): Promise<ScanResult[]> => ipcRenderer.invoke(IPC.SCANNER_SCAN, dirs, options),
  /** 检测本机已安装的 AI 应用 */
  detectApps: (): Promise<DetectedApp[]> => ipcRenderer.invoke(IPC.DETECT_APPS),
  /** 扒取指定 AI 应用的本地对话（仅 Cursor / ClaudeCode 支持） */
  extractApp: (
    provider: string,
    dataPath: string,
    options?: { maxSessions?: number }
  ): Promise<ExtractedSession[]> =>
    ipcRenderer.invoke(IPC.EXTRACT_APP, provider, dataPath, options)
}

// ===== 后台静默导入（P3） =====
export const bgImport = {
  getConfig: (): Promise<BackgroundImportConfig> => ipcRenderer.invoke(IPC.IMPORT_BG_CONFIG_GET),
  setConfig: (patch: Partial<BackgroundImportConfig>): Promise<BackgroundImportConfig> =>
    ipcRenderer.invoke(IPC.IMPORT_BG_CONFIG_SET, patch),
  getStatus: (): Promise<BackgroundImportStatus> => ipcRenderer.invoke(IPC.IMPORT_BG_STATUS),
  start: (): Promise<boolean> => ipcRenderer.invoke(IPC.IMPORT_BG_START),
  stop: (): Promise<boolean> => ipcRenderer.invoke(IPC.IMPORT_BG_STOP),
  runOnce: (): Promise<BackgroundImportRunResult> => ipcRenderer.invoke(IPC.IMPORT_BG_RUN_ONCE),
  onProgress: (cb: (p: BackgroundImportProgress) => void): (() => void) => {
    const h = (_e: unknown, p: BackgroundImportProgress): void => cb(p)
    ipcRenderer.on(IPC.IMPORT_BG_PROGRESS, h)
    return () => ipcRenderer.removeListener(IPC.IMPORT_BG_PROGRESS, h)
  },
  onDone: (cb: (r: BackgroundImportRunResult) => void): (() => void) => {
    const h = (_e: unknown, r: BackgroundImportRunResult): void => cb(r)
    ipcRenderer.on(IPC.IMPORT_BG_DONE, h)
    return () => ipcRenderer.removeListener(IPC.IMPORT_BG_DONE, h)
  }
}