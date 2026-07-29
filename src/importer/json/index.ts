import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'

/**
 * 通用 JSON 导入器
 * 接受符合 Memora schema 的 JSON 文件（单个或数组）
 * 也兼容简单的 { title, messages: [{role, content}] } 结构
 */
interface SimpleMessage {
  role?: string
  content?: string
  model?: string
  createdAt?: string
  created_at?: string
}

interface SimpleSession {
  id?: string
  sourceId?: string
  source_id?: string
  provider?: string
  model?: string
  title?: string
  description?: string
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
  messages?: SimpleMessage[]
}

function tryParse(json: string): SimpleSession[] | SimpleSession | null {
  try {
    const data = JSON.parse(json)
    if (Array.isArray(data)) return data as SimpleSession[]
    if (data && typeof data === 'object') return data as SimpleSession
    return null
  } catch {
    return null
  }
}

function normalizeRole(role?: string): ParsedMessage['role'] {
  switch (role) {
    case 'user':
    case 'human':
      return 'user'
    case 'assistant':
    case 'ai':
    case 'model':
      return 'assistant'
    case 'system':
      return 'system'
    case 'tool':
      return 'tool'
    default:
      return 'assistant'
  }
}

export const jsonImporter: Importer = {
  provider: 'JSON' as Provider,

  detect(filename: string, content: string): boolean {
    if (!filename.toLowerCase().endsWith('.json')) return false
    const data = tryParse(content)
    if (!data) return false
    const arr = Array.isArray(data) ? data : [data]
    // 必须有 messages 数组才算
    return arr.some((s) => Array.isArray(s.messages))
  },

  parse(content: string): ParsedSession[] {
    const data = tryParse(content)
    if (!data) return []
    const arr = Array.isArray(data) ? data : [data]
    const sessions: ParsedSession[] = []

    for (const s of arr) {
      if (!Array.isArray(s.messages) || s.messages.length === 0) continue
      const now = new Date().toISOString()
      const messages: ParsedMessage[] = s.messages
        .filter((m) => m.content && typeof m.content === 'string')
        .map((m) => ({
          role: normalizeRole(m.role),
          content: m.content!,
          model: m.model,
          createdAt: m.createdAt ?? m.created_at ?? now
        }))

      if (messages.length === 0) continue

      sessions.push({
        sourceId: s.sourceId ?? s.source_id,
        provider: (s.provider as Provider) ?? ('JSON' as Provider),
        model: s.model,
        title: s.title || fallbackTitle(messages),
        description: s.description,
        createdAt: s.createdAt ?? s.created_at ?? now,
        updatedAt: s.updatedAt ?? s.updated_at ?? now,
        messages
      })
    }
    return sessions
  }
}

function fallbackTitle(messages: ParsedMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (first) {
    const text = first.content.replace(/\s+/g, ' ').trim()
    return text.length > 50 ? text.slice(0, 50) + '…' : text
  }
  return '未命名对话'
}
