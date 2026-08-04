import type { MessageRole, Provider } from '@shared/types'
import type { ParsedMessage, ParsedSession } from './types'

/** 未命名对话的默认标题 */
export const UNTITLED_TITLE = '未命名对话'

/** 安全解析 JSON，非法输入返回 null */
export function safeParseJson(json: string): unknown | null {
  try {
    const data: unknown = JSON.parse(json)
    return data
  } catch {
    return null
  }
}

/** 角色归一化：兼容各平台（human/model/ai/bot/function 及中文角色） */
export function normalizeRole(role?: string): MessageRole {
  const r = (role ?? '').toLowerCase()
  if (r === 'user' || r === 'human' || r === '你' || r === '我') return 'user'
  if (r === 'assistant' || r === 'ai' || r === 'model' || r === 'bot') return 'assistant'
  if (r === 'system') return 'system'
  if (r === 'tool' || r === 'function') return 'tool'
  return 'assistant'
}

/**
 * 时间字段统一转 ISO：支持 Unix 秒、毫秒、数字字符串与 ISO 字符串。
 * 无效或缺失返回 undefined，由调用方决定回退值。
 */
export function toIsoTimestamp(value?: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const fromMs = (ms: number): string | undefined => {
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  if (typeof value === 'number') {
    return fromMs(value < 1e12 ? value * 1000 : value)
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      const n = Number(value)
      return fromMs(n < 1e12 ? n * 1000 : n)
    }
    const d = new Date(value)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

/** 无标题时用首条 user 消息截断生成标题（按码点截断，避免切断 emoji） */
export function fallbackTitle(messages: ParsedMessage[], maxLength = 50): string {
  const first = messages.find((m) => m.role === 'user')
  if (first) {
    const text = first.content.replace(/\s+/g, ' ').trim()
    if (text.length <= maxLength) return text
    return Array.from(text).slice(0, maxLength).join('') + '…'
  }
  return UNTITLED_TITLE
}

/** 从 content.parts 数组提取文本（兼容字符串与 { text } 片段） */
export function extractTextParts(parts: unknown[] | undefined): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => {
      if (typeof p === 'string') return p
      if (p && typeof p === 'object' && 'text' in p) {
        return String((p as { text?: unknown }).text ?? '')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * 通用会话构建器：消除各导入器 parse() 中重复的
 * 「遍历 → 提取消息 → 跳过空 → 组装 ParsedSession → 单条失败不阻断」逻辑。
 *
 * 各导入器只需提供：
 * - extractMessages：从单个会话对象提取消息
 * - toSession：从单条会话 + 消息提取非公共字段（标题/时间/来源等）
 */
export interface SessionBuilderOptions<T> {
  provider: Provider
  extractMessages: (item: T) => ParsedMessage[]
  toSession: (item: T, messages: ParsedMessage[]) => Omit<ParsedSession, 'provider' | 'messages'>
}

export function buildSessions<T>(
  items: T[] | null | undefined,
  opts: SessionBuilderOptions<T>
): ParsedSession[] {
  if (!Array.isArray(items)) return []
  const sessions: ParsedSession[] = []
  for (const item of items) {
    try {
      const messages = opts.extractMessages(item)
      if (messages.length === 0) continue
      sessions.push({ ...opts.toSession(item, messages), provider: opts.provider, messages })
    } catch {
      // 单条解析失败不阻断整批导入
    }
  }
  return sessions
}
