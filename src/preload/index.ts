import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/constants'
import type {
  Workspace,
  Folder,
  ChatSession,
  Tag,
  SearchResult,
  ImportResult,
  SessionSummary,
  AiConfig,
  SemanticSearchResult,
  ProjectMemoryAnswer,
  RelatedSession
} from '../shared/types'

/**
 * 暴露给渲染进程的安全 API
 * 所有 Node 能力都经过 IPC 转发，renderer 无法直接访问 fs / SQLite
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

  // ===== Workspace =====
  workspace: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke(IPC.WORKSPACE_LIST),
    create: (input: { name: string; description?: string; color?: string; icon?: string }): Promise<Workspace> =>
      ipcRenderer.invoke(IPC.WORKSPACE_CREATE, input),
    update: (id: string, patch: Partial<Workspace>): Promise<void> =>
      ipcRenderer.invoke(IPC.WORKSPACE_UPDATE, id, patch),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.WORKSPACE_DELETE, id),
    tree: (workspaceId: string): Promise<{
      workspace: Workspace
      rootFolders: Folder[]
      sessions: ChatSession[]
    } | null> => ipcRenderer.invoke(IPC.WORKSPACE_TREE, workspaceId)
  },

  // ===== Folder =====
  folder: {
    list: (workspaceId?: string): Promise<Folder[]> => ipcRenderer.invoke(IPC.FOLDER_LIST, workspaceId),
    create: (input: { workspaceId: string; parentId?: string; name: string }): Promise<Folder> =>
      ipcRenderer.invoke(IPC.FOLDER_CREATE, input),
    update: (id: string, patch: Partial<Folder>): Promise<void> =>
      ipcRenderer.invoke(IPC.FOLDER_UPDATE, id, patch),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FOLDER_DELETE, id)
  },

  // ===== Session =====
  session: {
    get: (id: string, withMessages = true): Promise<ChatSession | null> =>
      ipcRenderer.invoke(IPC.SESSION_GET, id, withMessages),
    list: (options?: {
      folderId?: string
      provider?: string
      favorite?: boolean
      limit?: number
      offset?: number
    }): Promise<ChatSession[]> => ipcRenderer.invoke(IPC.SESSION_LIST, options),
    update: (
      id: string,
      patch: Partial<Pick<ChatSession, 'title' | 'description' | 'folderId' | 'isFavorite'>>
    ): Promise<void> => ipcRenderer.invoke(IPC.SESSION_UPDATE, id, patch),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SESSION_DELETE, id),
    move: (id: string, folderId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.SESSION_MOVE, id, folderId),
    toggleFavorite: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SESSION_TOGGLE_FAVORITE, id)
  },

  // ===== Tag =====
  tag: {
    list: (): Promise<Tag[]> => ipcRenderer.invoke(IPC.TAG_LIST),
    create: (input: { name: string; color?: string }): Promise<Tag> =>
      ipcRenderer.invoke(IPC.TAG_CREATE, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAG_DELETE, id),
    attach: (sessionId: string, tagId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.TAG_ATTACH, sessionId, tagId),
    detach: (sessionId: string, tagId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.TAG_DETACH, sessionId, tagId)
  },

  // ===== Importer =====
  import: {
    file: (filePath: string, options?: { folderId?: string }): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.IMPORT_FILE, filePath, options),
    files: (filePaths: string[], options?: { folderId?: string }): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.IMPORT_FILES, filePaths, options),
    directory: (dirPath: string, options?: { folderId?: string }): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.IMPORT_DIRECTORY, dirPath, options)
  },

  // ===== Search =====
  search: (
    query: string,
    options?: { provider?: string; limit?: number }
  ): Promise<SearchResult[]> => ipcRenderer.invoke(IPC.SEARCH_QUERY, query, options),

  /** 语义搜索（Phase 2，需要先建立向量索引） */
  semanticSearch: (
    query: string,
    config: AiConfig,
    options?: { limit?: number; threshold?: number }
  ): Promise<SemanticSearchResult[]> =>
    ipcRenderer.invoke(IPC.SEARCH_SEMANTIC, query, config, options),

  // ===== Sharing =====
  share: {
    exportHtml: (
      sessionId: string,
      options?: { customTitle?: string; customDescription?: string }
    ): Promise<string | null> => ipcRenderer.invoke(IPC.SHARE_EXPORT_HTML, sessionId, options)
  },

  // ===== 批量操作 =====
  batch: {
    deleteSessions: (ids: string[]): Promise<{ deleted: number; total: number }> =>
      ipcRenderer.invoke(IPC.SESSION_BATCH_DELETE, ids),
    moveSessions: (
      ids: string[],
      folderId: string | null
    ): Promise<{ moved: number; total: number }> =>
      ipcRenderer.invoke(IPC.SESSION_BATCH_MOVE, ids, folderId)
  },

  // ===== AI（Phase 2） =====
  ai: {
    /** 生成（或重新生成）会话总结 */
    generateSummary: (sessionId: string, config: AiConfig): Promise<SessionSummary> =>
      ipcRenderer.invoke(IPC.AI_SUMMARY_GENERATE, sessionId, config),
    /** 获取会话总结（不触发生成） */
    getSummary: (sessionId: string): Promise<SessionSummary | null> =>
      ipcRenderer.invoke(IPC.AI_SUMMARY_GET, sessionId),
    /** 删除会话总结 */
    deleteSummary: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.AI_SUMMARY_DELETE, sessionId),
    /** 生成 knowledge.md 内容 */
    generateKnowledgeMd: (sessionId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.AI_KNOWLEDGE_GENERATE, sessionId),
    /** 为会话生成向量索引（增量） */
    embedSession: (
      sessionId: string,
      config: AiConfig
    ): Promise<{ total: number; embedded: number; skipped: number }> =>
      ipcRenderer.invoke(IPC.AI_EMBED_SESSION, sessionId, config),
    /** 查询会话向量索引进度 */
    getEmbedStatus: (
      sessionId: string
    ): Promise<{ total: number; embedded: number; complete: boolean }> =>
      ipcRenderer.invoke(IPC.AI_EMBED_STATUS, sessionId)
  },

  // ===== Project Memory（Phase 3） =====
  memory: {
    /** 基于历史对话的智能问答（RAG） */
    ask: (
      question: string,
      config: AiConfig,
      options?: { topK?: number; threshold?: number }
    ): Promise<ProjectMemoryAnswer> =>
      ipcRenderer.invoke(IPC.AI_MEMORY_ASK, question, config, options),
    /** 查找与指定会话相关的其他讨论 */
    findRelated: (
      sessionId: string,
      options?: { limit?: number; threshold?: number }
    ): Promise<RelatedSession[]> =>
      ipcRenderer.invoke(IPC.AI_RELATED_SESSIONS, sessionId, options)
  }
}

contextBridge.exposeInMainWorld('Memora', api)

// TypeScript 全局类型声明（供 renderer 使用）
export type MemoraApi = typeof api
