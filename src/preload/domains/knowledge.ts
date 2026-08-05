import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type {
  KnowledgeEntry,
  KnowledgeType,
  KnowledgeRelation,
  KnowledgeGraphData,
  DistillationTemplate,
  AuditLog
} from '@shared/types'

// ===== Knowledge Vault（v1.1） =====
export const knowledge = {
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
    ipcRenderer.invoke(IPC.KNOWLEDGE_RELATION_LIST, entryId),
  /** 获取工作区知识图谱数据（节点 + 边，含显式关系和隐式关联） */
  graphData: (workspaceId: string): Promise<KnowledgeGraphData> =>
    ipcRenderer.invoke(IPC.KNOWLEDGE_GRAPH_DATA, workspaceId)
}

// ===== 蒸馏模板（v1.9 自定义蒸馏模板） =====
export const distillation = {
  /** 列出全部模板（内置 + 自定义） */
  list: (): Promise<DistillationTemplate[]> => ipcRenderer.invoke(IPC.DISTILL_LIST),
  /** 获取单个模板 */
  get: (id: string): Promise<DistillationTemplate | null> => ipcRenderer.invoke(IPC.DISTILL_GET, id),
  /** 创建自定义模板 */
  create: (input: {
    name: string
    description?: string
    systemPrompt: string
    outputFormat?: string
  }): Promise<DistillationTemplate> => ipcRenderer.invoke(IPC.DISTILL_CREATE, input),
  /** 更新模板（内置模板也可编辑内容，但不可删除） */
  update: (
    id: string,
    patch: Partial<Pick<DistillationTemplate, 'name' | 'description' | 'systemPrompt' | 'outputFormat'>>
  ): Promise<DistillationTemplate | null> => ipcRenderer.invoke(IPC.DISTILL_UPDATE, id, patch),
  /** 删除模板（内置模板禁止删除） */
  delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DISTILL_DELETE, id)
}

// ===== 记忆版本控制（v1.10） =====
export const audit = {
  /** 获取实体的版本历史 */
  versionHistory: (entityId: string, entityType: string): Promise<AuditLog[]> =>
    ipcRenderer.invoke(IPC.AUDIT_VERSION_HISTORY, entityId, entityType),
  /** 回滚实体到指定版本 */
  rollback: (entityType: string, auditLogId: string): Promise<{ success: boolean; entityId: string; message: string }> =>
    ipcRenderer.invoke(IPC.AUDIT_ROLLBACK, entityType, auditLogId)
}

// ===== MCP 工具权限系统（v1.10） =====
export const mcpPermissions = {
  /** 列出所有客户端权限 */
  list: (): Promise<Array<{
    id: string
    clientId: string
    clientName: string
    level: string
    allowedTools: string | null
    enabled: boolean
    createdAt: string
    updatedAt: string
  }>> => ipcRenderer.invoke(IPC.MCP_PERMISSIONS_LIST),
  /** 保存/更新客户端权限 */
  save: (input: {
    clientId: string
    clientName: string
    level?: string
    allowedTools?: string | null
    enabled?: boolean
  }): Promise<{
    id: string
    clientId: string
    clientName: string
    level: string
    allowedTools: string | null
    enabled: boolean
    createdAt: string
    updatedAt: string
  }> => ipcRenderer.invoke(IPC.MCP_PERMISSIONS_SAVE, input),
  /** 删除客户端权限 */
  delete: (clientId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.MCP_PERMISSIONS_DELETE, clientId)
}