/**
 * 语义搜索 Worker（独立文件，消除 eval:true 安全隐患）
 *
 * 由 semantic.ts 通过 `new Worker(__dirname/semantic.worker.js)` 启动。
 * 职责：加载全库向量到内存缓存，对查询向量做余弦相似度暴力扫描，返回 Top-K。
 *
 * 向量存储格式：BLOB（Float32Array 二进制 buffer），读取零解析。
 */
const { parentPort } = require('worker_threads')

let cache: Array<{ messageId: string; sessionId: string; embedding: Float32Array }> | null = null
let dbPath: string | null = null
let Database: typeof import('better-sqlite3') | null = null

function loadCache(): number {
  if (!Database) {
    Database = require('better-sqlite3')
  }
  if (!dbPath) {
    throw new Error('dbPath not initialized')
  }
  const DbImpl = Database as typeof import('better-sqlite3')
  const db = new DbImpl(dbPath, { readonly: true, fileMustExist: true })
  db.pragma('journal_mode = WAL')
  const rows = db
    .prepare('SELECT message_id, session_id, embedding FROM message_embeddings')
    .all() as Array<{ message_id: string; session_id: string; embedding: Buffer }>
  db.close()
  // BLOB → Float32Array，零解析
  cache = rows.map((r) => ({
    messageId: r.message_id,
    sessionId: r.session_id,
    embedding: new Float32Array(
      r.embedding.buffer,
      r.embedding.byteOffset,
      r.embedding.byteLength / 4
    )
  }))
  return cache.length
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

parentPort!.on('message', (msg: { type: string; dbPath?: string; queryVec?: number[]; limit?: number; threshold?: number }) => {
  if (msg.type === 'init') {
    dbPath = msg.dbPath!
    parentPort!.postMessage({ type: 'ready' })
  } else if (msg.type === 'search') {
    try {
      if (!cache) {
        const n = loadCache()
        parentPort!.postMessage({ type: 'cacheLoaded', count: n })
      }
      const queryVec = new Float32Array(msg.queryVec!)
      const limit = msg.limit || 20
      const threshold = msg.threshold || 0.25

      const scored: Array<{ messageId: string; sessionId: string; score: number }> = []
      for (const row of cache!) {
        const score = cosineSimilarity(queryVec, row.embedding)
        if (score >= threshold) {
          scored.push({ messageId: row.messageId, sessionId: row.sessionId, score })
        }
      }
      scored.sort((a, b) => b.score - a.score)
      const top = scored.slice(0, limit)
      parentPort!.postMessage({ type: 'result', data: top })
    } catch (err) {
      parentPort!.postMessage({ type: 'error', error: (err as Error).message || String(err) })
    }
  } else if (msg.type === 'invalidate') {
    cache = null
  }
})
