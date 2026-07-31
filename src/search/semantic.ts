import { Worker } from 'worker_threads'
import { getDbPath } from '../database/connection'
import { getSession } from '../database/repositories/sessionRepo'
import { getDatabase } from '../database/connection'
import type { AiConfig, SemanticSearchResult } from '@shared/types'

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>
  error?: { message: string }
}

/** 调用 embeddings 接口（单条） */
async function embedQuery(config: AiConfig, text: string): Promise<number[]> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/embeddings`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: [text]
    })
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Embedding API ${resp.status}: ${errText}`)
  }

  const data = (await resp.json()) as EmbeddingResponse
  if (data.error) throw new Error(data.error.message)
  const vec = data.data?.[0]?.embedding
  if (!vec || vec.length === 0) throw new Error('Embedding API 返回空')
  return vec
}

// ===== Worker 池（常驻，缓存向量数据）=====

interface WorkerSearchResult {
  messageId: string
  sessionId: string
  score: number
}

const workerCode = `
const { parentPort } = require('worker_threads')

let cache = null  // { messageId, sessionId, embedding: Float32Array }[]
let dbPath = null
let Database = null

function loadCache() {
  if (!Database) {
    Database = require('better-sqlite3')
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  db.pragma('journal_mode = WAL')
  const rows = db.prepare('SELECT message_id, session_id, embedding FROM message_embeddings').all()
  db.close()
  cache = rows.map(r => ({
    messageId: r.message_id,
    sessionId: r.session_id,
    embedding: new Float32Array(JSON.parse(r.embedding))
  }))
  return cache.length
}

function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length)
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

parentPort.on('message', (msg) => {
  if (msg.type === 'init') {
    dbPath = msg.dbPath
    parentPort.postMessage({ type: 'ready' })
  } else if (msg.type === 'search') {
    try {
      if (!cache) {
        const n = loadCache()
        parentPort.postMessage({ type: 'cacheLoaded', count: n })
      }
      const queryVec = new Float32Array(msg.queryVec)
      const limit = msg.limit || 20
      const threshold = msg.threshold || 0.25

      const scored = []
      for (const row of cache) {
        const score = cosineSimilarity(queryVec, row.embedding)
        if (score >= threshold) {
          scored.push({ messageId: row.messageId, sessionId: row.sessionId, score })
        }
      }
      scored.sort((a, b) => b.score - a.score)
      const top = scored.slice(0, limit)
      parentPort.postMessage({ type: 'result', data: top })
    } catch (err) {
      parentPort.postMessage({ type: 'error', error: err.message || String(err) })
    }
  } else if (msg.type === 'invalidate') {
    cache = null
  }
})
`

let worker: Worker | null = null
let workerReady = false
let useFallback = false

/** 初始化 worker（失败则 fallback 到主进程同步计算） */
function initWorker(): void {
  if (worker || useFallback) return
  try {
    worker = new Worker(workerCode, { eval: true })
    worker.on('message', (msg: { type: string; error?: string }) => {
      if (msg.type === 'ready') {
        workerReady = true
      } else if (msg.type === 'error' && !workerReady) {
        console.warn('[semantic] worker init failed, fallback to sync:', msg.error)
        useFallback = true
      }
    })
    worker.on('error', (err) => {
      console.warn('[semantic] worker error, fallback to sync:', err.message)
      useFallback = true
    })
    worker.postMessage({ type: 'init', dbPath: getDbPath() })
  } catch (err) {
    console.warn('[semantic] worker creation failed, fallback to sync:', err)
    useFallback = true
  }
}

/** 通知 worker 缓存失效（新向量写入后调用） */
export function invalidateEmbeddingCache(): void {
  if (worker) {
    worker.postMessage({ type: 'invalidate' })
  }
}

/** 通过 worker 搜索（异步，不阻塞主进程） */
function searchViaWorker(
  queryVec: number[],
  limit: number,
  threshold: number
): Promise<WorkerSearchResult[]> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('worker not initialized'))
      return
    }
    const handler = (msg: { type: string; data?: WorkerSearchResult[]; error?: string }) => {
      if (msg.type === 'result') {
        worker!.off('message', handler)
        resolve(msg.data ?? [])
      } else if (msg.type === 'error') {
        worker!.off('message', handler)
        reject(new Error(msg.error ?? 'worker search failed'))
      }
    }
    worker.on('message', handler)
    worker.postMessage({ type: 'search', queryVec, limit, threshold })
  })
}

// ===== Fallback：主进程同步计算（worker 不可用时用） =====

interface FallbackRow {
  messageId: string
  sessionId: string
  embedding: number[]
  model: string
}

function cosineSimilarityArr(a: number[], b: number[]): number {
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

function getAllEmbeddingsSync(): FallbackRow[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT message_id, session_id, embedding, model FROM message_embeddings')
    .all() as Array<{ message_id: string; session_id: string; embedding: string; model: string }>
  return rows.map((r) => ({
    messageId: r.message_id,
    sessionId: r.session_id,
    embedding: JSON.parse(r.embedding) as number[],
    model: r.model
  }))
}

function searchFallback(
  queryVec: number[],
  limit: number,
  threshold: number
): WorkerSearchResult[] {
  const all = getAllEmbeddingsSync()
  const scored = all.map((row) => ({
    messageId: row.messageId,
    sessionId: row.sessionId,
    score: cosineSimilarityArr(queryVec, row.embedding)
  }))
  return scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// ===== 生成高亮片段 =====

function buildSnippet(content: string, radius = 80): string {
  if (!content) return ''
  if (content.length <= radius * 2) return content
  return content.slice(0, radius * 2) + '…'
}

// ===== 对外接口 =====

/** 语义搜索 */
export async function semanticSearch(
  query: string,
  config: AiConfig,
  options?: { limit?: number; threshold?: number }
): Promise<SemanticSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // 确保 worker 已初始化
  if (!worker && !useFallback) {
    initWorker()
  }

  const queryVec = await embedQuery(config, trimmed)
  const limit = options?.limit ?? 20
  const threshold = options?.threshold ?? 0.25

  // 通过 worker 或 fallback 计算
  let top: WorkerSearchResult[]
  if (!useFallback && worker) {
    try {
      top = await searchViaWorker(queryVec, limit, threshold)
    } catch (err) {
      console.warn('[semantic] worker search failed, fallback:', err)
      top = searchFallback(queryVec, limit, threshold)
    }
  } else {
    top = searchFallback(queryVec, limit, threshold)
  }

  if (top.length === 0) return []

  // 加载消息内容（批量查询，在主进程）
  const db = getDatabase()
  const ids = top.map((t) => t.messageId)
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT id, content FROM messages WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: string; content: string }>
  const contentMap = new Map(rows.map((r) => [r.id, r.content]))

  // 聚合同一会话的多条命中（取最高分作为会话得分）
  const sessionMap = new Map<string, SemanticSearchResult>()
  for (const hit of top) {
    const session = getSession(hit.sessionId, false)
    if (!session) continue
    const content = contentMap.get(hit.messageId) ?? ''

    const existing = sessionMap.get(hit.sessionId)
    if (existing) {
      if (hit.score > existing.score) {
        existing.score = hit.score
        existing.snippet = buildSnippet(content)
        existing.messageId = hit.messageId
      }
    } else {
      sessionMap.set(hit.sessionId, {
        session,
        messageId: hit.messageId,
        snippet: buildSnippet(content),
        score: hit.score
      })
    }
  }

  return Array.from(sessionMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
