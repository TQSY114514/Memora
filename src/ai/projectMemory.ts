import type { AiConfig, ProjectMemoryAnswer, MemoryCitation, RelatedSession } from '@shared/types'
import { getDatabase } from '../database/connection'
import { getSession } from '../database/repositories/sessionRepo'
import { getAllEmbeddings } from '../database/repositories/embeddingRepo'
import { callChat, embedQuery } from './apiClient'
import { cosineSimilarity } from '@shared/math'

/**
 * Project Memory 智能问答（RAG）
 *
 * 流程：
 * 1. 把用户问题向量化
 * 2. 从全库向量中检索 Top-K 相关消息
 * 3. 对每条命中消息，加载其上下文（前后各 1 条消息）
 * 4. 组装 context prompt，调用 LLM 生成答案
 * 5. 返回答案 + 引用来源
 *
 * 这是 Memora 的核心价值：让 AI 基于用户的历史对话回答项目问题
 *
 * v1.2：callChat / embedQuery / cosineSimilarity 统一抽到 apiClient + math
 */

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  msg_order: number
}

const SYSTEM_PROMPT = `你是 Memora 的 Project Memory 助手。用户会基于自己过去的 AI 对话记录提问，你需要根据提供的对话片段回答问题。

要求：
- 基于提供的对话片段回答，不要编造未提及的内容
- 如果片段中没有相关信息，明确说明"历史对话中未找到相关内容"
- 引用对话时标注来源（如"在 Claude 的架构讨论中提到..."）
- 用中文回答，结构清晰，使用 Markdown 格式
- 如果多个片段都涉及同一主题，综合它们的信息`

/**
 * 来源归因提示（v1.15 Sources Attribution，借鉴 ChatGPT/Gemini 的 sources）
 *
 * 在答案生成后，让 LLM 判断实际使用了哪些片段、为什么用。
 * 只返回真正支撑答案的片段，避免把所有检索结果都当引用。
 */
const ATTRIBUTION_PROMPT = `你是来源归因器。下面给出一段 AI 回答和若干候选来源片段（每段以 【片段 N】 开头）。
请判断回答实际依赖了哪些片段，并说明每个被使用片段的原因。

要求：
- 只包含实际支撑回答内容的片段；未使用的不要列出
- 原因用一句话、中文、简洁（如"提供了用户的技术栈偏好"）
- 严格输出 JSON 数组，格式：[{"index": 1, "reason": "..."}]
- 不要输出任何额外文字或 Markdown 代码块`

/** 解析归因 LLM 的 JSON 输出（容错：去掉 ```json 围栏/前后噪音） */
function parseAttribution(text: string): Array<{ index: number; reason: string }> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((x): x is { index: number; reason: string } =>
        typeof x === 'object' && x !== null &&
        typeof (x as { index?: unknown }).index === 'number' &&
        typeof (x as { reason?: unknown }).reason === 'string')
      .map((x) => ({ index: x.index, reason: x.reason }))
  } catch {
    return null
  }
}

/** 截取消息片段（用于 prompt 和引用展示） */
function truncate(text: string, maxChars = 500): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '…'
}

/** 加载某条消息的上下文（前后各 1 条） */
function loadMessageWithContext(messageId: string): { prev?: MessageRow; current: MessageRow; next?: MessageRow } {
  const db = getDatabase()
  const current = db
    .prepare('SELECT id, session_id, role, content, msg_order FROM messages WHERE id = ?')
    .get(messageId) as MessageRow | undefined
  if (!current) throw new Error('消息不存在')

  const prev = db
    .prepare(
      `SELECT id, session_id, role, content, msg_order FROM messages
       WHERE session_id = ? AND msg_order = ?`
    )
    .get(current.session_id, current.msg_order - 1) as MessageRow | undefined

  const next = db
    .prepare(
      `SELECT id, session_id, role, content, msg_order FROM messages
       WHERE session_id = ? AND msg_order = ?`
    )
    .get(current.session_id, current.msg_order + 1) as MessageRow | undefined

  return { prev, current, next }
}

/** 把消息角色转为可读标签 */
function roleLabel(role: string): string {
  if (role === 'user') return '用户'
  if (role === 'assistant') return 'AI'
  if (role === 'system') return '系统'
  return role
}

/** Project Memory 问答 */
export async function askProjectMemory(
  question: string,
  config: AiConfig,
  options?: { topK?: number; threshold?: number }
): Promise<ProjectMemoryAnswer> {
  const trimmed = question.trim()
  if (!trimmed) throw new Error('问题不能为空')

  const topK = options?.topK ?? 8
  const threshold = options?.threshold ?? 0.2

  // 1. 问题向量化
  const queryVec = await embedQuery(config, trimmed)

  // 2. 全库检索
  const all = getAllEmbeddings()
  if (all.length === 0) {
    throw new Error('尚未建立任何向量索引。请先在对话页点击「建立向量索引」。')
  }

  const scored = all.map((row) => ({
    messageId: row.messageId,
    sessionId: row.sessionId,
    score: cosineSimilarity(queryVec, row.embedding)
  }))

  const top = scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  if (top.length === 0) {
    return {
      question: trimmed,
      answer: '未在历史对话中找到与问题相关的内容。可以尝试：\n\n1. 为更多对话建立向量索引\n2. 换一种提问方式\n3. 降低相关度阈值',
      citations: [],
      model: config.chatModel,
      createdAt: new Date().toISOString()
    }
  }

  // 3. 加载上下文 + 组装 prompt
  const citations: MemoryCitation[] = []
  const contextBlocks: string[] = []

  top.forEach((hit, idx) => {
    const session = getSession(hit.sessionId, false)
    if (!session) return

    const { prev, current, next } = loadMessageWithContext(hit.messageId)

    // 组装上下文块
    const blockLines: string[] = []
    blockLines.push(`### 片段 ${idx + 1}（来源：${session.provider} · ${session.title}，相关度 ${(hit.score * 100).toFixed(0)}%）`)
    if (prev) {
      blockLines.push(`[${roleLabel(prev.role)}] ${truncate(prev.content, 300)}`)
    }
    blockLines.push(`[${roleLabel(current.role)}] ${truncate(current.content, 500)}`)
    if (next) {
      blockLines.push(`[${roleLabel(next.role)}] ${truncate(next.content, 300)}`)
    }
    contextBlocks.push(blockLines.join('\n'))

    citations.push({
      sessionId: hit.sessionId,
      sessionTitle: session.title,
      provider: session.provider,
      messageId: hit.messageId,
      snippet: truncate(current.content, 200),
      score: hit.score
    })
  })

  // 4. 调用 LLM
  const userPrompt = `## 用户问题
${trimmed}

## 相关对话片段
${contextBlocks.join('\n\n---\n\n')}

请基于以上片段回答用户的问题。`

  const answer = await callChat(config, SYSTEM_PROMPT, userPrompt, { temperature: 0.3, timeoutMs: 180_000 })

  // 5. 来源归因（v1.15 Sources Attribution）
  //    让 LLM 判断回答实际使用了哪些片段 + 原因，过滤掉未被使用的检索结果
  let finalCitations = citations
  try {
    const attributionInput =
      `## AI 回答\n${answer}\n\n## 候选来源片段\n` +
      contextBlocks.map((block, i) => `【片段 ${i + 1}】\n${block}`).join('\n\n')
    const attributionRaw = await callChat(
      config,
      ATTRIBUTION_PROMPT,
      attributionInput,
      { temperature: 0, timeoutMs: 60_000 }
    )
    const used = parseAttribution(attributionRaw)
    // 解析成功（含空数组 = 未使用任何来源）才应用归因；解析失败降级保留全部
    if (used !== null) {
      const usedIndexes = new Set(used.map((u) => u.index - 1)) // LLM 输出 1-based
      const reasonByIndex = new Map(used.map((u) => [u.index - 1, u.reason]))
      finalCitations = citations
        .map((c, idx) => ({ c, idx }))
        .filter(({ idx }) => usedIndexes.has(idx))
        .map(({ c, idx }) => {
          const reason = reasonByIndex.get(idx)
          return reason ? { ...c, reason } : c
        })
    }
  } catch {
    // 归因失败：降级为返回全部检索片段（向后兼容）
  }

  return {
    question: trimmed,
    answer,
    citations: finalCitations,
    model: config.chatModel,
    createdAt: new Date().toISOString()
  }
}

/**
 * 查找与指定会话相关的其他讨论
 * 基于该会话内所有消息向量的平均，找最相似的其他会话
 */
export function findRelatedSessions(
  sessionId: string,
  options?: { limit?: number; threshold?: number }
): RelatedSession[] {
  const limit = options?.limit ?? 5
  const threshold = options?.threshold ?? 0.3

  const all = getAllEmbeddings()
  if (all.length === 0) return []

  // 分两组：当前会话的向量 vs 其他会话的向量
  const currentVecs = all.filter((r) => r.sessionId === sessionId)
  if (currentVecs.length === 0) return []

  // 计算当前会话的质心（平均向量）
  const dim = currentVecs[0].embedding.length
  const centroid = new Array(dim).fill(0)
  for (const v of currentVecs) {
    for (let i = 0; i < dim; i++) centroid[i] += v.embedding[i]
  }
  for (let i = 0; i < dim; i++) centroid[i] /= currentVecs.length

  // 对其他会话的每条消息算相似度，取每个会话的最高分
  const otherVecs = all.filter((r) => r.sessionId !== sessionId)
  const sessionBestScore = new Map<string, { score: number; messageId: string }>()

  for (const v of otherVecs) {
    const score = cosineSimilarity(centroid, v.embedding)
    const existing = sessionBestScore.get(v.sessionId)
    if (!existing || score > existing.score) {
      sessionBestScore.set(v.sessionId, { score, messageId: v.messageId })
    }
  }

  // 加载消息内容作为 reason
  const db = getDatabase()
  const results: RelatedSession[] = []

  for (const [sid, { score, messageId }] of sessionBestScore) {
    if (score < threshold) continue
    const session = getSession(sid, false)
    if (!session) continue

    const msg = db
      .prepare('SELECT content FROM messages WHERE id = ?')
      .get(messageId) as { content: string } | undefined

    results.push({
      session,
      score,
      reason: msg ? truncate(msg.content, 100) : ''
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}
