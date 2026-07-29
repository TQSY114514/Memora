import type { AiConfig, SessionSummary } from '@shared/types'
import { getSession } from '../database/repositories/sessionRepo'
import { upsertSummary, getSummary } from '../database/repositories/summaryRepo'

/**
 * AI 总结模块
 * 调用 OpenAI 兼容的 chat completions 接口，生成结构化总结
 *
 * 输出结构：
 * - summary: 整体摘要（2-3 段）
 * - keyPoints: 关键决定/要点（数组）
 * - todos: 待办事项（数组）
 */

const SYSTEM_PROMPT = `你是一个 AI 对话总结助手。用户会给你一段 AI 对话记录，请生成结构化总结。

输出格式（严格 JSON，不要 markdown 代码块包裹）：
{
  "summary": "2-3 段对话摘要，概括讨论的主题、过程和结论",
  "keyPoints": ["关键决定1", "关键要点2", "..."],
  "todos": ["待办事项1", "待办事项2", "..."]
}

要求：
- summary 用中文，简洁清晰，不超过 300 字
- keyPoints 提取对话中做出的关键决定、重要结论、核心要点（3-8 条）
- todos 提取对话中提到的待办事项、后续行动项（若没有则返回空数组）
- 如果对话内容很短或无实质内容，keyPoints 和 todos 可以为空数组`

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
  error?: { message: string }
}

/** 调用 chat completions */
async function callChat(config: AiConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    })
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`API ${resp.status}: ${errText}`)
  }

  const data = (await resp.json()) as ChatCompletionResponse
  if (data.error) throw new Error(data.error.message)
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('API 返回空内容')
  return content
}

/** 把对话渲染为文本（截断超长对话） */
function renderSession(session: {
  title: string
  provider: string
  messages?: Array<{ role: string; content: string }>
}): string {
  const MAX_CHARS = 12000 // 约 4000 tokens
  const messages = session.messages || []
  let text = `# 对话标题: ${session.title}\n# 来源: ${session.provider}\n\n`
  let totalLen = text.length

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : msg.role
    const block = `## ${roleLabel}:\n${msg.content}\n\n`
    if (totalLen + block.length > MAX_CHARS) {
      // 截断最后一条
      const remaining = MAX_CHARS - totalLen
      if (remaining > 200) {
        text += block.slice(0, remaining) + '…[截断]\n'
      }
      text += '\n[对话过长，已截断]'
      break
    }
    text += block
    totalLen += block.length
  }

  return text
}

/** 从 LLM 响应中解析 JSON（容错：剥离 markdown 代码块） */
function parseSummaryJson(raw: string): {
  summary: string
  keyPoints: string[]
  todos: string[]
} {
  let jsonStr = raw.trim()
  // 剥离 ```json ... ``` 包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

  const parsed = JSON.parse(jsonStr) as {
    summary?: string
    keyPoints?: string[]
    todos?: string[]
  }

  return {
    summary: parsed.summary || '',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    todos: Array.isArray(parsed.todos) ? parsed.todos : []
  }
}

/** 生成（或重新生成）会话总结 */
export async function generateSummary(
  sessionId: string,
  config: AiConfig
): Promise<SessionSummary> {
  const session = getSession(sessionId, true)
  if (!session) throw new Error('会话不存在')
  if (!session.messages || session.messages.length === 0) {
    throw new Error('会话无消息内容')
  }

  const userPrompt = renderSession(session)
  const raw = await callChat(config, SYSTEM_PROMPT, userPrompt)
  const parsed = parseSummaryJson(raw)

  return upsertSummary(sessionId, {
    summary: parsed.summary,
    keyPoints: parsed.keyPoints,
    todos: parsed.todos,
    model: config.chatModel
  })
}

/** 获取会话总结（不触发生成） */
export function getSessionSummary(sessionId: string): SessionSummary | null {
  return getSummary(sessionId)
}

/** 生成 knowledge.md（知识沉淀） */
export function generateKnowledgeMd(sessionId: string): string {
  const session = getSession(sessionId, false)
  const summary = getSummary(sessionId)
  if (!session) throw new Error('会话不存在')

  const lines: string[] = []
  lines.push(`# ${session.title}`)
  lines.push('')
  lines.push(`> 来源: ${session.provider} · ${new Date(session.createdAt).toLocaleDateString('zh-CN')}`)
  lines.push('')

  if (summary) {
    lines.push('## 摘要')
    lines.push('')
    lines.push(summary.summary)
    lines.push('')

    if (summary.keyPoints.length > 0) {
      lines.push('## 关键决定')
      lines.push('')
      for (const p of summary.keyPoints) lines.push(`- ${p}`)
      lines.push('')
    }

    if (summary.todos.length > 0) {
      lines.push('## 待办事项')
      lines.push('')
      for (const t of summary.todos) lines.push(`- [ ] ${t}`)
      lines.push('')
    }
  } else {
    lines.push('> 尚未生成 AI 总结。点击「生成总结」按钮创建。')
    lines.push('')
  }

  return lines.join('\n')
}
