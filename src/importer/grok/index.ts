import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, normalizeRole, toIsoTimestamp, fallbackTitle, buildSessions } from '../common'

/**
 * Grok 导入器
 *
 * 解析 Grok (x.com / x.ai) 导出的对话 JSON。
 *
 * 常见结构：
 * 1. { conversation: { id, title, created_at, updated_at, messages: [...] } }
 * 2. { title, messages: [{ role, content, created_at, model }] }
 * 3. [{ title, messages: [...] }, ...]  多对话导出
 *
 * 消息字段：
 * - role：user / assistant / model / system（Grok 偶尔用 "model" 表示助手，同 Gemini）
 * - content 或 text：正文
 * - model：模型名（如 grok-2、grok-3、grok-4）
 * - created_at / createdAt / timestamp：时间，可能为 ISO 字符串或 Unix 秒
 *
 * 特殊处理：
 * - title 为空时用首条 user 消息截取
 * - 单条消息解析失败不阻断整段对话
 */
interface GrokMessage {
  role?: string
  content?: string
  text?: string
  created_at?: string | number
  createdAt?: string | number
  timestamp?: string | number
  model?: string
}

interface GrokConversation {
  id?: string
  conversation_id?: string
  title?: string
  name?: string
  model?: string
  created_at?: string | number
  createdAt?: string | number
  updated_at?: string | number
  updatedAt?: string | number
  messages?: GrokMessage[]
}

interface GrokExport {
  // { conversation: { messages: [...] } } 包裹形式
  conversation?: GrokConversation
}

function safeParse(json: string): GrokConversation[] | null {
  const data = safeParseJson(json)
  if (Array.isArray(data)) return data as GrokConversation[]
  if (data && typeof data === 'object') {
    const wrapped = data as GrokExport
    // 包裹形式：{ conversation: { messages: [...] } }
    if (wrapped.conversation) return [wrapped.conversation]
    const conv = data as GrokConversation
    // 直接是对话对象
    if (conv.messages) return [conv]
  }
  return null
}

function extractMessages(conv: GrokConversation): ParsedMessage[] {
  const raw = conv.messages || []
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()
  const convModel = conv.model

  for (const msg of raw) {
    try {
      const role = normalizeRole(msg.role)
      const content = msg.content || msg.text || ''
      if (!content.trim()) continue
      messages.push({
        role,
        content,
        model: msg.model || convModel,
        createdAt: toIsoTimestamp(msg.created_at || msg.createdAt || msg.timestamp) || now
      })
    } catch {
      // 单条消息解析失败不阻断
    }
  }
  return messages
}

/** Grok 特征关键词（模型名 / 域名） */
const GROK_MARKERS = ['grok', 'x.ai', 'x.com']

function hasGrokSignal(filename: string, content: string): boolean {
  const lowerName = filename.toLowerCase()
  if (GROK_MARKERS.some((m) => lowerName.includes(m))) return true
  const lowerContent = content.toLowerCase()
  return GROK_MARKERS.some((m) => lowerContent.includes(m))
}

export const grokImporter: Importer = {
  provider: 'Grok' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (!lower.endsWith('.json')) return false
    const data = safeParse(content)
    if (!data) return false
    // 必须含 messages 数组才可能是 Grok 对话
    if (!data.some((d) => Array.isArray(d.messages))) return false
    // 含 Grok 特征（文件名或内容中出现 grok / x.ai / x.com）
    return hasGrokSignal(filename, content)
  },

  parse(content: string): ParsedSession[] {
    const data = safeParse(content)
    if (!data) return []
    const now = new Date().toISOString()
    return buildSessions(data, {
      provider: 'Grok' as Provider,
      extractMessages,
      toSession(conv, messages) {
        const rawTitle = (conv.title || conv.name || '').trim()
        const title = rawTitle ? rawTitle : fallbackTitle(messages)
        return {
          sourceId: conv.id || conv.conversation_id,
          model: conv.model,
          title,
          createdAt: toIsoTimestamp(conv.created_at || conv.createdAt) || messages[0]?.createdAt || now,
          updatedAt:
            toIsoTimestamp(conv.updated_at || conv.updatedAt) ||
            toIsoTimestamp(conv.created_at || conv.createdAt) ||
            now
        }
      }
    })
  }
}
