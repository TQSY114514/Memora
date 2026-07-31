import type { AiConfig, SessionSummary } from '@shared/types'
import { getSession } from '../database/repositories/sessionRepo'
import { upsertSummary, getSummary } from '../database/repositories/summaryRepo'
import { callChat } from './apiClient'

/**
 * AI 总结模块
 * 调用 chat completions 接口生成结构化总结（v1.2 起由 apiClient 路由多协议）
 *
 * 输出结构：
 * - summary: 整体摘要（2-3 段）
 * - keyPoints: 关键决定/要点（数组）
 * - todos: 待办事项（数组）
 * - knowledge: 蒸馏出的可复用知识要点（v1.1 新增）
 * - suggestedTags: AI 建议标签（v1.1 新增，不自动应用）
 */

const SYSTEM_PROMPT = `你是一个 AI 对话总结助手。用户会给你一段 AI 对话记录，请生成结构化总结。

输出格式（严格 JSON，不要 markdown 代码块包裹）：
{
  "summary": "2-3 段对话摘要，概括讨论的主题、过程和结论",
  "keyPoints": ["关键决定1", "关键要点2", "..."],
  "todos": ["待办事项1", "待办事项2", "..."],
  "knowledge": ["可复用知识要点1", "可复用知识要点2", "..."],
  "suggestedTags": ["建议标签1", "建议标签2", "..."]
}

要求：
- summary 用中文，简洁清晰，不超过 300 字
- keyPoints 提取对话中做出的关键决定、重要结论、核心要点（3-8 条）
- todos 提取对话中提到的待办事项、后续行动项（若没有则返回空数组）
- knowledge 提取对话中产生的、未来可复用的知识要点（如技术原理、最佳实践、踩坑经验；若没有则返回空数组）
- suggestedTags 提取 2-5 个能概括对话主题的简短标签（不带 # 号，每个 2-6 字）
- 如果对话内容很短或无实质内容，keyPoints / todos / knowledge / suggestedTags 可以为空数组`

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
  knowledge: string[]
  suggestedTags: string[]
} {
  let jsonStr = raw.trim()
  // 剥离 ```json ... ``` 包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

  const parsed = JSON.parse(jsonStr) as {
    summary?: string
    keyPoints?: string[]
    todos?: string[]
    knowledge?: string[]
    suggestedTags?: string[]
  }

  return {
    summary: parsed.summary || '',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    todos: Array.isArray(parsed.todos) ? parsed.todos : [],
    knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : [],
    suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : []
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
  const raw = await callChat(config, SYSTEM_PROMPT, userPrompt, { temperature: 0.3 })
  const parsed = parseSummaryJson(raw)

  return upsertSummary(sessionId, {
    summary: parsed.summary,
    keyPoints: parsed.keyPoints,
    todos: parsed.todos,
    knowledge: parsed.knowledge,
    suggestedTags: parsed.suggestedTags,
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

    if (summary.knowledge && summary.knowledge.length > 0) {
      lines.push('## 知识要点')
      lines.push('')
      for (const k of summary.knowledge) lines.push(`- ${k}`)
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
