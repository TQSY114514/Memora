import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'

/**
 * Cursor 导入器
 *
 * Cursor 的聊天记录原生存储在 SQLite（state.vscdb）中，
 * 用户也可能通过第三方工具或手动方式导出为 JSON。
 *
 * 支持的 JSON 结构：
 * 1. 单对话：{ id, title, name, created_at, updated_at, messages: [...] }
 * 2. 多对话：{ chats: [...] } 或 { conversations: [...] }
 * 3. 顶层数组：[ { messages: [...] }, ... ]
 *
 * 消息字段：
 * - role: user / assistant / human / model / system / tool
 * - content / text: 消息正文
 * - created_at / createdAt / timestamp: 创建时间
 * - model: 模型名
 *
 * 特殊处理：
 * - Cursor 的 AI 对话常包含代码上下文，保留原文不剥离
 * - title 为空或占位时，用首条 user 消息截取
 * - 单条消息解析失败不阻断整体流程
 */
interface CursorMessage {
  role?: string
  content?: string
  text?: string
  created_at?: string
  createdAt?: string
  timestamp?: string | number
  model?: string
}

interface CursorConversation {
  id?: string
  title?: string
  name?: string
  created_at?: string
  updated_at?: string
  messages?: CursorMessage[]
}

interface CursorRoot {
  chats?: CursorConversation[]
  conversations?: CursorConversation[]
  messages?: CursorMessage[]
}

function safeParse(json: string): CursorConversation[] | null {
  try {
    const data = JSON.parse(json)
    if (Array.isArray(data)) {
      // 顶层数组：可能是对话数组，也可能是单条消息数组
      if (data.length && data[0] && (data[0] as CursorConversation).messages) {
        return data as CursorConversation[]
      }
      // 视为单对话的消息列表
      return [{ messages: data as CursorMessage[] }]
    }
    if (data && typeof data === 'object') {
      const root = data as CursorRoot
      // 多对话
      if (Array.isArray(root.chats)) return root.chats
      if (Array.isArray(root.conversations)) return root.conversations
      // 单对话（含 messages）
      const conv = data as CursorConversation
      if (Array.isArray(conv.messages)) return [conv]
    }
    return null
  } catch {
    return null
  }
}

function normalizeRole(role?: string): ParsedMessage['role'] {
  const r = (role || '').toLowerCase()
  if (r === 'user' || r === 'human') return 'user'
  if (r === 'assistant' || r === 'ai' || r === 'model' || r === 'bot') return 'assistant'
  if (r === 'system') return 'system'
  if (r === 'tool') return 'tool'
  return 'assistant'
}

function toISOTime(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'number') {
    // 13 位毫秒 / 10 位秒
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

function extractMessages(conv: CursorConversation): ParsedMessage[] {
  const raw = conv.messages || []
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()

  for (const msg of raw) {
    try {
      const role = normalizeRole(msg.role)
      const content = msg.content || msg.text || ''
      if (!content.trim()) continue

      const createdAt =
        toISOTime(msg.created_at) ||
        toISOTime(msg.createdAt) ||
        toISOTime(msg.timestamp) ||
        now

      messages.push({
        role,
        content,
        model: msg.model,
        createdAt
      })
    } catch {
      // 单条消息解析失败跳过，不阻断整体
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

// 占位标题，需回退到首条 user 消息
const PLACEHOLDER_TITLES = ['', 'New Chat', 'New chat', 'Untitled', '未命名对话']

export const cursorImporter: Importer = {
  provider: 'Cursor' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    // 文件名特征：含 cursor 关键字
    if (lower.includes('cursor') && lower.endsWith('.json')) return true

    if (!lower.endsWith('.json')) return false

    const data = safeParse(content)
    if (!data) return false

    // 内容特征：chats / conversations 数组，或消息含 Cursor 特有 role
    const hasChats = data.some(
      (c) => Array.isArray(c.messages) && c.messages.length > 0
    )
    if (!hasChats) return false

    // Cursor 特有：role 取值 human / model 较常见
    const cursorRoles = ['human', 'model']
    return data.some((c) =>
      (c.messages || []).some((m) => {
        const r = (m.role || '').toLowerCase()
        return cursorRoles.includes(r) || r === 'user' || r === 'assistant'
      })
    )
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

        const rawTitle = conv.title || conv.name || ''
        const title = PLACEHOLDER_TITLES.includes(rawTitle)
          ? fallbackTitle(messages)
          : rawTitle

        const createdAt =
          toISOTime(conv.created_at) ||
          messages[0]?.createdAt ||
          now
        const updatedAt =
          toISOTime(conv.updated_at) ||
          toISOTime(conv.created_at) ||
          messages[messages.length - 1]?.createdAt ||
          now

        sessions.push({
          sourceId: conv.id,
          provider: 'Cursor' as Provider,
          title,
          createdAt,
          updatedAt,
          messages
        })
      } catch {
        // 单条对话解析失败不阻断
      }
    }
    return sessions
  }
}
