import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/constants'

// ===== 域模块（按功能域拆分，见 domains/） =====
import { workspace, folder } from './domains/core'
import { session, tag, batch } from './domains/sessions'
import { importApi, scanner, bgImport } from './domains/imports'
import { search, semanticSearch, hybridSearch, share } from './domains/search'
import { ai, secret } from './domains/ai'
import { memory, stats, backup, preference, memoryLifecycle } from './domains/memory'
import { knowledge, distillation, audit, mcpPermissions } from './domains/knowledge'
import {
  memoryAgent,
  sync,
  capsule,
  team,
  templates,
  migration,
  identity,
  security
} from './domains/advanced'

/**
 * 暴露给渲染进程的安全 API
 * 所有 Node 能力都经过 IPC 转发，renderer 无法直接访问 fs / SQLite
 *
 * 结构说明：
 * - 功能域（workspace / session / ai / knowledge / ...）拆分在 src/preload/domains/ 下
 * - 系统级函数（对话框 / webUtils / 更新事件）与极小的 db / log 域保留在本文件
 * - 任何域函数都必须通过 IPC 通道（@shared/constants），禁止直接暴露 Node API
 */
const api = {
  // ===== 系统 =====
  getDataDir: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_DATA_DIR),

  /** 从拖拽的 File 对象获取真实文件路径（Electron 33+ webUtils） */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  openFileDialog: (options?: {
    multiple?: boolean
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string[] | null> => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, options),

  saveFileDialog: (options: {
    defaultName?: string
    content: string
  }): Promise<string | null> => ipcRenderer.invoke(IPC.DIALOG_SAVE_FILE, options),

  // ===== 全量数据迁移（v1.7.1）=====
  system: {
    /** 导出整个工作区（数据库 + AI 配置）为 .zip 归档 */
    exportData: (): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.SYSTEM_EXPORT_DATA),
    /** 从 .zip 归档恢复整个工作区（会替换当前数据） */
    importData: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.SYSTEM_IMPORT_DATA)
  },

  /** 监听自动更新下载进度（main -> renderer 事件） */
  onUpdateProgress: (callback: (progress: { percent: number }) => void): (() => void) => {
    const h = (_event: unknown, progress: { percent: number }): void => callback(progress)
    ipcRenderer.on('update-progress', h)
    return () => ipcRenderer.removeListener('update-progress', h)
  },

  // ===== 数据库维护 =====
  db: {
    vacuum: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.DB_VACUUM),
    cleanOrphans: (): Promise<{ cleaned: number }> => ipcRenderer.invoke(IPC.DB_CLEAN_ORPHANS)
  },

  // ===== 日志系统（v1.6.1） =====
  log: {
    /** 列出日志文件路径 */
    listFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.LOG_LIST_FILES),
    /** 获取日志目录 */
    getDir: (): Promise<string> => ipcRenderer.invoke(IPC.LOG_GET_DIR)
  },

  // ===== 域 API（domains/） =====
  workspace,
  folder,
  session,
  tag,
  import: importApi,
  scanner,
  search,
  semanticSearch,
  hybridSearch,
  share,
  batch,
  ai,
  secret,
  memory,
  stats,
  backup,
  preference,
  memoryLifecycle,
  knowledge,
  distillation,
  audit,
  mcpPermissions,
  memoryAgent,
  sync,
  capsule,
  team,
  templates,
  migration,
  identity,
  security,
  bgImport
}

contextBridge.exposeInMainWorld('Memora', api)

// TypeScript 全局类型声明（供 renderer 使用）
export type MemoraApi = typeof api
