import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'

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
  try {
    const data = JSON.parse(json)
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
  } catch {
    return null
  }
}

function normalizeRole(role?: string): ParsedMessage['role'] {
  const r = (role || '').toLowerCase()
  if (r === 'user' || r === 'human') return 'user'
  // Grok 偶尔用 "model" 表示助手（同 Gemini）
  if (r === 'assistant' || r === 'ai' || r === 'model' || r === 'bot') return 'assistant'
  if (r === 'system') return 'system'
  if (r === 'tool') return 'tool'
  return 'assistant'
}

/** 时间字段可能是 ISO 字符串或 Unix 秒，统一转为 ISO 字符串 */
function toIsoTs(value?: string | number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') {
    // Unix 秒 → 毫秒；若已是毫秒（>1e12）则直接用
    const ms = value > 1e12 ? value : value * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const s = String(value)
  // 纯数字字符串按时间戳处理
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  // 已是 ISO 字符串
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
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
        createdAt: toIsoTs(msg.created_at || msg.createdAt || msg.timestamp) || now
      })
    } catch {
      // 单条消息解析失败不阻断
    }
  }
  return messages
}

function fallbackTitle(messages: ParsedMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (first) {
    const text = first.content.replace(/\s+/g, ' ').trim()
    return text.length > 50 ? text.slice(0, 50) + '…' : text
  }
  return '未命名对话'
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

    const sessions: ParsedSession[] = []
    const now = new Date().toISOString()
    for (const conv of data) {
      try {
        const messages = extractMessages(conv)
        if (messages.length === 0) continue

        const rawTitle = (conv.title || conv.name || '').trim()
        const title = rawTitle || fallbackTitle(messages)

        sessions.push({
          sourceId: conv.id || conv.conversation_id,
          provider: 'Grok' as Provider,
          model: conv.model,
          title,
          createdAt: toIsoTs(conv.created_at || conv.createdAt) || messages[0]?.createdAt || now,
          updatedAt:
            toIsoTs(conv.updated_at || conv.updatedAt) ||
            toIsoTs(conv.created_at || conv.createdAt) ||
            now,
          messages
        })
      } catch {
        // 单条对话解析失败不阻断
      }
    }
    return sessions
  }
}
