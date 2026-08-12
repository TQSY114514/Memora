import type { Importer, ParsedSession } from '../types'
import type { Provider } from '@shared/types'
import { safeParseJson, fallbackTitle, toIsoTimestamp } from '../common'
import { assembleOpenCodeMessages } from './parts'
import type { OpenCodeMessage, OpenCodeSession } from './parts'

/**
 * OpenCode 导入器
 *
 * 支持用户在导入中心直接拖入的 OpenCode JSON 文件：
 * 1. { sessions: Session[] } —— 批量导出的会话列表
 * 2. 单个 { id, title?, time?, messages: [...] }
 * 3. 裸消息数组 [...]（包装为一个会话）
 *
 * detect 必须严格：避免抢走通用 JSON（{title, messages:[{role,content}]}），
 * 要求同时满足「消息特征」（role∈{user,assistant} 且带 parts 或 msg_ 前缀 id）
 * 与「OpenCode 指纹」（parts / time.created / callID / sessionID 至少其一）。
 */

/** OpenCode 指纹：JSON 原文中出现这些键即大概率是 OpenCode 数据 */
function hasOpenCodeFingerprint(content: string): boolean {
  if (content.includes('"callID"')) return true
  if (content.includes('"sessionID"')) return true
  if (content.includes('"parts"')) return true
  // time.created 形状（容忍 time 与 { 之间的空白）
  return /"time"\s*:\s*\{\s*"created"/.test(content)
}

/** 判断单个消息是否具备 OpenCode 消息特征 */
function isOpenCodeMessage(m: unknown): boolean {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false
  const obj = m as Record<string, unknown>
  if (obj.role !== 'user' && obj.role !== 'assistant') return false
  if (Array.isArray(obj.parts)) return true
  return typeof obj.id === 'string' && obj.id.startsWith('msg_')
}

/** 收集所有候选消息对象（顶层数组 / { sessions } / 单会话 { messages }） */
function collectMessages(data: unknown): unknown[] {
  if (Array.isArray(data)) return data as unknown[]
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>
  if (Array.isArray(obj.sessions)) {
    return obj.sessions.flatMap((s) => {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return []
      const msgs = (s as Record<string, unknown>).messages
      return Array.isArray(msgs) ? (msgs as unknown[]) : []
    })
  }
  if (Array.isArray(obj.messages)) return obj.messages as unknown[]
  return []
}

export const opencodeImporter: Importer = {
  provider: 'OpenCode' as Provider,

  detect(filename: string, content: string): boolean {
    if (!filename.toLowerCase().endsWith('.json')) return false
    const data = safeParseJson(content)
    if (!data || typeof data !== 'object') return false
    const messages = collectMessages(data)
    if (!messages.some(isOpenCodeMessage)) return false
    return hasOpenCodeFingerprint(content)
  },

  parse(content: string): ParsedSession[] {
    const data = safeParseJson(content)
    if (!data) return []
    const sessions: ParsedSession[] = []
    const now = new Date().toISOString()

    const build = (sess: OpenCodeSession | null, messages: OpenCodeMessage[]): void => {
      const parsed = assembleOpenCodeMessages(messages)
      if (parsed.length === 0) return
      sessions.push({
        sourceId: sess?.id,
        provider: 'OpenCode' as Provider,
        title: String(sess?.title || '').trim() || fallbackTitle(parsed),
        createdAt: toIsoTimestamp(sess?.time?.created) ?? now,
        updatedAt: toIsoTimestamp(sess?.time?.updated ?? sess?.time?.created) ?? now,
        messages: parsed
      })
    }

    if (Array.isArray(data)) {
      // 裸消息数组 → 包装为一个会话
      build(null, data as OpenCodeMessage[])
    } else {
      const obj = data as Record<string, unknown>
      if (Array.isArray(obj.sessions)) {
        for (const s of obj.sessions) {
          if (!s || typeof s !== 'object' || Array.isArray(s)) continue
          const sess = s as OpenCodeSession
          if (Array.isArray(sess.messages)) build(sess, sess.messages)
        }
      } else if (Array.isArray(obj.messages)) {
        // 单会话对象
        build(data as OpenCodeSession, obj.messages as OpenCodeMessage[])
      }
    }
    return sessions
  }
}
