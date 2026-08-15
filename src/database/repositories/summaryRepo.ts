import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { SessionSummary } from '@shared/types'

interface SummaryRow {
  id: string
  session_id: string
  summary: string
  key_points: string | null
  todos: string | null
  knowledge: string | null
  suggested_tags: string | null
  model: string | null
  created_at: string
  updated_at: string
}

/** 安全解析 JSON 数组，损坏时返回空数组，避免单个坏行崩溃整列加载 */
function safeJsonArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as string[]) : []
  } catch (e) {
    console.warn('[summaryRepo] JSON.parse 失败，返回空数组:', e)
    return []
  }
}

function rowToSummary(row: SummaryRow): SessionSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    summary: row.summary,
    keyPoints: safeJsonArray(row.key_points),
    todos: safeJsonArray(row.todos),
    knowledge: row.knowledge ? safeJsonArray(row.knowledge) : undefined,
    suggestedTags: row.suggested_tags ? safeJsonArray(row.suggested_tags) : undefined,
    model: row.model ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 获取会话的总结 */
export function getSummary(sessionId: string): SessionSummary | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM session_summaries WHERE session_id = ?')
    .get(sessionId) as SummaryRow | undefined
  return row ? rowToSummary(row) : null
}

/** 创建或更新总结（upsert）。session_id 有 UNIQUE 约束，单条 ON CONFLICT 原子完成，消除 SELECT 探测 */
export function upsertSummary(
  sessionId: string,
  data: {
    summary: string
    keyPoints: string[]
    todos: string[]
    knowledge?: string[]
    suggestedTags?: string[]
    model?: string
  }
): SessionSummary {
  const db = getDatabase()
  const now = new Date().toISOString()

  const knowledgeJson = data.knowledge ? JSON.stringify(data.knowledge) : null
  const suggestedTagsJson = data.suggestedTags ? JSON.stringify(data.suggestedTags) : null

  // 冲突时保留原 id / created_at（与旧 UPDATE 分支行为一致）
  db.prepare(
    `INSERT INTO session_summaries
     (id, session_id, summary, key_points, todos, knowledge, suggested_tags, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       summary = excluded.summary,
       key_points = excluded.key_points,
       todos = excluded.todos,
       knowledge = excluded.knowledge,
       suggested_tags = excluded.suggested_tags,
       model = excluded.model,
       updated_at = excluded.updated_at`
  ).run(
    uuidv4(),
    sessionId,
    data.summary,
    JSON.stringify(data.keyPoints),
    JSON.stringify(data.todos),
    knowledgeJson,
    suggestedTagsJson,
    data.model ?? null,
    now,
    now
  )
  return getSummary(sessionId)!
}

export function deleteSummary(sessionId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM session_summaries WHERE session_id = ?').run(sessionId)
}
