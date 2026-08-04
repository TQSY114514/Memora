import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, normalizeRole, toIsoTimestamp, fallbackTitle, extractTextParts, buildSessions } from '../common'

/**
 * ChatGPT 导入器
 * 解析官方导出的 conversations.json
 *
 * 结构：
 * [{
 *   "title": "...",
 *   "create_time": 1700000000,
 *   "update_time": 1700001000,
 *   "id": "abc-123",
 *   "mapping": {
 *     "<uuid>": {
 *       "id": "<node-id>",
 *       "parent": "<parent-uuid>",
 *       "children": ["<child-uuid>"],
 *       "message": {
 *         "id": "<msg-id>",
 *         "author": { "role": "user" | "assistant" | "system" | "tool" },
 *         "content": { "content_type": "text", "parts": ["..."] },
 *         "model": "gpt-4",
 *         "create_time": 1700000000
 *       }
 *     }
 *   }
 * }]
 */
interface ChatGPTMappingNode {
  id: string
  parent?: string
  children?: string[]
  message?: {
    id?: string
    author?: { role?: string }
    content?: { content_type?: string; parts?: unknown[] }
    model?: string
    create_time?: number
  }
}

interface ChatGPTConversation {
  title?: string
  id?: string
  create_time?: number
  update_time?: number
  mapping?: Record<string, ChatGPTMappingNode>
}

function safeParse(json: string): ChatGPTConversation[] | null {
  const data = safeParseJson(json)
  if (Array.isArray(data)) return data as ChatGPTConversation[]
  // 单条对话也支持
  if (data && typeof data === 'object' && (data as ChatGPTConversation).mapping) {
    return [data as ChatGPTConversation]
  }
  return null
}

/** 从 mapping 中按拓扑顺序提取消息（ChatGPT 用树结构，取主路径） */
function extractFromMapping(
  mapping: Record<string, ChatGPTMappingNode>
): ParsedMessage[] {
  // 找根节点（parent 为空或 undefined）
  let rootId: string | undefined
  for (const [id, node] of Object.entries(mapping)) {
    if (!node.parent) {
      rootId = id
      break
    }
  }
  if (!rootId) rootId = Object.keys(mapping)[0]
  if (!rootId) return []

  // 沿 children[0] 走主路径（忽略分支）
  const messages: ParsedMessage[] = []
  const visited = new Set<string>()
  let currentId: string | undefined = rootId

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const node: ChatGPTMappingNode | undefined = mapping[currentId]
    if (!node) break

    if (node.message?.content?.parts) {
      const role = normalizeRole(node.message.author?.role)
      const text = extractTextParts(node.message.content.parts)
      if (text) {
        messages.push({
          role,
          content: text,
          model: node.message.model,
          createdAt: toIsoTimestamp(node.message.create_time) ?? new Date().toISOString()
        })
      }
    }

    currentId = node.children?.[0]
  }

  return messages
}

export const chatgptImporter: Importer = {
  provider: 'ChatGPT' as Provider,

  detect(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (lower === 'conversations.json') return true
    if (!lower.endsWith('.json')) return false
    // 尝试解析，检查结构特征
    const data = safeParse(content)
    if (!data) return false
    return data.some(
      (c) => c.mapping && typeof c.mapping === 'object'
    )
  },

  parse(content: string): ParsedSession[] {
    const data = safeParse(content)
    if (!data) return []
    return buildSessions(data, {
      provider: 'ChatGPT' as Provider,
      extractMessages: (conv) => (conv.mapping ? extractFromMapping(conv.mapping) : []),
      toSession(conv, messages) {
        const title = conv.title && conv.title.trim() ? conv.title.trim() : fallbackTitle(messages)
        const createdAt = toIsoTimestamp(conv.create_time) ?? new Date().toISOString()
        return {
          sourceId: conv.id,
          title,
          createdAt,
          updatedAt: toIsoTimestamp(conv.update_time ?? conv.create_time) ?? createdAt
        }
      }
    })
  }
}
