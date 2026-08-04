import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, normalizeRole, fallbackTitle, buildSessions } from '../common'

/**
 * Claude 导入器
 *
 * 支持两种来源：
 * 1. Claude 官方数据导出（Settings → Export Data → conversations.json）
 *    结构：[{ uuid, name, created_at, updated_at, chat_messages: [{ uuid, text, sender, created_at, content: [{type, text}] }] }]
 *
 * 2. claude.ai/share/<id> 分享页面的底层 JSON API 返回
 *    结构：{ uuid, name, created_at, updated_at, chat_messages: [...] }
 *
 * 兼容字段：
 * - sender: "human" | "assistant" | "user" | "system"
 * - content: 可能是字符串，也可能是 [{type:"text", text:"..."}] 数组
 */
interface ClaudeContentBlock {
  type?: string
  text?: string
  content?: string
}

interface ClaudeMessage {
  uuid?: string
  text?: string
  sender?: string
  role?: string
  created_at?: string
  content?: ClaudeContentBlock[] | string
  model?: string
}

interface ClaudeConversation {
  uuid?: string
  name?: string
  title?: string
  created_at?: string
  updated_at?: string
  chat_messages?: ClaudeMessage[]
  messages?: ClaudeMessage[]
}

function safeParse(json: string): ClaudeConversation[] | null {
  const data = safeParseJson(json)
  if (Array.isArray(data)) return data as ClaudeConversation[]
  if (data && typeof data === 'object') {
    // 单条对话
    const conv = data as ClaudeConversation
    if (conv.chat_messages || conv.messages) return [conv]
  }
  return null
}

function extractMessageText(msg: ClaudeMessage): string {
  // 优先 content 数组
  if (Array.isArray(msg.content)) {
    const parts = msg.content
      .map((block) => {
        if (block.type === 'text' || !block.type) {
          return block.text || block.content || ''
        }
        // 其他类型（如 tool_use、image）转占位
        if (block.type === 'tool_use') return `[工具调用: ${block.text || ''}]`
        if (block.type === 'image') return `[图片]`
        return block.text || ''
      })
      .filter(Boolean)
    return parts.join('\n')
  }
  // content 字符串
  if (typeof msg.content === 'string') return msg.content
  // 兜底 text 字段
  return msg.text || ''
}

function extractMessages(conv: ClaudeConversation): ParsedMessage[] {
  const raw = conv.chat_messages || conv.messages || []
  const messages: ParsedMessage[] = []
  for (const msg of raw) {
    const text = extractMessageText(msg)
    if (!text.trim()) continue
    messages.push({
      role: normalizeRole(msg.sender || msg.role),
      content: text,
      createdAt: msg.created_at || new Date().toISOString()
    })
  }
  return messages
}

export const claudeImporter: Importer = {
  provider: 'Claude' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    // 文件名特征
    if (lower === 'conversations.json' && content.includes('chat_messages')) return true
    if (lower.includes('claude') && lower.endsWith('.json')) {
      const data = safeParse(content)
      return data !== null && data.some((c) => c.chat_messages || c.messages)
    }
    // 内容特征：含 chat_messages + sender
    if (lower.endsWith('.json')) {
      const data = safeParse(content)
      if (!data) return false
      return data.some(
        (c) =>
          (c.chat_messages || c.messages)?.some(
            (m) => m.sender === 'human' || m.sender === 'assistant'
          )
      )
    }
    return false
  },

  parse(content: string): ParsedSession[] {
    const data = safeParse(content)
    if (!data) return []
    return buildSessions(data, {
      provider: 'Claude' as Provider,
      extractMessages,
      toSession(conv, messages) {
        return {
          sourceId: conv.uuid,
          title: conv.name || conv.title || fallbackTitle(messages),
          createdAt: conv.created_at || messages[0]?.createdAt || new Date().toISOString(),
          updatedAt: conv.updated_at || conv.created_at || new Date().toISOString()
        }
      }
    })
  }
}
