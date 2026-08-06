import type { Importer, ParsedSession, ParsedMessage } from '../types'
import type { Provider } from '@shared/types'
import { normalizeRole, fallbackTitle } from '../common'

/**
 * 通用 Markdown 导入器
 *
 * 支持三种格式（按优先级匹配）：
 *
 * 1. Shared-Claude-Chats 格式（来自 fuadmefleh/Shared-Claude-Chats 项目）：
 *    ---
 *    # 标题 - Source: https://... - Author: xxx
 *    - Created: 2026-02-04
 *    - Messages: 2
 *
 *    --- ## Human
 *    内容...
 *
 *    --- ## Assistant
 *    内容...
 *
 * 2. Frontmatter 格式：
 *    ---
 *    title: 对话标题
 *    provider: Claude
 *    created_at: 2026-01-01T00:00:00Z
 *    ---
 *    ## user
 *    内容
 *    ## assistant
 *    内容
 *
 * 3. 纯 Markdown（按 H1/H2 标题或分隔符分割消息）
 */

interface ParsedMeta {
  title?: string
  provider?: Provider
  model?: string
  description?: string
  sourceId?: string
  sourceUrl?: string
  author?: string
  createdAt?: string
  messageCount?: number
}

// ===== Shared-Claude-Chats 格式 =====
const SCC_HEADER_RE =
  /^#\s*(.+?)(?:\s*-\s*Source:\s*(\S+))?(?:\s*-\s*Author:\s*(.+?))?\s*$/m
const SCC_CREATED_RE = /^-\s*Created:\s*(.+?)$/m
const SCC_MODEL_RE = /^-\s*Model:\s*(.+?)$/m
// --- ## Human / --- ## Assistant / --- ## System / --- ## Tool
const SCC_TURN_SPLIT_RE = /\n---\s*##\s*/m
const SCC_TURN_HEADER_RE = /^(Human|Assistant|System|Tool|User|Model|AI)(?:\s+#.*)?$/

function tryParseSharedClaudeChats(content: string): ParsedSession | null {
  const headerMatch = content.match(SCC_HEADER_RE)
  if (!headerMatch) return null

  // 必须有 --- ## Human 或 --- ## Assistant 这种分隔
  if (!/\n---\s*##\s*(Human|Assistant|User|Model|AI|System|Tool)/.test(content)) {
    return null
  }

  const title = headerMatch[1].trim()
  const sourceUrl = headerMatch[2]?.trim()
  const created = content.match(SCC_CREATED_RE)?.[1].trim()
  const modelStr = content.match(SCC_MODEL_RE)?.[1].trim()

  // 推断 provider：从 source URL 或 model 字符串
  const provider = inferProviderFromUrl(sourceUrl) ?? inferProviderFromModel(modelStr)

  // 去掉头部元信息，只保留对话部分
  const bodyStart = content.indexOf('\n---')
  const body = bodyStart >= 0 ? content.slice(bodyStart + 1) : content

  // 按 "--- ## " 分隔
  const parts = body.split(SCC_TURN_SPLIT_RE).filter((p) => p.trim())
  if (parts.length === 0) return null

  const messages: ParsedMessage[] = []
  for (const part of parts) {
    // 每段以角色名开头
    const lines = part.split('\n')
    const firstLine = lines[0].trim()
    const headerMatched = firstLine.match(SCC_TURN_HEADER_RE)
    if (!headerMatched) continue

    const role = normalizeRole(headerMatched[1])
    // 去掉第一行（角色标题），其余为内容
    const contentLines = lines.slice(1)
    // 去掉开头多余空行
    while (contentLines.length > 0 && contentLines[0].trim() === '') {
      contentLines.shift()
    }
    const msgContent = contentLines.join('\n').trim()
    if (!msgContent) continue

    messages.push({
      role,
      content: msgContent,
      model: provider !== 'Unknown' ? modelStr : undefined,
      createdAt: created ?? new Date().toISOString()
    })
  }

  if (messages.length === 0) return null

  return {
    sourceId: sourceUrl ? extractIdFromUrl(sourceUrl) : undefined,
    provider: provider,
    model: modelStr,
    title,
    description: sourceUrl ? `来源：${sourceUrl}` : undefined,
    createdAt: created ?? new Date().toISOString(),
    updatedAt: created ?? new Date().toISOString(),
    messages
  }
}

/** 解析 URL 主机名（归一化：去协议前缀、www.、转小写；非法 URL 返回 null） */
function extractHostname(url: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`
  try {
    return new URL(withScheme).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function inferProviderFromUrl(url?: string): Provider {
  if (!url) return 'Unknown'
  const host = extractHostname(url)
  if (!host) return 'Unknown'
  // 仅精确匹配主机名或其后缀子域，避免 substring 误判（如 evilclaude.ai.com）
  const isDomain = (domain: string): boolean => host === domain || host.endsWith(`.${domain}`)
  if (isDomain('claude.ai')) return 'Claude'
  if (isDomain('grok.com')) return 'Grok'
  if (isDomain('kimi.com')) return 'Kimi'
  if (isDomain('qwen.ai') || isDomain('tongyi.aliyun.com')) return 'Qwen'
  if (isDomain('deepseek.com')) return 'DeepSeek'
  if (isDomain('aistudio.google.com')) return 'AIStudio'
  if (isDomain('chatgpt.com') || isDomain('openai.com')) return 'ChatGPT'
  return 'Unknown'
}

function inferProviderFromModel(model?: string): Provider {
  if (!model) return 'Unknown'
  const m = model.toLowerCase()
  if (m.includes('claude')) return 'Claude'
  if (m.includes('gpt')) return 'ChatGPT'
  if (m.includes('gemini')) return 'Gemini'
  if (m.includes('deepseek')) return 'DeepSeek'
  if (m.includes('qwen')) return 'Qwen'
  if (m.includes('kimi')) return 'Kimi'
  if (m.includes('grok')) return 'Grok'
  return 'Unknown'
}

function extractIdFromUrl(url: string): string {
  // https://claude.ai/share/<uuid> → 取最后一段
  const match = url.match(/\/share\/(?:en\/)?([^/?]+)$/)
  if (match) return match[1]
  return url
}

// ===== Frontmatter 格式 =====
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

function tryParseFrontmatter(content: string): ParsedSession | null {
  const fm = content.match(FRONTMATTER_RE)
  if (!fm) return null

  const yaml = fm[1]
  const body = fm[2]
  const meta = parseSimpleYaml(yaml)

  // 按 ## 标题分割消息
  const messages = splitByHeadings(body)
  if (messages.length === 0) return null

  const now = new Date().toISOString()
  return {
    sourceId: meta.sourceId,
    provider: (meta.provider as Provider) ?? 'Markdown',
    model: meta.model,
    title: meta.title || fallbackTitle(messages),
    description: meta.description,
    createdAt: meta.createdAt ?? now,
    updatedAt: meta.updatedAt ?? meta.createdAt ?? now,
    messages
  }
}

function parseSimpleYaml(yaml: string): ParsedMeta & {
  updatedAt?: string
} {
  const result: ParsedMeta & { updatedAt?: string } = {}
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(\w[\w_]*):\s*(.+?)\s*$/)
    if (!m) continue
    const key = m[1].replace(/_/g, '')
    const val = m[2].replace(/^["']|["']$/g, '')
    switch (key) {
      case 'title':
        result.title = val
        break
      case 'provider':
        result.provider = val as Provider
        break
      case 'model':
        result.model = val
        break
      case 'description':
        result.description = val
        break
      case 'sourceId':
      case 'sourceid':
        result.sourceId = val
        break
      case 'createdAt':
      case 'createdat':
        result.createdAt = val
        break
      case 'updatedAt':
      case 'updatedat':
        result.updatedAt = val
        break
    }
  }
  return result
}

function splitByHeadings(body: string): ParsedMessage[] {
  const lines = body.split('\n')
  const messages: ParsedMessage[] = []
  let currentRole: ParsedMessage['role'] | null = null
  let currentContent: string[] = []
  const now = new Date().toISOString()

  const flush = () => {
    if (currentRole && currentContent.length > 0) {
      const text = currentContent.join('\n').trim()
      if (text) {
        messages.push({ role: currentRole, content: text, createdAt: now })
      }
    }
    currentContent = []
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+?)\s*$/)
    if (headingMatch) {
      const heading = headingMatch[1].toLowerCase()
      const role = matchRoleFromHeading(heading)
      if (role) {
        flush()
        currentRole = role
        continue
      }
    }
    if (currentRole) {
      currentContent.push(line)
    }
  }
  flush()

  return messages
}

function matchRoleFromHeading(heading: string): ParsedMessage['role'] | null {
  if (/^(user|human|你|我)/.test(heading)) return 'user'
  if (/^(assistant|ai|model|bot|claude|gpt|gemini|deepseek)/.test(heading)) return 'assistant'
  if (/^system/.test(heading)) return 'system'
  if (/^tool/.test(heading)) return 'tool'
  return null
}

// ===== 纯 Markdown 兜底 =====
function parsePlainMarkdown(content: string): ParsedSession {
  // 把第一段 H1 当标题
  const titleMatch = content.match(/^#\s+(.+?)\s*$/m)
  const title = titleMatch?.[1].trim() || '未命名对话'

  // 按 --- 或空行分段，user/assistant 交替
  const sections = content
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const messages: ParsedMessage[] = []
  const now = new Date().toISOString()
  // 追踪上一个实际角色，避免「连续同角色标题 + 无标题段」时角色错乱
  let lastRole: ParsedMessage['role'] | null = null

  for (const section of sections) {
    // 尝试识别角色
    const headingMatch = section.match(/^#{1,3}\s+(.+?)\s*$/m)
    let role: ParsedMessage['role']
    let body = section

    if (headingMatch) {
      const roleGuess = matchRoleFromHeading(headingMatch[1].toLowerCase())
      if (roleGuess) {
        role = roleGuess
        // 去掉标题行
        body = section.replace(/^#{1,3}\s+.+?\s*$/m, '').trim()
      } else {
        // 有标题但无法识别角色，按交替规则推断
        role = lastRole === 'user' ? 'assistant' : 'user'
      }
    } else {
      // 无标题，按交替规则推断
      role = lastRole === 'user' ? 'assistant' : 'user'
    }

    if (body) {
      messages.push({ role, content: body, createdAt: now })
      lastRole = role
    }
  }

  // 如果没有任何分隔，整篇作为一条 user 消息
  if (messages.length === 0) {
    messages.push({ role: 'user', content: content.trim(), createdAt: now })
  }

  return {
    provider: 'Markdown',
    title,
    createdAt: now,
    updatedAt: now,
    messages
  }
}

export const markdownImporter: Importer = {
  provider: 'Markdown' as Provider,

  detect(filename: string): boolean {
    return filename.toLowerCase().endsWith('.md')
  },

  parse(content: string): ParsedSession[] {
    // 优先尝试 Shared-Claude-Chats 格式
    const scc = tryParseSharedClaudeChats(content)
    if (scc) return [scc]

    // 其次 frontmatter
    const fm = tryParseFrontmatter(content)
    if (fm) return [fm]

    // 兜底纯 Markdown
    return [parsePlainMarkdown(content)]
  }
}
