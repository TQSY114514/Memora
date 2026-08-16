import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { Message } from '@shared/types'

/** 允许的向量维度范围（1-8192），超出则拒绝写入 */
const MIN_DIM = 1
const MAX_DIM = 8192

/** 校验向量维度合法性 */
function validateDim(embedding: number[]): number {
  const dim = embedding.length
  if (dim < MIN_DIM || dim > MAX_DIM) {
    throw new Error(`Invalid embedding dimension: ${dim} (must be ${MIN_DIM}-${MAX_DIM})`)
  }
  return dim
}

interface EmbeddingRow {
  id: string
  message_id: string
  session_id: string
  embedding: Buffer
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
  const dim = validateDim(embedding)
  // 存为 BLOB：Float32Array 的二进制 buffer，读取零解析
  const buf = Buffer.from(new Float32Array(embedding).buffer)

  const existing = db
    .prepare('SELECT id FROM message_embeddings WHERE message_id = ?')
    .get(messageId) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `UPDATE message_embeddings
       SET embedding = ?, model = ?, dim = ?, created_at = ?
       WHERE id = ?`
    ).run(buf, model, dim, now, existing.id)
    return
  }

  db.prepare(
    `INSERT INTO message_embeddings (id, message_id, session_id, embedding, model, dim, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), messageId, sessionId, buf, model, dim, now)
}

/** 校验 v14 唯一索引是否就绪（upsertEmbeddings 的 ON CONFLICT(message_id) 依赖它）。
 *  首次校验成功后缓存结果，避免每次 upsert 都跑一次 PRAGMA；校验失败则每次都抛，
 *  直到迁移补齐索引为止。 */
let messageUniqueIndexVerified = false
function ensureMessageUniqueIndex(): void {
  if (messageUniqueIndexVerified) return
  const db = getDatabase()
  const indexes = db
    .prepare(`PRAGMA index_list('message_embeddings')`)
    .all() as Array<{ name: string; unique: number }>
  const ok = indexes.some((i) => i.name === 'idx_embeddings_message_unique' && i.unique === 1)
  if (!ok) {
    throw new Error(
      'message_embeddings 缺少 message_id 唯一索引（idx_embeddings_message_unique）：批量向量写入依赖该索引执行原子 upsert。' +
        '请先运行 v14 数据库迁移（应用启动时自动执行），或手动执行 ' +
        'CREATE UNIQUE INDEX idx_embeddings_message_unique ON message_embeddings(message_id)'
    )
  }
  messageUniqueIndexVerified = true
}

/** 批量写入向量（事务 + 单条预编译 ON CONFLICT upsert）
 *  依赖 migration v14 的 message_id 唯一索引，原子完成"存在则覆盖"，消除逐行 SELECT 探测 */
export function upsertEmbeddings(
  rows: Array<{ messageId: string; sessionId: string; embedding: number[]; model: string }>
): void {
  ensureMessageUniqueIndex()
  const db = getDatabase()
  const stmt = db.prepare(
    `INSERT INTO message_embeddings (id, message_id, session_id, embedding, model, dim, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(message_id) DO UPDATE SET
       embedding = excluded.embedding,
       model = excluded.model,
       dim = excluded.dim,
       created_at = excluded.created_at`
  )
  const tx = db.transaction(() => {
    for (const r of rows) {
      const dim = validateDim(r.embedding)
      // 存为 BLOB：Float32Array 的二进制 buffer，读取零解析
      const buf = Buffer.from(new Float32Array(r.embedding).buffer)
      stmt.run(uuidv4(), r.messageId, r.sessionId, buf, r.model, dim, new Date().toISOString())
    }
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

/** BLOB buffer → number[]（Float32Array 二进制还原）。损坏的 buffer 返回空数组。 */
function bufferToNumbers(buf: Buffer): number[] {
  // 校验字节长度是 4 的整数倍，否则 Float32Array 构造器抛 RangeError
  if (buf.byteLength === 0 || buf.byteLength % 4 !== 0) {
    return []
  }
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  return Array.from(arr)
}

/** BLOB buffer → Float32Array 零拷贝视图（存储时即按 Float32Array 小端写入，视图即原始值）。
 *  损坏的 buffer 返回空 Float32Array。 */
function bufferToFloat32(buf: Buffer): Float32Array {
  if (buf.byteLength === 0 || buf.byteLength % 4 !== 0) {
    return new Float32Array(0)
  }
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
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
    embedding: bufferToNumbers(r.embedding),
    model: r.model
  }))
}

/** 加载全库向量（用于跨会话语义搜索）。embedding 为 Float32Array 零拷贝视图（省一次 Array 拷贝） */
export function getAllEmbeddings(): Array<{
  messageId: string
  sessionId: string
  embedding: Float32Array
  model: string
}> {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM message_embeddings')
    .all() as EmbeddingRow[]
  return rows.map((r) => ({
    messageId: r.message_id,
    sessionId: r.session_id,
    embedding: bufferToFloat32(r.embedding),
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
