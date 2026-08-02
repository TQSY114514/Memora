/**
 * 实体回滚 Repository
 *
 * 基于审计日志的 beforeValue 将实体恢复到指定版本。
 * 避免循环依赖：不导入其他 repository，直接操作数据库。
 */
import { getDatabase } from '../connection'
import { addAuditLog } from './auditRepo'

/**
 * 回滚实体到指定审计日志版本
 * - entityType: 'preference' | 'knowledge' | 'session'
 * - auditLogId: 目标审计日志的 ID（恢复到该日志的 beforeValue）
 *
 * 回滚原理：
 * - 找到目标审计日志，取其 beforeValue 作为恢复目标
 * - 将实体当前状态更新为 beforeValue，并写入一条新的审计日志
 */
export function rollbackEntity(
  entityType: string,
  auditLogId: string
): { success: boolean; entityId: string; message: string } {
  const db = getDatabase()

  // 找到目标审计日志
  const targetLog = db
    .prepare('SELECT * FROM audit_logs WHERE id = ?')
    .get(auditLogId) as { id: string; entity_type: string; entity_id: string; before_value: string | null; after_value: string | null; action: string } | undefined

  if (!targetLog) {
    return { success: false, entityId: '', message: '未找到目标审计日志' }
  }

  if (targetLog.entity_type !== entityType) {
    return { success: false, entityId: '', message: `实体类型不匹配：期望 ${entityType}，实际 ${targetLog.entity_type}` }
  }

  const entityId = targetLog.entity_id
  const beforeValue = targetLog.before_value

  if (!beforeValue) {
    return { success: false, entityId, message: '目标版本没有 beforeValue（可能是创建操作的日志，无法回滚到创建前的状态）' }
  }

  let beforeParsed: Record<string, unknown>
  try {
    beforeParsed = JSON.parse(beforeValue)
  } catch {
    return { success: false, entityId, message: 'beforeValue JSON 解析失败' }
  }

  // 获取当前实体状态（用于审计）
  let currentState: Record<string, unknown> | null = null
  try {
    switch (entityType) {
      case 'preference': {
        const row = db.prepare('SELECT * FROM preferences WHERE id = ?').get(entityId) as Record<string, unknown> | undefined
        if (row) {
          currentState = sanitizeRow(row)
        }
        break
      }
      case 'knowledge': {
        const row = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(entityId) as Record<string, unknown> | undefined
        if (row) {
          currentState = sanitizeRow(row)
        }
        break
      }
      case 'session': {
        const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(entityId) as Record<string, unknown> | undefined
        if (row) {
          currentState = sanitizeRow(row)
        }
        break
      }
    }
  } catch {
    // 实体可能已被删除，忽略
  }

  const now = new Date().toISOString()

  // 执行回滚
  try {
    const tx = db.transaction(() => {
      switch (entityType) {
        case 'preference': {
          const { value, confidence, status, subject, context } = beforeParsed as {
            value?: string
            confidence?: number
            status?: string
            subject?: string
            context?: string
          }
          const sets: string[] = []
          const params: Record<string, unknown> = { id: entityId }
          if (value !== undefined) { sets.push('value = @value'); params.value = value }
          if (confidence !== undefined) { sets.push('confidence = @confidence'); params.confidence = confidence }
          if (status !== undefined) { sets.push('status = @status'); params.status = status }
          if (subject !== undefined) { sets.push('subject = @subject'); params.subject = subject }
          if (context !== undefined) { sets.push('context = @context'); params.context = context }
          sets.push("updated_at = @now")
          params.now = now
          if (sets.length > 1) {
            db.prepare(`UPDATE preferences SET ${sets.join(', ')} WHERE id = @id`).run(params)
          }
          break
        }
        case 'knowledge': {
          const { title, content, type, status, sort_order } = beforeParsed as {
            title?: string
            content?: string
            type?: string
            status?: string
            sort_order?: number
          }
          const sets: string[] = []
          const params: Record<string, unknown> = { id: entityId }
          if (title !== undefined) { sets.push('title = @title'); params.title = title }
          if (content !== undefined) { sets.push('content = @content'); params.content = content }
          if (type !== undefined) { sets.push('type = @type'); params.type = type }
          if (status !== undefined) { sets.push('status = @status'); params.status = status }
          if (sort_order !== undefined) { sets.push('sort_order = @sortOrder'); params.sortOrder = sort_order }
          sets.push("updated_at = @now")
          params.now = now
          if (sets.length > 1) {
            db.prepare(`UPDATE knowledge_entries SET ${sets.join(', ')} WHERE id = @id`).run(params)
          }
          break
        }
        case 'session': {
          const { title, description, is_favorite } = beforeParsed as {
            title?: string
            description?: string
            is_favorite?: number
          }
          const sets: string[] = []
          const params: Record<string, unknown> = { id: entityId }
          if (title !== undefined) { sets.push('title = @title'); params.title = title }
          if (description !== undefined) { sets.push('description = @description'); params.description = description }
          if (is_favorite !== undefined) { sets.push('is_favorite = @isFavorite'); params.isFavorite = is_favorite }
          sets.push("updated_at = @now")
          params.now = now
          if (sets.length > 1) {
            db.prepare(`UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = @id`).run(params)
          }
          break
        }
      }
    })
    tx()

    // 写入回滚审计日志
    addAuditLog({
      entityType,
      entityId,
      action: 'rollback',
      beforeValue: currentState ?? undefined,
      afterValue: beforeParsed,
      reason: `回滚到审计日志 ${auditLogId}`
    })

    return { success: true, entityId, message: `已成功回滚 ${entityType} ${entityId}` }
  } catch (e) {
    return { success: false, entityId, message: `回滚失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 清理数据库行中的内部字段（用于审计日志存储） */
function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    // 跳过内部字段
    if (key === 'id' || key === 'created_at' || key === 'updated_at') continue
    result[key] = value
  }
  return result
}