import type { ChatSession, Message } from '@shared/types'
import { PROVIDER_META } from '@shared/constants'

/**
 * 把对话渲染为 Markdown 字符串
 * - 保留消息角色、模型、时间戳
 * - 代码块用 ``` 围栏
 * - 适合导入 Obsidian / Notion / 其他 Markdown 工具
 */
export function renderSessionToMd(session: ChatSession, options?: {
  customTitle?: string
  customDescription?: string
  includeWatermark?: boolean
}): string {
  const title = options?.customTitle || session.title
  const description = options?.customDescription || session.description || ''
  const meta = PROVIDER_META[session.provider] || PROVIDER_META.Unknown
  const messages = session.messages || []
  const includeWatermark = options?.includeWatermark ?? true

  const lines: string[] = []

  // 标题
  lines.push(`# ${title}`)
  lines.push('')

  // 元信息
  lines.push('> **平台**: ' + meta.label + '  ')
  if (session.model) lines.push(`> **模型**: ${session.model}  `)
  lines.push(`> **创建**: ${formatDate(session.createdAt)}  `)
  lines.push(`> **更新**: ${formatDate(session.updatedAt)}  `)
  lines.push(`> **消息数**: ${messages.length}  `)
  if (session.tags.length > 0) {
    lines.push(`> **标签**: ${session.tags.map((t) => `#${t.name}`).join(' ')}  `)
  }
  lines.push('')

  if (description) {
    lines.push(`> ${description}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  // 消息
  for (const msg of messages) {
    lines.push(renderMessage(msg))
    lines.push('')
  }

  if (includeWatermark) {
    lines.push('---')
    lines.push('')
    lines.push(`*Exported from Memora · ${new Date().toISOString().slice(0, 10)}*`)
  }

  return lines.join('\n')
}

function renderMessage(msg: Message): string {
  const roleLabel = msg.role === 'user' ? '🧑 你' : msg.role === 'system' ? '⚙ 系统' : '🤖 AI'
  const time = formatDate(msg.createdAt)
  const model = msg.model ? ` · \`${msg.model}\`` : ''

  const lines: string[] = []
  lines.push(`## ${roleLabel}${model}${time ? ' · ' + time : ''}`)
  lines.push('')
  lines.push(msg.content)
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}
