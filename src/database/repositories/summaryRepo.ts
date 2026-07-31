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

function rowToSummary(row: SummaryRow): SessionSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    summary: row.summary,
    keyPoints: row.key_points ? (JSON.parse(row.key_points) as string[]) : [],
    todos: row.todos ? (JSON.parse(row.todos) as string[]) : [],
    knowledge: row.knowledge ? (JSON.parse(row.knowledge) as string[]) : undefined,
    suggestedTags: row.suggested_tags ? (JSON.parse(row.suggested_tags) as string[]) : undefined,
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

/** 创建或更新总结（upsert） */
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
  const existing = getSummary(sessionId)
  const now = new Date().toISOString()

  const knowledgeJson = data.knowledge ? JSON.stringify(data.knowledge) : null
  const suggestedTagsJson = data.suggestedTags ? JSON.stringify(data.suggestedTags) : null

  if (existing) {
    db.prepare(
      `UPDATE session_summaries
       SET summary = ?, key_points = ?, todos = ?, knowledge = ?, suggested_tags = ?, model = ?, updated_at = ?
       WHERE session_id = ?`
    ).run(
      data.summary,
      JSON.stringify(data.keyPoints),
      JSON.stringify(data.todos),
      knowledgeJson,
      suggestedTagsJson,
      data.model ?? null,
      now,
      sessionId
    )
    return getSummary(sessionId)!
  }

  const id = uuidv4()
  db.prepare(
    `INSERT INTO session_summaries
     (id, session_id, summary, key_points, todos, knowledge, suggested_tags, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
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
