import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, normalizeRole, fallbackTitle, buildSessions } from '../common'

/**
 * 通义千问 (Qwen) 导入器
 *
 * 支持两种来源：
 * 1. chat.qwen.ai 分享 API 返回的 JSON
 *    结构：{ success: true, data: { chat: { id, title, createdAt, messages: [...] } } }
 *
 * 2. 直接导出的对话 JSON
 *    结构：{ title, messages: [{ role, content, created_at, model, reasoning_content }] }
 *
 * 特殊处理：
 * - /s/deploy/<id> 是 artifact 链接，不是对话（不支持）
 * - reasoning_content 是思考块（reasoning model），合并到消息前
 */
interface QwenMessage {
  role?: string
  content?: string
  text?: string
  created_at?: string
  createdAt?: string
  model?: string
  reasoning_content?: string
  thinking_content?: string
}

interface QwenChat {
  id?: string
  chat_id?: string
  title?: string
  name?: string
  created_at?: string
  createdAt?: string
  updated_at?: string
  messages?: QwenMessage[]
}

interface QwenApiResponse {
  success?: boolean
  data?: {
    chat?: QwenChat
    messages?: QwenMessage[]
  }
}

function safeParse(json: string): QwenChat[] | null {
  const data = safeParseJson(json)
  if (Array.isArray(data)) return data as QwenChat[]
  if (data && typeof data === 'object') {
    const obj = data as QwenApiResponse & QwenChat
    // API 响应包裹
    if (obj.data?.chat) return [obj.data.chat]
    if (obj.data?.messages) {
      return [{ messages: obj.data.messages }]
    }
    // 直接是对话对象
    if ((obj as QwenChat).messages) return [obj as QwenChat]
  }
  return null
}

function extractMessages(chat: QwenChat): ParsedMessage[] {
  const raw = chat.messages || []
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()

  for (const msg of raw) {
    const role = normalizeRole(msg.role)
    const content = msg.content || msg.text || ''
    const reasoning = msg.reasoning_content || msg.thinking_content

    let fullContent = ''
    if (reasoning && reasoning.trim()) {
      fullContent += `> 💭 **思考过程**\n\n${reasoning.trim()}\n\n---\n\n`
    }
    fullContent += content

    if (!fullContent.trim()) continue
    messages.push({
      role,
      content: fullContent,
      model: msg.model,
      createdAt: msg.created_at || msg.createdAt || now
    })
  }
  return messages
}

export const qwenImporter: Importer = {
  provider: 'Qwen' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (!lower.endsWith('.json')) return false
    const data = safeParse(content)
    if (!data) return false
    // 特征：含 success + data.chat（API 响应），或文件名含 qwen/tongyi
    if (lower.includes('qwen') || lower.includes('tongyi')) return true
    return content.includes('"success"') && content.includes('"chat"')
  },

  parse(content: string): ParsedSession[] {
    const data = safeParse(content)
    if (!data) return []
    return buildSessions(data, {
      provider: 'Qwen' as Provider,
      extractMessages,
      toSession(chat, messages) {
        return {
          sourceId: chat.id || chat.chat_id,
          title: chat.title || chat.name || fallbackTitle(messages),
          createdAt: chat.created_at || chat.createdAt || new Date().toISOString(),
          updatedAt: chat.updated_at || chat.created_at || new Date().toISOString()
        }
      }
    })
  }
}
