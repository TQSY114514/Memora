import type { AiConfig, SemanticSearchResult } from '@shared/types'
import { getDatabase } from '../database/connection'
import { getSession } from '../database/repositories/sessionRepo'
import { getAllEmbeddings } from '../database/repositories/embeddingRepo'

/**
 * 语义搜索
 *
 * MVP 实现策略：
 * - 把查询文本向量化（调用 embedding API）
 * - 从 SQLite 加载全部消息向量（JSON 解析）
 * - 在内存中计算余弦相似度
 * - 返回 Top-K 命中
 *
 * 局限：全量加载 + JS 计算，消息量大（>10万）时性能下降
 * 后续可换 sqlite-vss / DuckDB / 外部向量数据库
 */

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

/** 计算余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
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

interface HitRow {
  messageId: string
  sessionId: string
  embedding: number[]
  model: string
}

interface MessageRow {
  id: string
  content: string
}

/** 生成高亮片段（截取匹配消息前后文） */
function buildSnippet(content: string, radius = 80): string {
  if (!content) return ''
  if (content.length <= radius * 2) return content
  return content.slice(0, radius * 2) + '…'
}

/** 语义搜索 */
export async function semanticSearch(
  query: string,
  config: AiConfig,
  options?: { limit?: number; threshold?: number }
): Promise<SemanticSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const queryVec = await embedQuery(config, trimmed)
  const limit = options?.limit ?? 20
  const threshold = options?.threshold ?? 0.25 // 相似度阈值

  // 加载全库向量
  const all = getAllEmbeddings() as HitRow[]
  if (all.length === 0) return []

  // 计算相似度
  const scored = all.map((row) => ({
    messageId: row.messageId,
    sessionId: row.sessionId,
    score: cosineSimilarity(queryVec, row.embedding)
  }))

  // 过滤 + 排序 + 截断
  const top = scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  if (top.length === 0) return []

  // 加载消息内容（批量查询）
  const db = getDatabase()
  const ids = top.map((t) => t.messageId)
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT id, content FROM messages WHERE id IN (${placeholders})`)
    .all(...ids) as MessageRow[]
  const contentMap = new Map(rows.map((r) => [r.id, r.content]))

  // 聚合同一会话的多条命中（取最高分作为会话得分）
  const sessionMap = new Map<string, SemanticSearchResult>()
  for (const hit of top) {
    const session = getSession(hit.sessionId, false)
    if (!session) continue
    const content = contentMap.get(hit.messageId) ?? ''

    const existing = sessionMap.get(hit.sessionId)
    if (existing) {
      // 同一会话只保留得分最高的一条
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
