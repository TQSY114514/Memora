/**
 * Audit Log Repository
 *
 * Memory Audit Log：追踪偏好/知识/会话的变更历史（create/update/delete/archive/supersede/conflict_resolve）
 * - 记录 before/after 值（JSON 字符串），支持审计与回溯
 * - 按 entity_type + entity_id / workspace_id / created_at 建索引，查询高效
 */
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { AuditLog } from '@shared/types'

interface AuditLogRow {
  id: string
  entity_type: string
  entity_id: string
  action: string
  before_value: string | null
  after_value: string | null
  workspace_id: string | null
  session_id: string | null
  reason: string | null
  created_at: string
}

function rowToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    beforeValue: row.before_value ?? undefined,
    afterValue: row.after_value ?? undefined,
    workspaceId: row.workspace_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: row.created_at
  }
}

/**
 * 写入一条审计日志
 * - beforeValue/afterValue 接收对象，内部 JSON.stringify 存储
 * - 写入失败仅记录日志，不抛出（审计日志不应阻塞业务操作）
 */
export function addAuditLog(input: {
  entityType: string
  entityId: string
  action: string
  beforeValue?: Record<string, unknown>
  afterValue?: Record<string, unknown>
  workspaceId?: string
  sessionId?: string
  reason?: string
}): void {
  try {
    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO audit_logs
       (id, entity_type, entity_id, action, before_value, after_value, workspace_id, session_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.entityType,
      input.entityId,
      input.action,
      input.beforeValue ? JSON.stringify(input.beforeValue) : null,
      input.afterValue ? JSON.stringify(input.afterValue) : null,
      input.workspaceId ?? null,
      input.sessionId ?? null,
      input.reason ?? null,
      now
    )
  } catch (e) {
    console.error('[auditRepo] addAuditLog 失败（不影响业务操作）:', e)
  }
}

/**
 * 列出审计日志（支持按实体/工作区筛选 + 分页）
 * - 按 created_at DESC 排序（最新在前）
 */
export function listAuditLogs(options?: {
  entityType?: string
  entityId?: string
  workspaceId?: string
  limit?: number
  offset?: number
}): AuditLog[] {
  const db = getDatabase()
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (options?.entityType) {
    conditions.push('entity_type = @entityType')
    params.entityType = options.entityType
  }
  if (options?.entityId) {
    conditions.push('entity_id = @entityId')
    params.entityId = options.entityId
  }
  if (options?.workspaceId) {
    conditions.push('workspace_id = @workspaceId')
    params.workspaceId = options.workspaceId
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit ?? 1000
  const offset = options?.offset ?? 0

  const rows = db
    .prepare(
      `SELECT * FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset }) as AuditLogRow[]

  return rows.map(rowToAuditLog)
}
