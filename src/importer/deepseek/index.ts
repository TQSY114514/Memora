import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, normalizeRole, fallbackTitle } from '../common'

/**
 * DeepSeek 导入器
 *
 * 支持两种来源：
 * 1. chat.deepseek.com 分享 API 返回的 JSON
 *    结构：{ data: { biz_code: 0, biz_data: { id, title, created_at, updated_at, messages: [...] } } }
 *
 * 2. 直接导出的对话 JSON
 *    结构：{ title, messages: [{ role, content, created_at, model, reasoning_content }] }
 *
 * 特殊处理：
 * - title 常为 "Shared Conversation" 占位 → 用首条消息截取
 * - reasoning_content 是思考过程（reasoning model），合并到 assistant 消息前
 */
interface DeepSeekMessage {
  role?: string
  content?: string
  text?: string
  created_at?: string
  createdAt?: string
  model?: string
  reasoning_content?: string
  thinking_content?: string
}

interface DeepSeekData {
  id?: string
  share_id?: string
  title?: string
  name?: string
  created_at?: string
  updated_at?: string
  messages?: DeepSeekMessage[]
}

interface DeepSeekApiResponse {
  data?: {
    biz_code?: number
    biz_data?: DeepSeekData
  }
  biz_data?: DeepSeekData
}

function safeParse(json: string): DeepSeekData[] | null {
  const data = safeParseJson(json)
  if (Array.isArray(data)) return data as DeepSeekData[]
  if (data && typeof data === 'object') {
    const apiResp = data as DeepSeekApiResponse
    // API 响应包裹
    if (apiResp.data?.biz_data) return [apiResp.data.biz_data]
    if (apiResp.biz_data) return [apiResp.biz_data]
    // 直接是对话对象
    const conv = data as DeepSeekData
    if (conv.messages) return [conv]
  }
  return null
}

function extractMessages(data: DeepSeekData): ParsedMessage[] {
  const raw = data.messages || []
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()

  for (const msg of raw) {
    const role = normalizeRole(msg.role)
    const content = msg.content || msg.text || ''
    const reasoning = msg.reasoning_content || msg.thinking_content

    // 把思考过程作为前缀（用 blockquote 标注）
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

const PLACEHOLDER_TITLES = ['Shared Conversation', 'shared conversation', '']

export const deepseekImporter: Importer = {
  provider: 'DeepSeek' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (!lower.endsWith('.json')) return false
    const data = safeParse(content)
    if (!data) return false
    // 特征：含 deepseek 相关字段，或 messages 数组
    return data.some(
      (d) =>
        d.messages !== undefined ||
        d.share_id !== undefined ||
        content.includes('biz_data')
    )
  },

  parse(content: string): ParsedSession[] {
    const data = safeParse(content)
    if (!data) return []

    const sessions: ParsedSession[] = []
    for (const conv of data) {
      try {
        const messages = extractMessages(conv)
        if (messages.length === 0) continue

        // DeepSeek 分享的 title 常为占位，回退到首条消息
        const rawTitle = conv.title || conv.name || ''
        const title = PLACEHOLDER_TITLES.includes(rawTitle)
          ? fallbackTitle(messages)
          : rawTitle

        sessions.push({
          sourceId: conv.id || conv.share_id,
          provider: 'DeepSeek' as Provider,
          title,
          createdAt: conv.created_at || messages[0]?.createdAt || new Date().toISOString(),
          updatedAt: conv.updated_at || conv.created_at || new Date().toISOString(),
          messages
        })
      } catch {
        // 单条失败不阻断
      }
    }
    return sessions
  }
}
