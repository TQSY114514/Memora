import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'

// ===== 记忆智能体（v1.10） =====
export const memoryAgent = {
  /** 扫描知识缺口 */
  scan: (workspaceId?: string): Promise<Array<{
    entryId: string
    entryTitle: string
    gapType: string
    description: string
    severity: string
    suggestion: string
  }>> => ipcRenderer.invoke(IPC.MEMORY_AGENT_SCAN, workspaceId),
  /** 获取待复习队列 */
  reviewQueue: (workspaceId?: string): Promise<Array<{
    entryId: string
    entryTitle: string
    entryType: string
    daysSinceLastReview: number
    priority: string
    reason: string
  }>> => ipcRenderer.invoke(IPC.MEMORY_AGENT_REVIEW_QUEUE, workspaceId),
  /** 获取智能体状态 */
  status: (): Promise<{
    running: boolean
    intervalMinutes: number
    lastScanAt: string | null
    nextScanAt: string | null
    gapsFound: number
    reviewItems: number
  }> => ipcRenderer.invoke(IPC.MEMORY_AGENT_STATUS),
  /** 启动定期扫描 */
  start: (intervalMinutes?: number): Promise<{
    running: boolean
    intervalMinutes: number
    lastScanAt: string | null
    nextScanAt: string | null
    gapsFound: number
    reviewItems: number
  }> => ipcRenderer.invoke(IPC.MEMORY_AGENT_START, intervalMinutes),
  /** 停止定期扫描 */
  stop: (): Promise<{
    running: boolean
    intervalMinutes: number
    lastScanAt: string | null
    nextScanAt: string | null
    gapsFound: number
    reviewItems: number
  }> => ipcRenderer.invoke(IPC.MEMORY_AGENT_STOP),
  /** 查询自动记忆合并状态（v1.15 P2-3） */
  consolidationStatus: (): Promise<{
    running: boolean
    intervalMs: number
    lastRunAt: string | null
    nextRunAt: string | null
    lastMerged: number
    lastWorkspaces: number
    lastSummary: string | null
  }> => ipcRenderer.invoke(IPC.CONSOLIDATION_STATUS),
  /** 手动触发一次自动记忆合并（v1.15 P2-3） */
  runConsolidation: (): Promise<{
    merged: number
    workspaces: number
    summary: string
  }> => ipcRenderer.invoke(IPC.CONSOLIDATION_RUN)
}

// ===== 云端同步（v1.11） =====
export const sync = {
  getConfig: (): Promise<{
    enabled: boolean
    protocol: string
    endpoint: string
    username?: string
    password?: string
    intervalMinutes: number
    encryptionPassword?: string
  }> => ipcRenderer.invoke(IPC.SYNC_CONFIG_GET),
  setConfig: (config: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke(IPC.SYNC_CONFIG_SET, config),
  testConnection: (): Promise<{ success: boolean; error?: string; latency?: number }> =>
    ipcRenderer.invoke(IPC.SYNC_TEST_CONNECTION),
  upload: (key: string, data: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.SYNC_UPLOAD, key, data),
  download: (key: string): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke(IPC.SYNC_DOWNLOAD, key),
  listFiles: (): Promise<{ success: boolean; files?: string[]; error?: string }> =>
    ipcRenderer.invoke(IPC.SYNC_LIST_FILES),
  deleteFile: (key: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.SYNC_DELETE_FILE, key),
  perform: (localData: Record<string, string>): Promise<{
    syncing: boolean
    lastResult: string | null
    uploadedCount: number
    downloadedCount: number
    error: string | null
  }> => ipcRenderer.invoke(IPC.SYNC_PERFORM, localData)
}

// ===== 时间胶囊（v1.11） =====
export const capsule = {
  create: (input: {
    name: string
    description?: string
    unlockAt: string
    password: string
    entryIds: string[]
    preferenceIds: string[]
  }): Promise<{
    id: string
    name: string
    description: string
    sealedAt: string
    unlockAt: string
    unlocked: boolean
    summary: string
    entryCount: number
  }> => ipcRenderer.invoke(IPC.CAPSULE_CREATE, input),
  list: (): Promise<Array<{
    id: string
    name: string
    description: string
    sealedAt: string
    unlockAt: string
    unlocked: boolean
    unlockedAt: string | null
    summary: string
    entryCount: number
  }>> => ipcRenderer.invoke(IPC.CAPSULE_LIST),
  unlock: (capsuleId: string, password: string): Promise<{
    success: boolean
    data?: unknown
    error?: string
  }> => ipcRenderer.invoke(IPC.CAPSULE_UNLOCK, capsuleId, password),
  checkDue: (): Promise<Array<{
    id: string
    name: string
    unlockAt: string
  }>> => ipcRenderer.invoke(IPC.CAPSULE_CHECK_DUE),
  delete: (capsuleId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.CAPSULE_DELETE, capsuleId)
}

// ===== 团队协作（v1.11） =====
export const team = {
  createWorkspace: (name: string, description: string, createdBy: string): Promise<{
    id: string
    name: string
    description: string
    inviteCode: string
    createdBy: string
    createdAt: string
    members: Array<{ id: string; name: string; role: string; joinedAt: string }>
  }> => ipcRenderer.invoke(IPC.TEAM_CREATE_WORKSPACE, name, description, createdBy),
  listWorkspaces: (): Promise<Array<{
    id: string
    name: string
    description: string
    inviteCode: string
    createdBy: string
    createdAt: string
    members: Array<{ id: string; name: string; role: string; joinedAt: string }>
  }>> => ipcRenderer.invoke(IPC.TEAM_LIST_WORKSPACES),
  generateInvite: (): Promise<string> => ipcRenderer.invoke(IPC.TEAM_GENERATE_INVITE),
  joinWorkspace: (workspaceId: string, member: {
    id: string
    name: string
    role: string
    joinedAt: string
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.TEAM_JOIN_WORKSPACE, workspaceId, member),
  setVisibility: (visibility: {
    entryId: string
    entityType: string
    visibility: string
    allowedMembers: string[]
  }): Promise<{
    entryId: string
    entityType: string
    visibility: string
    allowedMembers: string[]
  }> => ipcRenderer.invoke(IPC.TEAM_SET_VISIBILITY, visibility),
  getVisibility: (entryId: string): Promise<{
    entryId: string
    entityType: string
    visibility: string
    allowedMembers: string[]
  } | null> => ipcRenderer.invoke(IPC.TEAM_GET_VISIBILITY, entryId),
  checkVisibility: (entryId: string, memberId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.TEAM_CHECK_VISIBILITY, entryId, memberId),
  addComment: (entryId: string, entityType: string, author: string, content: string, replyTo?: string): Promise<{
    id: string
    entryId: string
    entityType: string
    author: string
    content: string
    createdAt: string
    replyTo: string | null
    resolved: boolean
  }> => ipcRenderer.invoke(IPC.TEAM_ADD_COMMENT, entryId, entityType, author, content, replyTo),
  listComments: (entryId: string): Promise<Array<{
    id: string
    entryId: string
    entityType: string
    author: string
    content: string
    createdAt: string
    replyTo: string | null
    resolved: boolean
  }>> => ipcRenderer.invoke(IPC.TEAM_LIST_COMMENTS, entryId),
  getReplies: (parentId: string): Promise<Array<{
    id: string
    entryId: string
    entityType: string
    author: string
    content: string
    createdAt: string
    replyTo: string | null
    resolved: boolean
  }>> => ipcRenderer.invoke(IPC.TEAM_GET_REPLIES, parentId),
  resolveComment: (commentId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.TEAM_RESOLVE_COMMENT, commentId),
  exportEncrypted: (workspaceId: string, password: string): Promise<{
    format: string
    workspace: { id: string; name: string }
    checksum: string
    package: unknown
  }> => ipcRenderer.invoke(IPC.TEAM_EXPORT_ENCRYPTED, workspaceId, password),
  importEncrypted: (payload: unknown, password: string, targetWorkspaceId: string): Promise<{
    imported: { preferences: number; constitution: number; knowledge: number }
    skipped: number
  }> => ipcRenderer.invoke(IPC.TEAM_IMPORT_ENCRYPTED, payload, password, targetWorkspaceId)
}

// ===== 模板市场（v1.11） =====
export const templates = {
  list: (): Promise<Array<{
    id: string
    name: string
    description: string
    author: string
    category: string
    tags: string[]
    downloads: number
    knowledgeCount: number
    preferenceCount: number
  }>> => ipcRenderer.invoke(IPC.TEMPLATE_LIST),
  get: (id: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.TEMPLATE_GET, id),
  export: (id: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.TEMPLATE_EXPORT, id),
  import: (json: string): Promise<{ success: boolean; template?: unknown; error?: string }> =>
    ipcRenderer.invoke(IPC.TEMPLATE_IMPORT, json),
  filter: (category: string): Promise<Array<{
    id: string
    name: string
    description: string
    author: string
    category: string
    tags: string[]
  }>> => ipcRenderer.invoke(IPC.TEMPLATE_FILTER, category),
  search: (query: string): Promise<Array<{
    id: string
    name: string
    description: string
    author: string
    category: string
    tags: string[]
  }>> => ipcRenderer.invoke(IPC.TEMPLATE_SEARCH, query)
}

// ===== 迁移向导（v1.11） =====
export const migration = {
  platforms: (): Promise<Array<{
    id: string
    name: string
    icon: string
    installed: boolean
    dataPath: string
    sessionCount: number
    formats: string[]
    supportsSync: boolean
  }>> => ipcRenderer.invoke(IPC.MIGRATION_PLATFORMS),
  defaultConfig: (): Promise<{
    selectedPlatforms: string[]
    includeArchived: boolean
    dateRange: { start: string; end: string } | null
    targetWorkspaceId: string
    enableSync: boolean
    syncDirection: string
  }> => ipcRenderer.invoke(IPC.MIGRATION_DEFAULT_CONFIG),
  stepLabel: (step: string): Promise<string> =>
    ipcRenderer.invoke(IPC.MIGRATION_STEP_LABEL, step),
  stepDesc: (step: string): Promise<string> =>
    ipcRenderer.invoke(IPC.MIGRATION_STEP_DESC, step),
  formatDuration: (ms: number): Promise<string> =>
    ipcRenderer.invoke(IPC.MIGRATION_FORMAT_DURATION, ms)
}

// ===== AI 身份画像（v1.12） =====
export const identity = {
  generate: (workspaceId?: string): Promise<{
    generatedAt: string
    basics: {
      role: string[]
      techStack: string[]
      editors: string[]
      languages: string[]
    }
    communication: {
      style: string[]
      format: string[]
      avoid: string[]
    }
    projects: Array<{
      name: string
      description: string
      techStack: string[]
      status: string
    }>
    preferences: Array<{
      subject: string
      value: string
      confidence: number
    }>
    knowledge: Array<{
      title: string
      type: string
      snippet: string
    }>
    constitution: Array<{
      subject: string
      value: string
    }>
    stats: {
      totalSessions: number
      totalMessages: number
      totalPreferences: number
      totalKnowledge: number
      activeSince: string | null
      topProviders: string[]
    }
    promptText: string
  }> => ipcRenderer.invoke(IPC.IDENTITY_GENERATE, workspaceId)
}

// ===== 安全中心（v1.12） =====
export const security = {
  report: (): Promise<{
    generatedAt: string
    encryption: {
      safeStorageAvailable: boolean
      encryptedKeysCount: number
      status: string
      note: string
    }
    sensitiveInfo: {
      total: number
      byType: Array<{ type: string; count: number; lastDetectedAt: string }>
      samples: Array<{ type: string; masked: string; source: string; detectedAt: string }>
    }
    dataSafety: {
      dbPath: string
      dbSizeMB: number
      encrypted: boolean
      backupCount: number
    }
    recommendations: string[]
  }> => ipcRenderer.invoke(IPC.SECURITY_REPORT)
}