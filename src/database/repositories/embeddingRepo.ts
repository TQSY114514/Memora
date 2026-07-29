import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { Message } from '@shared/types'

interface EmbeddingRow {
  id: string
  message_id: string
  session_id: string
  embedding: string
  model: string
  dim: number
  created_at: string
}

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  model: string | null
  msg_order: number
  created_at: string
}

/** 写入单条消息的向量（已存在则覆盖） */
export function upsertEmbedding(
  messageId: string,
  sessionId: string,
  embedding: number[],
  model: string
): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  const dim = embedding.length
  const json = JSON.stringify(embedding)

  const existing = db
    .prepare('SELECT id FROM message_embeddings WHERE message_id = ?')
    .get(messageId) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `UPDATE message_embeddings
       SET embedding = ?, model = ?, dim = ?, created_at = ?
       WHERE id = ?`
    ).run(json, model, dim, now, existing.id)
    return
  }

  db.prepare(
    `INSERT INTO message_embeddings (id, message_id, session_id, embedding, model, dim, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), messageId, sessionId, json, model, dim, now)
}

/** 批量写入向量（事务） */
export function upsertEmbeddings(
  rows: Array<{ messageId: string; sessionId: string; embedding: number[]; model: string }>
): void {
  const db = getDatabase()
  const tx = db.transaction(() => {
    for (const r of rows) upsertEmbedding(r.messageId, r.sessionId, r.embedding, r.model)
  })
  tx()
}

/** 删除会话所有向量 */
export function deleteSessionEmbeddings(sessionId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM message_embeddings WHERE session_id = ?').run(sessionId)
}

/** 删除单条消息向量 */
export function deleteEmbeddingByMessage(messageId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM message_embeddings WHERE message_id = ?').run(messageId)
}

/** 判断会话是否已建立向量索引 */
export function hasSessionEmbeddings(sessionId: string): boolean {
  const db = getDatabase()
  const row = db
    .prepare('SELECT 1 FROM message_embeddings WHERE session_id = ? LIMIT 1')
    .get(sessionId)
  return !!row
}

/** 统计会话已索引的消息数 */
export function countSessionEmbeddings(sessionId: string): number {
  const db = getDatabase()
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM message_embeddings WHERE session_id = ?')
    .get(sessionId) as { n: number } | undefined
  return row?.n ?? 0
}

/** 加载会话内全部向量（供本地相似度计算） */
export function getSessionEmbeddings(sessionId: string): Array<{
  messageId: string
  embedding: number[]
  model: string
}> {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM message_embeddings WHERE session_id = ?')
    .all(sessionId) as EmbeddingRow[]
  return rows.map((r) => ({
    messageId: r.message_id,
    embedding: JSON.parse(r.embedding) as number[],
    model: r.model
  }))
}

/** 加载全库向量（用于跨会话语义搜索） */
export function getAllEmbeddings(): Array<{
  messageId: string
  sessionId: string
  embedding: number[]
  model: string
}> {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM message_embeddings')
    .all() as EmbeddingRow[]
  return rows.map((r) => ({
    messageId: r.message_id,
    sessionId: r.session_id,
    embedding: JSON.parse(r.embedding) as number[],
    model: r.model
  }))
}

/** 获取尚未建立向量的消息（用于补齐索引） */
export function getMessagesWithoutEmbeddings(sessionId: string): Message[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT m.id, m.session_id, m.role, m.content, m.model, m.msg_order, m.created_at
       FROM messages m
       LEFT JOIN message_embeddings e ON e.message_id = m.id
       WHERE m.session_id = ? AND e.id IS NULL
       ORDER BY m.msg_order ASC`
    )
    .all(sessionId) as MessageRow[]
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role as Message['role'],
    content: r.content,
    model: r.model ?? undefined,
    order: r.msg_order,
    createdAt: r.created_at
  }))
}
