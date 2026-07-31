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
import { segment } from '@search/segmenter'
import type { Preference, PreferenceStatus, PreferenceSource, UserProfile } from '@shared/types'

interface PreferenceRow {
  id: string
  workspace_id: string
  session_id: string | null
  subject: string
  value: string
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
 * 创建偏好——核心：自动冲突检测
 *
 * 如果同 workspace + 同 subject 已有 active 偏好但 value 不同，
 * 则将旧偏好标记为 superseded，并记录 superseded_by 关系。
 * 如果 value 相同，则增加已有偏好的 confidence（复现增强）。
 */
export function createPreference(input: {
  workspaceId: string
  sessionId?: string
  subject: string
  value: string
  confidence?: number
  source?: PreferenceSource
}): Preference {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()
  const confidence = input.confidence ?? 0.5
  const source = input.source ?? 'manual'

  const tx = db.transaction(() => {
    // 冲突检测：查找同 workspace + 同 subject 的 active 偏好
    const existing = db
      .prepare(
        `SELECT * FROM preferences
         WHERE workspace_id = ? AND subject = ? AND status = 'active'`
      )
      .all(input.workspaceId, input.subject) as PreferenceRow[]

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
        // 更新 FTS
        try { indexPrefForSearch(old.id, old.subject, old.value) } catch { /* ignore */ }
        return
      }

      // 不同 value → 旧记忆标记 superseded
      db.prepare(
        `UPDATE preferences
         SET status = 'superseded', superseded_by = ?, updated_at = ?
         WHERE id = ?`
      ).run(id, now, old.id)
    }

    // 创建新偏好
    db.prepare(
      `INSERT INTO preferences
       (id, workspace_id, session_id, subject, value, confidence, source, status, superseded_by,
        created_at, updated_at, last_accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, 0)`
    ).run(
      id, input.workspaceId, input.sessionId ?? null,
      input.subject, input.value, confidence, source,
      now, now, now
    )
  })
  tx()

  // FTS 索引
  try { indexPrefForSearch(id, input.subject, input.value) } catch (e) {
    console.error('[preferencesRepo] FTS 索引失败:', e)
  }

  return getPreference(id)!
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
  patch: Partial<Pick<Preference, 'value' | 'confidence' | 'status' | 'subject'>>
): Preference | null {
  const db = getDatabase()
  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (patch.subject !== undefined) { sets.push('subject = @subject'); params.subject = patch.subject }
  if (patch.value !== undefined) { sets.push('value = @value'); params.value = patch.value }
  if (patch.confidence !== undefined) { sets.push('confidence = @confidence'); params.confidence = patch.confidence }
  if (patch.status !== undefined) { sets.push('status = @status'); params.status = patch.status }
  if (sets.length === 0) return getPreference(id)

  sets.push("updated_at = datetime('now')")
  db.prepare(`UPDATE preferences SET ${sets.join(', ')} WHERE id = @id`).run(params)

  const updated = getPreference(id)
  if (updated && (patch.subject !== undefined || patch.value !== undefined)) {
    try { indexPrefForSearch(updated.id, updated.subject, updated.value) } catch (e) {
      console.error('[preferencesRepo] FTS 重建失败:', e)
    }
  }
  return updated
}

/** 删除偏好 */
export function deletePreference(id: string): void {
  const db = getDatabase()
  const tx = db.transaction(() => {
    unindexPref(id)
    db.prepare('DELETE FROM preferences WHERE id = ?').run(id)
  })
  tx()
}

/**
 * 遗忘（软删除）：将偏好标记为 archived
 * 不是物理删除，保留审计痕迹
 */
export function archivePreference(id: string): Preference | null {
  return updatePreference(id, { status: 'archived' })
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

  // 查找需要衰减的偏好
  const rows = db
    .prepare(
      `SELECT id, confidence FROM preferences
       WHERE status = 'active'
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
  const terms = segment(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const ftsQuery = terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR ')
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
 */
export function getUserProfile(workspaceId: string): UserProfile {
  const active = listPreferences({ workspaceId, status: 'active' })
  const total = listPreferences({ workspaceId }).length

  // 按 subject 分组
  const subjectMap = new Map<string, Preference[]>()
  for (const pref of active) {
    const group = subjectMap.get(pref.subject) || []
    group.push(pref)
    subjectMap.set(pref.subject, group)
  }

  const bySubject = Array.from(subjectMap.entries()).map(([subject, preferences]) => ({
    subject,
    preferences: preferences.sort((a, b) => b.confidence - a.confidence)
  }))

  return {
    workspaceId,
    totalPreferences: total,
    activePreferences: active.length,
    bySubject
  }
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
