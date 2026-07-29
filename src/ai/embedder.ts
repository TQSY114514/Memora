import type { AiConfig } from '@shared/types'
import { getSession } from '../database/repositories/sessionRepo'
import {
  upsertEmbeddings,
  getMessagesWithoutEmbeddings,
  hasSessionEmbeddings,
  countSessionEmbeddings
} from '../database/repositories/embeddingRepo'

/**
 * 向量嵌入模块
 * 调用 OpenAI 兼容的 embeddings 接口，为消息生成向量
 *
 * 策略：
 * - 单条会话内批量请求（一次 API 调用处理多条文本）
 * - 已存在向量的消息跳过（增量索引）
 * - 超长文本截断（embedding 模型一般限制 8k tokens）
 */

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>
  error?: { message: string }
}

/** 调用 embeddings 接口（批量） */
async function callEmbeddings(
  config: AiConfig,
  inputs: string[]
): Promise<number[][]> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/embeddings`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: inputs
    })
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Embedding API ${resp.status}: ${errText}`)
  }

  const data = (await resp.json()) as EmbeddingResponse
  if (data.error) throw new Error(data.error.message)
  if (!data.data || data.data.length === 0) throw new Error('Embedding API 返回空')

  return data.data.map((d) => {
    if (!d.embedding || d.embedding.length === 0) {
      throw new Error('返回的向量为空')
    }
    return d.embedding
  })
}

/** 截断超长文本（按字符近似，embedding 模型一般 8k tokens 限制） */
function truncate(text: string, maxChars = 6000): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '…[截断]'
}

/** 跳过明显无意义的内容（如纯空白、过短） */
function isEmbeddable(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return false
  return true
}

export interface EmbedProgress {
  total: number
  embedded: number
  skipped: number
}

/** 为会话内所有消息生成向量（增量） */
export async function embedSession(
  sessionId: string,
  config: AiConfig
): Promise<EmbedProgress> {
  const session = getSession(sessionId, true)
  if (!session) throw new Error('会话不存在')
  if (!session.messages || session.messages.length === 0) {
    throw new Error('会话无消息内容')
  }

  const pending = getMessagesWithoutEmbeddings(sessionId)
  if (pending.length === 0) {
    return {
      total: session.messages.length,
      embedded: 0,
      skipped: session.messages.length
    }
  }

  // 过滤可嵌入的消息
  const embeddable = pending.filter((m) => isEmbeddable(m.content))
  const skipped = pending.length - embeddable.length

  // 分批处理（OpenAI embeddings 单次最多 100 条，保守取 32）
  const BATCH_SIZE = 32
  let embedded = 0

  for (let i = 0; i < embeddable.length; i += BATCH_SIZE) {
    const batch = embeddable.slice(i, i + BATCH_SIZE)
    const inputs = batch.map((m) => truncate(m.content))
    const vectors = await callEmbeddings(config, inputs)

    if (vectors.length !== batch.length) {
      throw new Error(`向量数量不匹配: 期望 ${batch.length}, 实际 ${vectors.length}`)
    }

    // 维度校验
    for (const v of vectors) {
      if (v.length !== config.embeddingDim) {
        throw new Error(
          `向量维度不匹配: 期望 ${config.embeddingDim}, 实际 ${v.length}。请检查 AiConfig.embeddingDim。`
        )
      }
    }

    upsertEmbeddings(
      batch.map((m, idx) => ({
        messageId: m.id,
        sessionId,
        embedding: vectors[idx],
        model: config.embeddingModel
      }))
    )
    embedded += batch.length
  }

  return {
    total: session.messages.length,
    embedded,
    skipped
  }
}

/** 会话是否已建立向量索引 */
export function isSessionEmbedded(sessionId: string): boolean {
  return hasSessionEmbeddings(sessionId)
}

/** 统计会话向量索引进度 */
export function getEmbedStatus(sessionId: string): {
  total: number
  embedded: number
  complete: boolean
} {
  const session = getSession(sessionId, true)
  const total = session?.messages?.length ?? 0
  const embedded = countSessionEmbeddings(sessionId)
  return {
    total,
    embedded,
    complete: total > 0 && embedded >= total
  }
}
