import { v4 as uuidv4 } from 'uuid'
import type { ChatSession, Message } from '@shared/types'

/**
 * 把对话导出为 Claude Code 的 jsonl 格式
 *
 * Claude Code 在 ~/.claude/projects/<项目名>/ 下为每个对话存一个 .jsonl 文件，
 * 每行一个 JSON 对象，按时间顺序排列，通过 parentUuid 串联成对话链。
 *
 * 用法：导出 .jsonl 后，用户手动放到 ~/.claude/projects/<某项目>/ 下，
 * 重启 Claude Code 即可在其历史中看到这条对话。
 *
 * 格式参考（由 localExtractor.ts 的解析逻辑逆推）：
 * - summary 条目：{"type":"summary","summary":"标题",...}（可选，提供对话标题）
 * - user 条目：    {"type":"user","message":{"role":"user","content":"文本"},...}
 * - assistant 条目：{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"文本"}]},...}
 */
export function renderSessionToClaudeCode(
  session: ChatSession,
  options?: { customTitle?: string; customDescription?: string }
): string {
  const title = options?.customTitle || session.title
  const messages = session.messages || []
  const lines: string[] = []

  // 1. summary 条目（提供对话标题，Claude Code 会优先显示）
  const rootUuid = uuidv4()
  lines.push(
    JSON.stringify({
      type: 'summary',
      summary: title,
      leafUuid: rootUuid,
      timestamp: messages[0]?.createdAt || session.createdAt
    })
  )

  // 2. 消息条目，按顺序用 parentUuid 串联
  let parentUuid: string | null = null
  for (const msg of messages) {
    const uuid = uuidv4()
    lines.push(
      JSON.stringify({
        type: msg.role === 'user' ? 'user' : 'assistant',
        message: {
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: toClaudeCodeContent(msg)
        },
        uuid,
        parentUuid,
        timestamp: msg.createdAt
      })
    )
    parentUuid = uuid
  }

  return lines.join('\n')
}

/** Claude Code 的 content 字段：user 用字符串，assistant 用 [{type:'text',text}] 数组 */
function toClaudeCodeContent(msg: Message): string | Array<{ type: 'text'; text: string }> {
  if (msg.role === 'user') {
    return msg.content
  }
  // assistant / system / tool 统一用数组格式
  return [{ type: 'text', text: msg.content }]
}
