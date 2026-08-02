/**
 * Preference Repository
 *
 * 用户偏好（Preference）的 CRUD + 记忆生命周期管理：
 * - 创建时自动检测冲突（同 subject 不同 value → 旧记忆标记 superseded）
 * - 置信度随访问次数增长，随时间衰减
 * - 支持 FTS 搜索
 */
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import { buildUpdateSets } from './sqlHelpers'
import { segment } from '@search/segmenter'
import { buildFtsQuery } from '../../search/query'
import { addAuditLog } from './auditRepo'
import type { Preference, PreferenceStatus, PreferenceSource, UserProfile, ConflictReport } from '@shared/types'

interface PreferenceRow {
  id: string
  workspace_id: string
  session_id: string | null
  subject: string
  value: string
  context: string | null
  confidence: number
  source: string
  status: string
  superseded_by: string | null
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  access_count: number
}

function rowToPref(row: PreferenceRow): Preference {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id ?? undefined,
    subject: row.subject,
    value: row.value,
    context: row.context ?? undefined,
    confidence: row.confidence,
    source: row.source as PreferenceSource,
    status: row.status as PreferenceStatus,
    supersededBy: row.superseded_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at ?? undefined,
    accessCount: row.access_count
  }
}

/** FTS 索引 */
function indexPrefForSearch(prefId: string, subject: string, value: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM preferences_fts WHERE pref_id = ?').run(prefId)
  db.prepare('INSERT INTO preferences_fts (pref_id, subject, value) VALUES (?, ?, ?)').run(
    prefId, segment(subject), segment(value)
  )
}

function unindexPref(prefId: string): void {
  getDatabase().prepare('DELETE FROM preferences_fts WHERE pref_id = ?').run(prefId)
}

/**
 * 创建偏好——核心：自动冲突检测（v1.8 #9 细化）
 *
 * 冲突判定：同 workspace + 同 subject + 同 context 才判冲突。
 * - 不同 context 可并存（"写脚本用 Python" 和 "系统编程用 Rust" 不冲突）
 * - 同 value → 增加置信度（复现增强）
 * - 不同 value → 旧记忆标记 superseded
 */
export function createPreference(input: {
  workspaceId: string
  sessionId?: string
  subject: string
  value: string
  /** 偏好上下文（v1.8 #9）：同 subject 不同 context 可并存，不判冲突 */
  context?: string
  confidence?: number
  source?: PreferenceSource
}): Preference {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()
  const confidence = input.confidence ?? 0.5
  const source = input.source ?? 'manual'
  const ctx = input.context ?? null

  // 宪法条目（source='constitution'）：跳过冲突检测，直接插入。
  // 宪法条目之间不互相冲突，且始终为 active。
  if (source === 'constitution') {
    db.prepare(
      `INSERT INTO preferences
       (id, workspace_id, session_id, subject, value, context, confidence, source, status, superseded_by,
        created_at, updated_at, last_accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, 0)`
    ).run(
      id, input.workspaceId, input.sessionId ?? null,
      input.subject, input.value, ctx, confidence, source,
      now, now, now
    )
    try { indexPrefForSearch(id, input.subject, input.value) } catch (e) {
      console.error('[preferencesRepo] FTS 索引失败:', e)
    }
    const constitutionPref = getPreference(id)!
    addAuditLog({
      entityType: 'preference',
      entityId: id,
      action: 'create',
      afterValue: constitutionPref as unknown as Record<string, unknown>,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId
    })
    return constitutionPref
  }

  // 跟踪重复值匹配的已有 ID（事务内 return 提前退出时，外层需返回已有记录）
  let existingId: string | null = null
  // 审计追踪：被取代的旧偏好 / 被置信度增强的旧偏好
  const supersededOlds: PreferenceRow[] = []
  let boostedOld: PreferenceRow | null = null

  const tx = db.transaction(() => {
    // 冲突检测：查找同 workspace + 同 subject + 同 context 的 active 偏好
    // context 为 NULL 时用 IS NULL 匹配（SQLite 中 = NULL 不成立）
    const existing = db
      .prepare(
        `SELECT * FROM preferences
         WHERE workspace_id = ? AND subject = ? AND status = 'active'
           AND (context IS ? OR (context IS NOT NULL AND context = ?))`
      )
      .all(input.workspaceId, input.subject, ctx, ctx) as PreferenceRow[]

    for (const old of existing) {
      if (old.value.toLowerCase() === input.value.toLowerCase()) {
        // 相同 value → 增加置信度（复现增强），不创建新记录
        const newConfidence = Math.min(1.0, old.confidence + 0.15)
        db.prepare(
          `UPDATE preferences
           SET confidence = ?, access_count = access_count + 1,
               last_accessed_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(newConfidence, now, now, old.id)
        existingId = old.id
        boostedOld = old
        return
      }

      // 不同 value → 旧记忆标记 superseded
      db.prepare(
        `UPDATE preferences
         SET status = 'superseded', superseded_by = ?, updated_at = ?
         WHERE id = ?`
      ).run(id, now, old.id)
      supersededOlds.push(old)
    }

    // 创建新偏好
    db.prepare(
      `INSERT INTO preferences
       (id, workspace_id, session_id, subject, value, context, confidence, source, status, superseded_by,
        created_at, updated_at, last_accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, 0)`
    ).run(
      id, input.workspaceId, input.sessionId ?? null,
      input.subject, input.value, ctx, confidence, source,
      now, now, now
    )
  })
  tx()

  // 重复值匹配：返回已有记录（事务内已更新置信度，FTS 也已在事务内更新）
  if (existingId) {
    // 审计：置信度增强（同 value 复现）
    if (boostedOld) {
      const updated = getPreference(existingId)!
      addAuditLog({
        entityType: 'preference',
        entityId: existingId,
        action: 'update',
        beforeValue: rowToPref(boostedOld) as unknown as Record<string, unknown>,
        afterValue: updated as unknown as Record<string, unknown>,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        reason: 'confidence boost: same value repeated'
      })
    }
    return getPreference(existingId)!
  }

  // FTS 索引（新记录，事务外执行避免索引失败回滚写入）
  try { indexPrefForSearch(id, input.subject, input.value) } catch (e) {
    console.error('[preferencesRepo] FTS 索引失败:', e)
  }

  const newPref = getPreference(id)!

  // 审计：旧偏好被取代（不同 value 冲突）
  for (const old of supersededOlds) {
    addAuditLog({
      entityType: 'preference',
      entityId: old.id,
      action: 'supersede',
      beforeValue: rowToPref(old) as unknown as Record<string, unknown>,
      afterValue: newPref as unknown as Record<string, unknown>,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      reason: 'conflict: same subject different value'
    })
  }

  // 审计：新偏好创建
  addAuditLog({
    entityType: 'preference',
    entityId: id,
    action: 'create',
    afterValue: newPref as unknown as Record<string, unknown>,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId
  })

  return newPref
}

/** 获取单个偏好 */
export function getPreference(id: string): Preference | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM preferences WHERE id = ?').get(id) as PreferenceRow | undefined
  return row ? rowToPref(row) : null
}

/** 列出偏好（按工作区 + 可选状态筛选） */
export function listPreferences(options?: {
  workspaceId?: string
  status?: PreferenceStatus
  subject?: string
  limit?: number
  offset?: number
}): Preference[] {
  const db = getDatabase()
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (options?.workspaceId) {
    conditions.push('workspace_id = @workspaceId')
    params.workspaceId = options.workspaceId
  }
  if (options?.status) {
    conditions.push('status = @status')
    params.status = options.status
  }
  if (options?.subject) {
    conditions.push('subject = @subject')
    params.subject = options.subject
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit ?? 1000
  const offset = options?.offset ?? 0

  const rows = db
    .prepare(
      `SELECT * FROM preferences ${where}
       ORDER BY subject ASC, confidence DESC, created_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset }) as PreferenceRow[]

  return rows.map(rowToPref)
}

/** 更新偏好 */
export function updatePreference(
  id: string,
  patch: Partial<Pick<Preference, 'value' | 'confidence' | 'status' | 'subject' | 'context'>>
): Preference | null {
  const db = getDatabase()
  const before = getPreference(id)
  if (!before) return null

  const { sets, params } = buildUpdateSets(patch, {
    subject: 'subject',
    value: 'value',
    context: 'context',
    confidence: 'confidence',
    status: 'status'
  })
  if (sets.length === 0) return before

  sets.push('updated_at = @nowIso')
  db.prepare(`UPDATE preferences SET ${sets.join(', ')} WHERE id = @id`).run({ ...params, id, nowIso: new Date().toISOString() })

  const updated = getPreference(id)
  if (updated && (patch.subject !== undefined || patch.value !== undefined)) {
    try { indexPrefForSearch(updated.id, updated.subject, updated.value) } catch (e) {
      console.error('[preferencesRepo] FTS 重建失败:', e)
    }
  }

  // 审计：偏好更新（before/after）
  if (updated) {
    addAuditLog({
      entityType: 'preference',
      entityId: id,
      action: 'update',
      beforeValue: before as unknown as Record<string, unknown>,
      afterValue: updated as unknown as Record<string, unknown>,
      workspaceId: before.workspaceId,
      sessionId: before.sessionId
    })
  }

  return updated
}

/** 删除偏好 */
export function deletePreference(id: string): void {
  const db = getDatabase()
  const before = getPreference(id)
  const tx = db.transaction(() => {
    unindexPref(id)
    db.prepare('DELETE FROM preferences WHERE id = ?').run(id)
  })
  tx()

  // 审计：偏好删除（beforeValue 记录被删除的状态）
  if (before) {
    addAuditLog({
      entityType: 'preference',
      entityId: id,
      action: 'delete',
      beforeValue: before as unknown as Record<string, unknown>,
      workspaceId: before.workspaceId,
      sessionId: before.sessionId
    })
  }
}

/**
 * 遗忘（软删除）：将偏好标记为 archived
 * 不是物理删除，保留审计痕迹
 *
 * 注：直接执行 UPDATE 而非调用 updatePreference，避免重复记录 'update' 审计日志。
 */
export function archivePreference(id: string): Preference | null {
  const db = getDatabase()
  const before = getPreference(id)
  if (!before) return null

  db.prepare(
    `UPDATE preferences SET status = 'archived', updated_at = ? WHERE id = ?`
  ).run(new Date().toISOString(), id)

  const archived = getPreference(id)

  // 审计：偏好归档（beforeValue 记录归档前的状态）
  if (archived) {
    addAuditLog({
      entityType: 'preference',
      entityId: id,
      action: 'archive',
      beforeValue: before as unknown as Record<string, unknown>,
      afterValue: archived as unknown as Record<string, unknown>,
      workspaceId: before.workspaceId,
      sessionId: before.sessionId
    })
  }

  return archived
}

/**
 * 置信度衰减：将超过 N 天未访问的 active 偏好的 confidence 降低
 * 衰减到 0 以下时自动标记为 archived
 *
 * @param daysThreshold 未访问天数阈值（默认 30 天）
 * @param decayRate 每次衰减量（默认 0.1）
 * @returns 衰减的偏好数量
 */
export function decayConfidence(
  workspaceId?: string,
  daysThreshold = 30,
  decayRate = 0.1
): number {
  const db = getDatabase()
  const now = new Date()
  const threshold = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000).toISOString()

  const wsFilter = workspaceId ? 'AND workspace_id = ?' : ''
  const params = workspaceId ? [threshold, workspaceId] : [threshold]

  // 查找需要衰减的偏好（宪法条目永不衰减）
  const rows = db
    .prepare(
      `SELECT id, confidence FROM preferences
       WHERE status = 'active'
         AND source != 'constitution'
         AND (last_accessed_at < ? OR last_accessed_at IS NULL)
       ${wsFilter}`
    )
    .all(...params) as Array<{ id: string; confidence: number }>

  if (rows.length === 0) return 0

  const nowIso = now.toISOString()
  let count = 0
  const tx = db.transaction(() => {
    const updateStmt = db.prepare(
      `UPDATE preferences
       SET confidence = ?, updated_at = ?
       WHERE id = ?`
    )
    const archiveStmt = db.prepare(
      `UPDATE preferences SET status = 'archived', updated_at = ? WHERE id = ?`
    )

    for (const row of rows) {
      const newConfidence = Math.max(0, row.confidence - decayRate)
      if (newConfidence <= 0.05) {
        // 置信度太低 → 归档
        archiveStmt.run(nowIso, row.id)
      } else {
        updateStmt.run(newConfidence, nowIso, row.id)
      }
      count++
    }
  })
  tx()
  return count
}

/** 访问偏好时更新访问时间和计数 */
export function touchPreference(id: string): void {
  const db = getDatabase()
  db.prepare(
    `UPDATE preferences
     SET access_count = access_count + 1, last_accessed_at = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), id)
}

/** FTS 搜索偏好 */
export function searchPreferences(
  query: string,
  options?: { workspaceId?: string; limit?: number }
): Preference[] {
  const db = getDatabase()
  const ftsQuery = buildFtsQuery(query, 'OR')
  if (!ftsQuery) return []
  const limit = options?.limit ?? 50

  let sql = `
    SELECT p.* FROM preferences p
    JOIN preferences_fts ON p.id = preferences_fts.pref_id
    WHERE preferences_fts MATCH ? AND p.status != 'archived'
  `
  const params: unknown[] = [ftsQuery]
  if (options?.workspaceId) {
    sql += ' AND p.workspace_id = ?'
    params.push(options.workspaceId)
  }
  sql += ' ORDER BY p.confidence DESC, preferences_fts.rank LIMIT ?'
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as PreferenceRow[]
  return rows.map(rowToPref)
}

/**
 * 获取用户画像（按 subject 分组的偏好聚合）
 * 用于 MCP memory_profile 工具
 *
 * 宪法条目（source='constitution'）从常规偏好中分离出来，
 * 作为第一个分组（subject='constitution'）置顶返回，以便 AI 工具优先读取。
 */
export function getUserProfile(workspaceId: string): UserProfile {
  const active = listPreferences({ workspaceId, status: 'active' })
  const total = listPreferences({ workspaceId }).length

  // 分离宪法条目与常规偏好
  const constitution = active.filter((p) => p.source === 'constitution')
  const regular = active.filter((p) => p.source !== 'constitution')

  // 按 subject 分组（常规偏好）
  const subjectMap = new Map<string, Preference[]>()
  for (const pref of regular) {
    const group = subjectMap.get(pref.subject) || []
    group.push(pref)
    subjectMap.set(pref.subject, group)
  }

  const bySubject = Array.from(subjectMap.entries()).map(([subject, preferences]) => ({
    subject,
    preferences: preferences.sort((a, b) => b.confidence - a.confidence)
  }))

  // 宪法条目置顶（subject='constitution'）
  if (constitution.length > 0) {
    bySubject.unshift({
      subject: 'constitution',
      preferences: constitution.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
  }

  return {
    workspaceId,
    totalPreferences: total,
    activePreferences: active.length,
    bySubject
  }
}

/**
 * 获取 AI 宪法条目（source='constitution' 且 status='active'）
 * 按 created_at 升序返回（保持条目定义顺序）。
 * workspaceId 可空：为空时返回所有工作区的宪法条目（全局宪法）。
 */
export function getConstitution(workspaceId?: string): Preference[] {
  const db = getDatabase()
  const rows = workspaceId
    ? (db
        .prepare(
          `SELECT * FROM preferences
           WHERE source = 'constitution' AND status = 'active' AND workspace_id = ?
           ORDER BY created_at ASC`
        )
        .all(workspaceId) as PreferenceRow[])
    : (db
        .prepare(
          `SELECT * FROM preferences
           WHERE source = 'constitution' AND status = 'active'
           ORDER BY created_at ASC`
        )
        .all() as PreferenceRow[])
  return rows.map(rowToPref)
}

/** 统计 */
export function countPreferences(workspaceId: string): {
  total: number
  active: number
  superseded: number
  archived: number
} {
  const db = getDatabase()
  const total = (db.prepare('SELECT COUNT(*) as n FROM preferences WHERE workspace_id = ?').get(workspaceId) as { n: number }).n
  const active = (db.prepare("SELECT COUNT(*) as n FROM preferences WHERE workspace_id = ? AND status = 'active'").get(workspaceId) as { n: number }).n
  const superseded = (db.prepare("SELECT COUNT(*) as n FROM preferences WHERE workspace_id = ? AND status = 'superseded'").get(workspaceId) as { n: number }).n
  const archived = (db.prepare("SELECT COUNT(*) as n FROM preferences WHERE workspace_id = ? AND status = 'archived'").get(workspaceId) as { n: number }).n
  return { total, active, superseded, archived }
}

/**
 * 冲突检测（v1.6）
 * 扫描同 subject 下有多个不同 value 的 active 偏好，报告冲突。
 * 用于在 UI 中提示用户解决矛盾偏好。
 */
export function detectConflicts(workspaceId?: string): ConflictReport[] {
  const db = getDatabase()
  const wsFilter = Boolean(workspaceId)
  const params = workspaceId ? [workspaceId] : []

  // 查找同 subject 下有多个不同 value 的 active 偏好
  const rows = db
    .prepare(
      `SELECT subject, COUNT(DISTINCT value) as value_count
       FROM preferences
       WHERE status = 'active' ${wsFilter ? 'AND workspace_id = ?' : ''}
       GROUP BY subject
       HAVING value_count > 1`
    )
    .all(...params) as Array<{ subject: string; value_count: number }>

  if (rows.length === 0) return []

  const reports: ConflictReport[] = []

  for (const row of rows) {
    const prefs = db
      .prepare(
        `SELECT * FROM preferences
         WHERE subject = ? AND status = 'active'
         ${wsFilter ? 'AND workspace_id = ?' : ''}
         ORDER BY created_at DESC`
      )
      .all(workspaceId ? [row.subject, workspaceId] : [row.subject]) as PreferenceRow[]

    if (prefs.length < 2) continue

    const conflicts: ConflictReport['conflicts'] = []
    const uniqueValues = new Map<string, PreferenceRow[]>()

    for (const p of prefs) {
      const key = p.value.toLowerCase()
      const group = uniqueValues.get(key) || []
      group.push(p)
      uniqueValues.set(key, group)
    }

    const groups = Array.from(uniqueValues.values())
    if (groups.length < 2) continue

    // 取每组中置信度最高的作为代表
    const representatives = groups
      .map((group) => group.sort((a, b) => b.confidence - a.confidence)[0])
      .sort((a, b) => b.confidence - a.confidence)

    // 生成冲突对：最高置信度 vs 其他
    const primary = rowToPref(representatives[0])
    for (let i = 1; i < representatives.length; i++) {
      conflicts.push({
        preferenceA: primary,
        preferenceB: rowToPref(representatives[i]),
        reason: `同 subject '${row.subject}' 不同 value: '${primary.value}' vs '${representatives[i].value}'`
      })
    }

    reports.push({
      subject: row.subject,
      conflicts
    })
  }

  return reports
}
