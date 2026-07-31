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
  RelatedSession,
  ScanResult,
  DetectedApp,
  DashboardStats,
  BackupData,
  FolderRule,
  ExtractedSession,
  BackgroundImportConfig,
  BackgroundImportStatus,
  BackgroundImportProgress,
  BackgroundImportRunResult,
  KnowledgeEntry,
  KnowledgeType,
  KnowledgeRelation
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
    create: (input: { workspaceId: string; parentId?: string; name: string; rule?: FolderRule | null }): Promise<Folder> =>
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
      ipcRenderer.invoke(IPC.SESSION_TOGGLE_FAVORITE, id),
    /** 按智能文件夹规则列出会话 */
    listByRule: (workspaceId: string, rule: FolderRule): Promise<ChatSession[]> =>
      ipcRenderer.invoke(IPC.SESSION_LIST_BY_RULE, workspaceId, rule)
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
    }
  },

  // ===== 扫描器（智能导入中心） =====
  // 安全：扫描范围由主进程返回的默认目录决定，且需用户主动触发
  scanner: {
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
    ): Promise<string | null> => ipcRenderer.invoke(IPC.SHARE_EXPORT_HTML, sessionId, options),
    /** 导出为 Markdown */
    exportMd: (
      sessionId: string,
      options?: { customTitle?: string; customDescription?: string }
    ): Promise<string | null> => ipcRenderer.invoke(IPC.SHARE_EXPORT_MD, sessionId, options),
    /** 导出为 Claude Code jsonl（用于跨平台迁移到 Claude Code） */
    exportClaudeCode: (
      sessionId: string,
      options?: { customTitle?: string; customDescription?: string }
    ): Promise<string | null> =>
      ipcRenderer.invoke(IPC.SHARE_EXPORT_CLAUDE_CODE, sessionId, options)
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
    /** 更新会话总结（手动编辑） */
    updateSummary: (
      sessionId: string,
      data: { summary: string; keyPoints: string[]; todos: string[] }
    ): Promise<SessionSummary> => ipcRenderer.invoke(IPC.AI_SUMMARY_UPDATE, sessionId, data),
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
      ipcRenderer.invoke(IPC.AI_EMBED_STATUS, sessionId),
    /** 测试 AI 连接（通过 main 进程，避免 CORS，v1.2 支持多协议） */
    testConnection: (config: {
      apiStyle?: import('@shared/types').AiApiStyle
      baseUrl: string
      apiKey: string
      chatModel: string
      embeddingModel: string
    }): Promise<{ ok: boolean; dim: number; error: string | undefined; message?: string }> =>
      ipcRenderer.invoke(IPC.TEST_AI_CONNECTION, config),
    /** 同步 AI 配置到主进程文件（供 MCP 进程读取，只存非敏感字段） */
    saveConfigFile: (
      provider: string,
      config: {
        baseUrl: string
        chatModel: string
        embeddingModel: string
        embeddingDim: number
        hasApiKey: boolean
        apiStyle?: import('@shared/types').AiApiStyle
        label?: string
      }
    ): Promise<void> => ipcRenderer.invoke(IPC.AI_CONFIG_FILE_SAVE, provider, config),
    /** 设置激活的 provider（同步到主进程文件） */
    setActiveProviderFile: (provider: string): Promise<void> =>
      ipcRenderer.invoke(IPC.AI_CONFIG_FILE_SET_ACTIVE, provider),
    /** 删除某 provider 的配置文件记录 */
    deleteConfigFile: (provider: string): Promise<void> =>
      ipcRenderer.invoke(IPC.AI_CONFIG_FILE_DELETE, provider)
  },

  // ===== API Key 安全存储（safeStorage 加密） =====
  secret: {
    /** 批量获取所有 provider 的明文 apiKey（从加密存储读取） */
    getAll: (): Promise<Record<string, string>> => ipcRenderer.invoke(IPC.SECRET_GET_ALL),
    /** 加密保存某 provider 的 apiKey */
    set: (provider: string, key: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SECRET_SET, provider, key),
    /** 删除某 provider 的 apiKey */
    delete: (provider: string): Promise<void> => ipcRenderer.invoke(IPC.SECRET_DELETE, provider)
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
  },
  // ===== Dashboard 统计 =====
  stats: {
    get: (): Promise<DashboardStats> => ipcRenderer.invoke(IPC.STATS_GET)
  },
  // ===== 数据备份与恢复 =====
  backup: {
    export: (): Promise<BackupData> => ipcRenderer.invoke(IPC.BACKUP_EXPORT),
    import: (data: BackupData): Promise<{ restored: number }> => ipcRenderer.invoke(IPC.BACKUP_IMPORT, data)
  },
  // ===== 数据库维护 =====
  db: {
    vacuum: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.DB_VACUUM),
    cleanOrphans: (): Promise<{ cleaned: number }> => ipcRenderer.invoke(IPC.DB_CLEAN_ORPHANS)
  },

  // ===== 后台静默导入（P3） =====
  bgImport: {
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
  },

  // ===== Knowledge Vault（v1.1） =====
  knowledge: {
    list: (options?: {
      workspaceId?: string
      type?: KnowledgeType
      sessionId?: string
      status?: string
      limit?: number
      offset?: number
    }): Promise<KnowledgeEntry[]> => ipcRenderer.invoke(IPC.KNOWLEDGE_LIST, options),
    get: (id: string): Promise<KnowledgeEntry | null> => ipcRenderer.invoke(IPC.KNOWLEDGE_GET, id),
    create: (input: {
      workspaceId: string
      sessionId?: string
      type: KnowledgeType
      title: string
      content?: string
      status?: string
      source?: string
      sortOrder?: number
    }): Promise<KnowledgeEntry> => ipcRenderer.invoke(IPC.KNOWLEDGE_CREATE, input),
    update: (
      id: string,
      patch: Partial<Pick<KnowledgeEntry, 'title' | 'content' | 'type' | 'status' | 'sortOrder'>>
    ): Promise<KnowledgeEntry | null> => ipcRenderer.invoke(IPC.KNOWLEDGE_UPDATE, id, patch),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.KNOWLEDGE_DELETE, id),
    toggleTask: (id: string): Promise<KnowledgeEntry | null> =>
      ipcRenderer.invoke(IPC.KNOWLEDGE_TOGGLE_TASK, id),
    search: (
      query: string,
      options?: { workspaceId?: string; type?: KnowledgeType; limit?: number }
    ): Promise<KnowledgeEntry[]> => ipcRenderer.invoke(IPC.KNOWLEDGE_SEARCH, query, options),
    count: (workspaceId: string): Promise<{
      total: number
      knowledge: number
      decision: number
      task: number
      openTask: number
    }> => ipcRenderer.invoke(IPC.KNOWLEDGE_COUNT, workspaceId),
    related: (entryId: string): Promise<KnowledgeEntry[]> =>
      ipcRenderer.invoke(IPC.KNOWLEDGE_RELATED, entryId),
    /** 从对话的 AI 蒸馏提炼为知识条目（幂等） */
    extractFromSession: (sessionId: string): Promise<{ created: number; workspaceId: string }> =>
      ipcRenderer.invoke(IPC.KNOWLEDGE_EXTRACT_FROM_SESSION, sessionId),
    relationAdd: (fromId: string, toId: string, relation: KnowledgeRelation): Promise<void> =>
      ipcRenderer.invoke(IPC.KNOWLEDGE_RELATION_ADD, fromId, toId, relation),
    relationRemove: (fromId: string, toId: string, relation: KnowledgeRelation): Promise<void> =>
      ipcRenderer.invoke(IPC.KNOWLEDGE_RELATION_REMOVE, fromId, toId, relation),
    relationList: (entryId: string): Promise<Array<{ fromId: string; toId: string; relation: string }>> =>
      ipcRenderer.invoke(IPC.KNOWLEDGE_RELATION_LIST, entryId)
  }
}

contextBridge.exposeInMainWorld('Memora', api)

// TypeScript 全局类型声明（供 renderer 使用）
export type MemoraApi = typeof api
