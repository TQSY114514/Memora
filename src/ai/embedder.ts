import type { AiConfig } from '@shared/types'
import { getSession } from '../database/repositories/sessionRepo'
import {
  upsertEmbeddings,
  getMessagesWithoutEmbeddings,
  hasSessionEmbeddings,
  countSessionEmbeddings
} from '../database/repositories/embeddingRepo'
import { invalidateEmbeddingCache } from '../search/semantic'
import { embedBatch } from './apiClient'

/**
 * 向量嵌入模块
 * 调用 embeddings 接口为消息生成向量（v1.2 起支持多协议，由 apiClient 路由）
 *
 * 策略：
 * - 单条会话内批量请求（一次 API 调用处理多条文本）
 * - 已存在向量的消息跳过（增量索引）
 * - 超长文本截断（embedding 模型一般限制 8k tokens）
 */

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

  // try/finally：中途某批失败（API 报错/维度不匹配）时，前面批次已写入 DB，
  // 必须仍然通知 worker 缓存失效，否则 worker 内存缓存与 DB 不一致
  try {
    for (let i = 0; i < embeddable.length; i += BATCH_SIZE) {
      const batch = embeddable.slice(i, i + BATCH_SIZE)
      const inputs = batch.map((m) => truncate(m.content))
      const vectors = await embedBatch(config, inputs)

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
  } finally {
    try {
      invalidateEmbeddingCache()
    } catch (err) {
      // 缓存失效失败不影响主流程：不遮蔽 embedSession 的原始结果/错误（worker 可能已终止，postMessage 会抛）
      console.warn('[embedder] 通知语义缓存失效失败（忽略）:', err)
    }
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
