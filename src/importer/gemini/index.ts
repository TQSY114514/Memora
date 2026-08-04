import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, normalizeRole, toIsoTimestamp, fallbackTitle, extractTextParts, buildSessions } from '../common'

/**
 * Gemini 导入器
 *
 * 支持多种导出格式：
 * 1. Gemini 网页端导出的 JSON（prompts 数组结构）
 *    结构：{
 *      title?, createdAt?, updatedAt?,
 *      prompts: [{
 *        prompt: "...",                       // 用户输入
 *        timestamp: 1700000000,
 *        model?: "gemini-...",
 *        candidates: [{
 *          content: { parts: [{ text: "..." }] },
 *          safetyRatings?: [...]
 *        }],
 *        responseParts?: [{ text: "..." }]     // 部分变体使用
 *        citationMetadata?: [...]              // 引用元数据，忽略
 *      }]
 *    }
 *
 * 2. Gemini API 风格的 contents 结构
 *    结构：{
 *      contents: [{ role: "user"|"model", parts: [{ text: "..." }] }]
 *    }
 *
 * 3. 简单的 messages 数组结构
 *    结构：{ messages: [{ role, content }] }
 *
 * 特殊处理：
 * - Gemini 用 'model' 表示 AI 回复 → 映射为 'assistant'
 * - title 为空时回退到首条 user 消息截取
 */

/** Gemini candidates 内的 content 片段 */
interface GeminiContentPart {
  text?: string
}

interface GeminiContent {
  parts?: GeminiContentPart[]
  role?: string
}

interface GeminiCandidate {
  content?: GeminiContent
}

interface GeminiPrompt {
  prompt?: string
  text?: string
  timestamp?: number
  createdAt?: string
  created_at?: string
  model?: string
  candidates?: GeminiCandidate[]
  responseParts?: GeminiContentPart[]
}

interface GeminiConversation {
  title?: string
  name?: string
  id?: string
  sourceId?: string
  model?: string
  createdAt?: string
  updatedAt?: string
  created_at?: string
  updated_at?: string
  // prompts 数组结构
  prompts?: GeminiPrompt[]
  // contents 结构（API 风格）
  contents?: GeminiContent[]
  // 简单 messages 结构
  messages?: GeminiSimpleMessage[]
}

interface GeminiSimpleMessage {
  role?: string
  content?: string
  text?: string
  createdAt?: string
  created_at?: string
  model?: string
}

/** 安全解析 JSON，返回对话数组（统一为数组形式） */
function safeParse(json: string): GeminiConversation[] | null {
  const data = safeParseJson(json)
  if (Array.isArray(data)) return data as GeminiConversation[]
  if (data && typeof data === 'object') {
    const conv = data as GeminiConversation
    // 任一特征字段命中即视为单条对话
    if (conv.prompts || conv.contents || conv.messages) return [conv]
  }
  return null
}

/** 角色归一化：Gemini 用 'model' 表示 AI 回复 */
/** 从 prompts 数组结构提取消息（user prompt + assistant response 配对） */
function extractFromPrompts(prompts: GeminiPrompt[]): ParsedMessage[] {
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()

  for (const p of prompts) {
    // 用户输入
    const userText = (p.prompt || p.text || '').trim()
    const userTime = p.createdAt || p.created_at || (p.timestamp ? toIsoTimestamp(p.timestamp) ?? now : now)
    if (userText) {
      messages.push({
        role: 'user',
        content: userText,
        createdAt: userTime
      })
    }

    // 模型回复：优先 candidates[].content.parts，其次 responseParts
    let assistantText = ''
    if (p.candidates && p.candidates.length > 0) {
      assistantText = p.candidates
        .map((c) => extractTextParts(c.content?.parts))
        .filter(Boolean)
        .join('\n\n')
    }
    if (!assistantText && p.responseParts) {
      assistantText = extractTextParts(p.responseParts)
    }

    if (assistantText.trim()) {
      messages.push({
        role: 'assistant',
        content: assistantText,
        model: p.model,
        createdAt: userTime
      })
    }
  }
  return messages
}

/** 从 contents 数组结构提取消息（API 风格） */
function extractFromContents(contents: GeminiContent[]): ParsedMessage[] {
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()

  for (const c of contents) {
    const role = normalizeRole(c.role)
    const text = extractTextParts(c.parts)
    if (text.trim()) {
      messages.push({
        role,
        content: text,
        createdAt: now
      })
    }
  }
  return messages
}

/** 从简单 messages 数组提取消息 */
function extractFromMessages(raw: GeminiSimpleMessage[]): ParsedMessage[] {
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()

  for (const msg of raw) {
    const role = normalizeRole(msg.role)
    const content = (msg.content || msg.text || '').trim()
    if (!content) continue
    messages.push({
      role,
      content,
      model: msg.model,
      createdAt: msg.createdAt || msg.created_at || now
    })
  }
  return messages
}

/** 统一的消息提取入口，按结构特征分派 */
function extractMessages(conv: GeminiConversation): ParsedMessage[] {
  if (Array.isArray(conv.prompts) && conv.prompts.length > 0) {
    return extractFromPrompts(conv.prompts)
  }
  if (Array.isArray(conv.contents) && conv.contents.length > 0) {
    return extractFromContents(conv.contents)
  }
  if (Array.isArray(conv.messages) && conv.messages.length > 0) {
    return extractFromMessages(conv.messages)
  }
  return []
}

/** title 为空时回退到首条 user 消息截取 */
export const geminiImporter: Importer = {
  provider: 'Gemini' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (!lower.endsWith('.json')) return false

    // 文件名特征
    if (lower.includes('gemini')) return true

    const data = safeParse(content)
    if (!data) return false

    // 内容特征：含 prompts/candidates/responseParts，或 contents 结构 + model 角色
    return data.some(
      (c) =>
        Array.isArray(c.prompts) ||
        Array.isArray(c.contents) ||
        (Array.isArray(c.messages) &&
          c.messages.some((m) => (m.role || '').toLowerCase() === 'model'))
    )
  },

  parse(content: string): ParsedSession[] {
    const data = safeParse(content)
    if (!data) return []
    return buildSessions(data, {
      provider: 'Gemini' as Provider,
      extractMessages,
      toSession(conv, messages) {
        const rawTitle = (conv.title || conv.name || '').trim()
        const title = rawTitle ? rawTitle : fallbackTitle(messages)
        const now = new Date().toISOString()
        const createdAt = conv.createdAt || conv.created_at || messages[0]?.createdAt || now
        return {
          sourceId: conv.id || conv.sourceId,
          model: conv.model,
          title,
          createdAt,
          updatedAt: conv.updatedAt || conv.updated_at || createdAt
        }
      }
    })
  }
}
