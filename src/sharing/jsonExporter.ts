import type { ChatSession, Message } from '@shared/types'
import { PROVIDER_META } from '@shared/constants'

/**
 * 把对话导出为通用 JSON 格式（OpenAI Chat Completions 兼容）
 *
 * 格式：
 * {
 *   "title": "...",
 *   "provider": "...",
 *   "model": "...",
 *   "createdAt": "...",
 *   "updatedAt": "...",
 *   "messages": [
 *     { "role": "user", "content": "..." },
 *     { "role": "assistant", "content": "..." }
 *   ]
 * }
 *
 * 适用场景：
 * - 导入到支持 OpenAI 格式的 AI 工具
 * - 导入到 OpenCode（放到 ~/.opencode/ 目录）
 * - 通用数据迁移 / 备份
 */
export function renderSessionToJson(session: ChatSession, options?: {
  customTitle?: string
  customDescription?: string
}): string {
  const title = options?.customTitle || session.title
  const meta = PROVIDER_META[session.provider] || PROVIDER_META.Unknown
  const messages = session.messages || []

  const output = {
    title,
    description: options?.customDescription || session.description || '',
    provider: session.provider,
    providerLabel: meta.label,
    model: session.model || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: messages.length,
    tags: session.tags.map((t) => t.name),
    messages: messages.map((msg) => formatMessage(msg))
  }

  return JSON.stringify(output, null, 2)
}

function formatMessage(msg: Message) {
  return {
    role: msg.role,
    content: msg.content,
    model: msg.model || undefined,
    createdAt: msg.createdAt
  }
}