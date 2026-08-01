import { Worker } from 'worker_threads'
import { join } from 'path'
import { createHash } from 'crypto'
import { getDbPath } from '../database/connection'
import { getSession } from '../database/repositories/sessionRepo'
import { getDatabase } from '../database/connection'
import { embedQuery } from '../ai/apiClient'
import { cosineSimilarity } from '@shared/math'
import type { AiConfig, SemanticSearchResult } from '@shared/types'

// ===== 查询向量 LRU 缓存（避免重复 embedding API 调用）=====

interface EmbeddingCacheEntry {
  embedding: number[]
  timestamp: number
}

const EMBEDDING_CACHE_MAX = 1000
const EMBEDDING_CACHE_TTL = 30 * 60 * 1000  // 30 分钟
const embeddingCache = new Map<string, EmbeddingCacheEntry>()

/** 生成缓存 key：provider + model + text 的哈希 */
function embeddingCacheKey(config: AiConfig, text: string): string {
  const raw = `${config.provider}:${config.embeddingModel}:${text}`
  return createHash('sha256').update(raw).digest('hex')
}

/** 从缓存获取 embedding，未命中返回 undefined */
function getCachedEmbedding(key: string): number[] | undefined {
  const entry = embeddingCache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.timestamp > EMBEDDING_CACHE_TTL) {
    embeddingCache.delete(key)
    return undefined
  }
  return entry.embedding
}

/** 写入缓存，LRU 淘汰 */
function setCachedEmbedding(key: string, embedding: number[]): void {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    // 淘汰最旧的条目（Map 保持插入顺序）
    const oldest = embeddingCache.keys().next().value
    if (oldest) embeddingCache.delete(oldest)
  }
  embeddingCache.set(key, { embedding, timestamp: Date.now() })
}

// ===== Worker 池（常驻，缓存向量数据）=====

interface WorkerSearchResult {
  messageId: string
  sessionId: string
  score: number
}

let worker: Worker | null = null
let workerReady = false
let useFallback = false

/** 初始化 worker（失败则 fallback 到主进程同步计算） */
function initWorker(): void {
  if (worker || useFallback) return
  try {
    // 独立 worker 文件，消除 eval:true 安全隐患
    worker = new Worker(join(__dirname, 'semantic.worker.js'))
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
/** 终止 worker 线程，应用退出时调用，避免阻止 Electron 干净退出 */
export function shutdownSemanticWorker(): void {
  if (worker) {
    try {
      worker.terminate()
    } catch {
      // 终止失败忽略
    }
    worker = null
    workerReady = false
  }
}

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

function getAllEmbeddingsSync(): FallbackRow[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT message_id, session_id, embedding, model FROM message_embeddings')
    .all() as Array<{ message_id: string; session_id: string; embedding: Buffer; model: string }>
  return rows
    .filter((r) => r.embedding.byteLength > 0 && r.embedding.byteLength % 4 === 0)
    .map((r) => ({
      messageId: r.message_id,
      sessionId: r.session_id,
      embedding: Array.from(
        new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
      ),
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
    score: cosineSimilarity(queryVec, row.embedding)
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

  // 查询向量 LRU 缓存：避免相同查询重复调用 embedding API
  const cacheKey = embeddingCacheKey(config, trimmed)
  let queryVec = getCachedEmbedding(cacheKey)
  if (!queryVec) {
    queryVec = await embedQuery(config, trimmed)
    setCachedEmbedding(cacheKey, queryVec)
  }
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
