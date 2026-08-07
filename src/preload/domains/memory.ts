import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type {
  AiConfig,
  ProjectMemoryAnswer,
  RelatedSession,
  MMFImportResult,
  DashboardStats,
  BackupData,
  Preference,
  PreferenceStatus,
  PreferenceSource,
  UserProfile,
  ConflictReport,
  AuditLog,
  TieredMemory,
  MemoryHealth,
  ProfileSummary,
  MemoryBlock,
  MemoryBlockHistory,
  PreferenceTimeline
} from '@shared/types'

// ===== Project Memory（Phase 3） =====
export const memory = {
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
    ipcRenderer.invoke(IPC.AI_RELATED_SESSIONS, sessionId, options),
  /** 导出工作区记忆为 MMF（Memora Memory Format）JSON 字符串 */
  exportMemory: (workspaceId: string): Promise<string> =>
    ipcRenderer.invoke(IPC.MEMORY_EXPORT_MMF, workspaceId),
  /** 从 MMF JSON 字符串导入记忆到目标工作区 */
  importMemory: (jsonString: string, targetWorkspaceId: string): Promise<MMFImportResult> =>
    ipcRenderer.invoke(IPC.MEMORY_IMPORT_MMF, jsonString, targetWorkspaceId)
}

// ===== Dashboard 统计 =====
export const stats = {
  get: (): Promise<DashboardStats> => ipcRenderer.invoke(IPC.STATS_GET)
}

// ===== 数据备份与恢复 =====
export const backup = {
  export: (): Promise<BackupData> => ipcRenderer.invoke(IPC.BACKUP_EXPORT),
  import: (data: BackupData): Promise<{ restored: number }> => ipcRenderer.invoke(IPC.BACKUP_IMPORT, data),
  /** 列出所有热备份（v1.6，sha256 为 v1.8） */
  list: (): Promise<Array<{ filename: string; size: number; createdAt: string; encrypted: boolean; sha256?: string }>> =>
    ipcRenderer.invoke(IPC.BACKUP_LIST),
  /** 手动创建一次热备份（v1.6，sha256 为 v1.8） */
  create: (): Promise<{ filename: string; size: number; createdAt: string; encrypted: boolean; sha256?: string }> =>
    ipcRenderer.invoke(IPC.BACKUP_CREATE),
  /** 从热备份恢复（v1.6，password 用于加密备份 v1.6.1，校验和强制校验 v1.8） */
  restore: (filename: string, password?: string): Promise<{ restored: boolean }> =>
    ipcRenderer.invoke(IPC.BACKUP_RESTORE, filename, password),
  /** 删除指定热备份（v1.6） */
  delete: (filename: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke(IPC.BACKUP_DELETE, filename),
  /** 获取热备份配置（v1.6） */
  getConfig: (): Promise<{ intervalMinutes: number; maxBackups: number; enabled: boolean }> =>
    ipcRenderer.invoke(IPC.BACKUP_CONFIG_GET),
  /** 设置热备份配置（v1.6，变更持久化 v1.8） */
  setConfig: (config: { intervalMinutes?: number; maxBackups?: number; enabled?: boolean }): Promise<{ intervalMinutes: number; maxBackups: number; enabled: boolean }> =>
    ipcRenderer.invoke(IPC.BACKUP_CONFIG_SET, config)
}

// ===== Preference（v1.4 Memory Lifecycle） =====
export const preference = {
  list: (options?: {
    workspaceId?: string
    status?: PreferenceStatus
    subject?: string
    limit?: number
    offset?: number
  }): Promise<Preference[]> => ipcRenderer.invoke(IPC.PREF_LIST, options),
  get: (id: string): Promise<Preference | null> => ipcRenderer.invoke(IPC.PREF_GET, id),
  create: (input: {
    workspaceId: string
    sessionId?: string
    subject: string
    value: string
    confidence?: number
    source?: PreferenceSource
    validAt?: string
    invalidAt?: string
    temporalType?: 'permanent' | 'temporary' | 'scheduled'
  }): Promise<Preference> => ipcRenderer.invoke(IPC.PREF_CREATE, input),
  update: (
    id: string,
    patch: Partial<Pick<Preference, 'value' | 'confidence' | 'status' | 'subject' | 'context' | 'validAt' | 'invalidAt' | 'temporalType'>>
  ): Promise<Preference | null> => ipcRenderer.invoke(IPC.PREF_UPDATE, id, patch),
  /** 时态记忆更新（v1.15）：设置偏好生效/失效时间与类型 */
  updateTemporal: (
    id: string,
    temporal: { validAt?: string; invalidAt?: string; temporalType?: 'permanent' | 'temporary' | 'scheduled' }
  ): Promise<Preference | null> => ipcRenderer.invoke(IPC.PREF_TEMPORAL_UPDATE, id, temporal),
  delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PREF_DELETE, id),
  archive: (id: string): Promise<Preference | null> => ipcRenderer.invoke(IPC.PREF_ARCHIVE, id),
  search: (
    query: string,
    options?: { workspaceId?: string; limit?: number }
  ): Promise<Preference[]> => ipcRenderer.invoke(IPC.PREF_SEARCH, query, options),
  count: (workspaceId: string): Promise<{
    total: number
    active: number
    superseded: number
    archived: number
  }> => ipcRenderer.invoke(IPC.PREF_COUNT, workspaceId),
  profile: (workspaceId: string): Promise<UserProfile> =>
    ipcRenderer.invoke(IPC.PREF_PROFILE, workspaceId),
  decay: (workspaceId?: string, daysThreshold?: number, decayRate?: number): Promise<number> =>
    ipcRenderer.invoke(IPC.PREF_DECAY, workspaceId, daysThreshold, decayRate),
  /** 冲突检测（v1.6） */
  conflicts: (workspaceId?: string): Promise<ConflictReport[]> =>
    ipcRenderer.invoke(IPC.PREF_CONFLICTS, workspaceId),
  /** AI 宪法：返回核心原则条目（source='constitution'） */
  constitution: (workspaceId?: string): Promise<Preference[]> =>
    ipcRenderer.invoke(IPC.PREF_CONSTITUTION, workspaceId),
  /** 自然语言记忆反馈（v1.15 行动项 5）：修正/补充/替换偏好值，返回更新后的偏好 */
  feedback: (preferenceId: string, feedback: string, workspaceId: string): Promise<Preference | null> =>
    ipcRenderer.invoke(IPC.PREF_FEEDBACK, preferenceId, feedback, workspaceId),
  /** Memory Audit Log：查询偏好/知识/会话变更审计日志 */
  auditLogs: (options?: { entityType?: string; entityId?: string; workspaceId?: string; limit?: number; offset?: number }): Promise<AuditLog[]> =>
    ipcRenderer.invoke(IPC.PREF_AUDIT_LOGS, options),
  /** 偏好演化时间线（v1.15 P2-1 Memory Timeline）：返回偏好随时间的变化轨迹 */
  timeline: (workspaceId: string, limit?: number): Promise<PreferenceTimeline> =>
    ipcRenderer.invoke(IPC.PREF_TIMELINE, workspaceId, limit)
}

// ===== 记忆生命周期（v1.7.0） =====
export const memoryLifecycle = {
  /** 获取分层记忆列表 */
  tiered: (workspaceId?: string): Promise<TieredMemory[]> =>
    ipcRenderer.invoke(IPC.MEMORY_TIERED, workspaceId),
  /** 获取记忆健康报告 */
  health: (workspaceId?: string): Promise<MemoryHealth> =>
    ipcRenderer.invoke(IPC.MEMORY_HEALTH, workspaceId),
  /** 生成深度用户画像摘要 */
  profileSummary: (workspaceId: string): Promise<ProfileSummary> =>
    ipcRenderer.invoke(IPC.MEMORY_PROFILE_SUMMARY, workspaceId),
  /** 执行一次记忆生命周期维护 */
  run: (workspaceId?: string): Promise<{ maintained: number; archived: number; promoted: number; demoted: number }> =>
    ipcRenderer.invoke(IPC.MEMORY_LIFECYCLE_RUN, workspaceId)
}

// ===== 结构化记忆块（v1.15 行动项 2：Letta 式 memory blocks） =====
export const memoryBlocks = {
  list: (workspaceId?: string): Promise<MemoryBlock[]> =>
    ipcRenderer.invoke(IPC.MEMORY_BLOCKS_LIST, workspaceId),
  get: (id: string): Promise<MemoryBlock | null> =>
    ipcRenderer.invoke(IPC.MEMORY_BLOCKS_GET, id),
  save: (input: {
    workspaceId: string
    label: string
    value: string
    readOnly?: boolean
    changedBy?: string
    reason?: string
  }): Promise<MemoryBlock> => ipcRenderer.invoke(IPC.MEMORY_BLOCKS_SAVE, input),
  remove: (id: string, changedBy?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.MEMORY_BLOCKS_DELETE, id, changedBy),
  history: (blockId: string, limit?: number): Promise<MemoryBlockHistory[]> =>
    ipcRenderer.invoke(IPC.MEMORY_BLOCKS_HISTORY, blockId, limit),
  rollback: (blockId: string, historyId: string, changedBy?: string): Promise<MemoryBlock> =>
    ipcRenderer.invoke(IPC.MEMORY_BLOCKS_ROLLBACK, blockId, historyId, changedBy)
}