import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, normalizeRole, fallbackTitle, buildSessions } from '../common'

/**
 * Kimi 导入器
 *
 * 支持两种来源：
 * 1. kimi.com/share/<id> 分享页面（服务端渲染）
 *    JSON 嵌在 <script>window.HYDRATION_INIT_STATE = {...}</script>
 *    结构：{ objectId, title, createdAt, messages: [{ id, role, content, createdAt, toolCalls }] }
 *
 * 2. 直接导出的对话 JSON
 *    结构：{ title, messages: [{ role, content, createdAt }] }
 *
 * 特殊处理：
 * - toolCalls（工具调用）渲染为内联引用块
 */
interface KimiToolCall {
  name?: string
  input?: string
  output?: string
  type?: string
}

interface KimiMessage {
  id?: string
  role?: string
  content?: string
  text?: string
  createdAt?: string
  created_at?: string
  toolCalls?: KimiToolCall[]
  tool_calls?: KimiToolCall[]
}

interface KimiConversation {
  objectId?: string
  id?: string
  title?: string
  name?: string
  createdAt?: string
  created_at?: string
  messages?: KimiMessage[]
}

interface KimiHydrationState {
  // HYDRATION_INIT_STATE 可能是对象或包含 conversation 的对象
  objectId?: string
  title?: string
  messages?: KimiMessage[]
  conversation?: KimiConversation
  chat?: KimiConversation
  // 也可能是数组
}

/** 从 HTML 中提取 HYDRATION_INIT_STATE */
function extractHydrationState(html: string): KimiHydrationState | null {
  // 匹配 window.HYDRATION_INIT_STATE = {...};
  const re = /window\.HYDRATION_INIT_STATE\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i
  const match = html.match(re)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as KimiHydrationState
  } catch {
    return null
  }
}

function safeParse(json: string): KimiConversation[] | null {
  const data = safeParseJson(json)
  if (Array.isArray(data)) return data as KimiConversation[]
  if (data && typeof data === 'object') {
    const obj = data as KimiHydrationState & KimiConversation
    // HYDRATION_INIT_STATE 结构
    if (obj.conversation) return [obj.conversation]
    if (obj.chat) return [obj.chat]
    if (obj.messages) return [obj as KimiConversation]
  }
  return null
}

function renderToolCalls(calls: KimiToolCall[]): string {
  return calls
    .map((call) => {
      const name = call.name || call.type || '工具'
      const input = call.input ? `\n  输入: ${call.input}` : ''
      const output = call.output ? `\n  输出: ${call.output}` : ''
      return `> 🔧 **${name}**${input}${output}`
    })
    .join('\n\n')
}

function extractMessages(conv: KimiConversation): ParsedMessage[] {
  const raw = conv.messages || []
  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()

  for (const msg of raw) {
    const role = normalizeRole(msg.role)
    const content = msg.content || msg.text || ''
    const toolCalls = msg.toolCalls || msg.tool_calls

    let fullContent = ''
    if (toolCalls && toolCalls.length > 0) {
      fullContent += renderToolCalls(toolCalls) + '\n\n'
    }
    fullContent += content

    if (!fullContent.trim()) continue
    messages.push({
      role,
      content: fullContent,
      createdAt: msg.createdAt || msg.created_at || now
    })
  }
  return messages
}

export const kimiImporter: Importer = {
  provider: 'Kimi' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    // HTML 文件中含 HYDRATION_INIT_STATE
    if ((lower.endsWith('.html') || lower.endsWith('.htm')) && content.includes('HYDRATION_INIT_STATE')) {
      return true
    }
    // JSON 文件含 kimi 特征
    if (lower.endsWith('.json')) {
      const data = safeParse(content)
      if (!data) return false
      return data.some(
        (c) =>
          c.objectId !== undefined ||
          c.messages?.some((m) => m.toolCalls || m.tool_calls)
      )
    }
    // 文件名特征
    if (lower.includes('kimi') && (lower.endsWith('.json') || lower.endsWith('.html'))) {
      return true
    }
    return false
  },

  parse(content: string): ParsedSession[] {
    // 优先尝试 HYDRATION_INIT_STATE（HTML 来源）
    const hydration = extractHydrationState(content)
    if (hydration) {
      const conv =
        hydration.conversation || hydration.chat || (hydration as KimiConversation)
      if (conv && conv.messages) {
        const messages = extractMessages(conv)
        if (messages.length > 0) {
          return [
            {
              sourceId: conv.objectId || conv.id,
              provider: 'Kimi' as Provider,
              title: conv.title || conv.name || fallbackTitle(messages),
              createdAt: conv.createdAt || conv.created_at || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages
            }
          ]
        }
      }
    }

    // 回退到普通 JSON
    const data = safeParse(content)
    if (!data) return []
    return buildSessions(data, {
      provider: 'Kimi' as Provider,
      extractMessages,
      toSession(conv, messages) {
        return {
          sourceId: conv.objectId || conv.id,
          title: conv.title || conv.name || fallbackTitle(messages),
          createdAt: conv.createdAt || conv.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    })
  }
}
