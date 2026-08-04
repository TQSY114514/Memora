/**
 * AI Identity Profile 2.0 —— 一键生成用户身份画像
 *
 * 从偏好、知识库、对话历史中聚合出完整的用户画像，
 * 包含决策模式、沟通风格推断，输出为可粘贴到新 AI 对话的 prompt 文本。
 * 实现"换 AI，不换人设"。
 *
 * v2.0: 新增决策模式分析、沟通风格推断、演化时间线
 */

import { getDatabase } from '../database/connection'
import { inferDecisionPattern, type DecisionPattern } from './decisionPattern'
import { inferCommunicationStyle, type CommunicationStyle } from './communicationStyle'

export interface IdentityProfile {
  generatedAt: string
  basics: {
    role: string[]
    techStack: string[]
    editors: string[]
    languages: string[]
  }
  communication: {
    style: string[]
    format: string[]
    avoid: string[]
  }
  /** v2.0: 推断的沟通风格 */
  communicationStyle: CommunicationStyle
  projects: Array<{
    name: string
    description: string
    techStack: string[]
    status: string
  }>
  preferences: Array<{
    subject: string
    value: string
    confidence: number
  }>
  knowledge: Array<{
    title: string
    type: string
    snippet: string
  }>
  constitution: Array<{
    subject: string
    value: string
  }>
  /** v2.0: 推断的决策模式 */
  decisionPattern: DecisionPattern
  stats: {
    totalSessions: number
    totalMessages: number
    totalPreferences: number
    totalKnowledge: number
    activeSince: string | null
    topProviders: string[]
  }
  /** 可用于直接粘贴到新 AI 对话中的 prompt 文本 */
  promptText: string
}

interface ProfileRow {
  subject: string
  value: string
  confidence: number
  status: string
}

interface KnowledgeRow {
  title: string
  type: string
  content: string
}

interface SessionRow {
  cnt: number
  provider: string
}

interface StatRow {
  totalSessions: number
  totalMessages: number
  firstSession: string | null
}

export function generateIdentityProfile(workspaceId?: string): IdentityProfile {
  const db = getDatabase()

  // 查询偏好
  let prefRows: ProfileRow[]
  if (workspaceId) {
    prefRows = db
      .prepare(
        `SELECT subject, value, confidence, status FROM preferences
         WHERE workspace_id = ? AND status = 'active'
         ORDER BY confidence DESC LIMIT 100`
      )
      .all(workspaceId) as ProfileRow[]
  } else {
    prefRows = db
      .prepare(
        `SELECT subject, value, confidence, status FROM preferences
         WHERE status = 'active'
         ORDER BY confidence DESC LIMIT 100`
      )
      .all() as ProfileRow[]
  }

  // 查询知识
  let knowRows: KnowledgeRow[]
  if (workspaceId) {
    knowRows = db
      .prepare(
        `SELECT title, type, content FROM knowledge_entries
         WHERE workspace_id = ? AND status = 'active'
         ORDER BY updated_at DESC LIMIT 50`
      )
      .all(workspaceId) as KnowledgeRow[]
  } else {
    knowRows = db
      .prepare(
        `SELECT title, type, content FROM knowledge_entries
         WHERE status = 'active'
         ORDER BY updated_at DESC LIMIT 50`
      )
      .all() as KnowledgeRow[]
  }

  // 查询宪法级偏好
  let constitutionRows: ProfileRow[]
  if (workspaceId) {
    constitutionRows = db
      .prepare(
        `SELECT subject, value, confidence, status FROM preferences
         WHERE workspace_id = ? AND source = 'constitution' AND status = 'active'
         ORDER BY confidence DESC LIMIT 50`
      )
      .all(workspaceId) as ProfileRow[]
  } else {
    constitutionRows = db
      .prepare(
        `SELECT subject, value, confidence, status FROM preferences
         WHERE source = 'constitution' AND status = 'active'
         ORDER BY confidence DESC LIMIT 50`
      )
      .all() as ProfileRow[]
  }

  // 统计信息
  let statRow: StatRow | undefined
  if (workspaceId) {
    statRow = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM chat_sessions cs JOIN folders f ON f.id = cs.folder_id WHERE f.workspace_id = ?) as totalSessions,
           (SELECT COUNT(*) FROM messages m JOIN chat_sessions cs ON m.session_id = cs.id JOIN folders f ON f.id = cs.folder_id WHERE f.workspace_id = ?) as totalMessages,
           (SELECT MIN(cs.created_at) FROM chat_sessions cs JOIN folders f ON f.id = cs.folder_id WHERE f.workspace_id = ?) as firstSession`
      )
      .get(workspaceId, workspaceId, workspaceId) as StatRow | undefined
  } else {
    statRow = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM chat_sessions) as totalSessions,
           (SELECT COUNT(*) FROM messages) as totalMessages,
           (SELECT MIN(created_at) FROM chat_sessions) as firstSession`
      )
      .get() as StatRow | undefined
  }

  // 查询 provider 分布
  let providerRows: SessionRow[]
  if (workspaceId) {
    providerRows = db
      .prepare(
        `SELECT cs.provider, COUNT(*) as cnt FROM chat_sessions cs
         JOIN folders f ON f.id = cs.folder_id
         WHERE f.workspace_id = ?
         GROUP BY cs.provider ORDER BY cnt DESC LIMIT 5`
      )
      .all(workspaceId) as SessionRow[]
  } else {
    providerRows = db
      .prepare(
        `SELECT provider, COUNT(*) as cnt FROM chat_sessions
         GROUP BY provider ORDER BY cnt DESC LIMIT 5`
      )
      .all() as SessionRow[]
  }

  // v2.0: 推断决策模式和沟通风格
  const decisionPattern = inferDecisionPattern(workspaceId)
  const communicationStyle = inferCommunicationStyle(workspaceId)

  // 分类偏好
  const roleKeywords = ['职业', '角色', '岗位', '工作', '职位', 'role', 'job', '我是', '身份']
  const techKeywords = ['技术栈', '语言', '框架', '编程', '开发', '技术', 'tech', 'stack', 'language', 'framework']
  const editorKeywords = ['编辑器', 'IDE', 'VSCode', 'Cursor', 'JetBrains', 'Neovim', 'Vim', 'editor']
  const langKeywords = ['语言', '中文', '英文', '日语', 'language', '母语', '沟通语言']
  const styleKeywords = ['风格', 'style', '喜欢', '偏好', '简洁', '详细', '回答方式']
  const formatKeywords = ['格式', 'Markdown', 'format', '代码块', '输出']
  const avoidKeywords = ['避免', '不要', '禁止', 'avoid', 'don\'t', 'never']

  function matchesAny(subject: string, keywords: string[]): boolean {
    const lower = subject.toLowerCase()
    return keywords.some((k) => lower.includes(k.toLowerCase()))
  }

  const basics = {
    role: prefRows.filter((p) => matchesAny(p.subject, roleKeywords)).map((p) => p.value),
    techStack: prefRows.filter((p) => matchesAny(p.subject, techKeywords)).map((p) => p.value),
    editors: prefRows.filter((p) => matchesAny(p.subject, editorKeywords)).map((p) => p.value),
    languages: prefRows.filter((p) => matchesAny(p.subject, langKeywords)).map((p) => p.value)
  }

  const communication = {
    style: prefRows.filter((p) => matchesAny(p.subject, styleKeywords)).map((p) => p.value),
    format: prefRows.filter((p) => matchesAny(p.subject, formatKeywords)).map((p) => p.value),
    avoid: prefRows.filter((p) => matchesAny(p.subject, avoidKeywords)).map((p) => p.value)
  }

  // 从知识库中提取项目信息
  const projectKeywords = ['项目', 'project', '开发', '应用', 'app']

  const projects = knowRows
    .filter((k) => k.type === 'knowledge' && matchesAny(k.title, projectKeywords))
    .slice(0, 10)
    .map((k) => ({
      name: k.title,
      description: k.content.slice(0, 200),
      techStack: extractTechStack(k.content),
      status: 'active'
    }))

  const preferences = prefRows.map((p) => ({
    subject: p.subject,
    value: p.value,
    confidence: p.confidence
  }))

  const knowledge = knowRows.slice(0, 20).map((k) => ({
    title: k.title,
    type: k.type,
    snippet: k.content.slice(0, 150)
  }))

  const constitution = constitutionRows.map((p) => ({
    subject: p.subject,
    value: p.value
  }))

  const stats = {
    totalSessions: statRow?.totalSessions ?? 0,
    totalMessages: statRow?.totalMessages ?? 0,
    totalPreferences: prefRows.length,
    totalKnowledge: knowRows.length,
    activeSince: statRow?.firstSession ?? null,
    topProviders: providerRows.map((r) => r.provider)
  }

  // 生成 prompt 文本（v2.0 增强：包含决策模式和沟通风格）
  const promptText = buildPromptText(basics, communication, communicationStyle, decisionPattern, projects, constitution, preferences)

  return {
    generatedAt: new Date().toISOString(),
    basics,
    communication,
    communicationStyle,
    projects,
    preferences,
    knowledge,
    constitution,
    decisionPattern,
    stats,
    promptText
  }
}

function extractTechStack(content: string): string[] {
  const techs = [
    'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java', 'C++', 'C#',
    'React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt',
    'Electron', 'Tauri', 'Node.js', 'Deno', 'Bun',
    'SQLite', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
    'Docker', 'Kubernetes', 'AWS', 'Vercel', 'Cloudflare',
    'Tailwind', 'Vite', 'Webpack', 'esbuild',
    'Git', 'GitHub', 'GitLab'
  ]
  return techs.filter((t) => content.toLowerCase().includes(t.toLowerCase()))
}

function buildPromptText(
  basics: IdentityProfile['basics'],
  communication: IdentityProfile['communication'],
  communicationStyle: CommunicationStyle,
  decisionPattern: DecisionPattern,
  projects: IdentityProfile['projects'],
  constitution: IdentityProfile['constitution'],
  preferences: IdentityProfile['preferences']
): string {
  const lines: string[] = []

  lines.push('# My AI Identity Profile')
  lines.push('')
  lines.push('> 由 Memora 自动生成。将此文本粘贴到新 AI 对话开头，让 AI 立刻了解你。')
  lines.push('')

  if (basics.role.length > 0) {
    lines.push('## About Me')
    for (const r of basics.role) lines.push(`- ${r}`)
    lines.push('')
  }

  if (basics.techStack.length > 0) {
    lines.push('## Tech Stack')
    for (const t of basics.techStack) lines.push(`- ${t}`)
    lines.push('')
  }

  if (basics.editors.length > 0) {
    lines.push('## Tools')
    for (const e of basics.editors) lines.push(`- ${e}`)
    lines.push('')
  }

  // v2.0: 决策模式
  lines.push('## Decision Patterns')
  lines.push(`- Open Source Preference: ${(decisionPattern.prefers_open_source * 100).toFixed(0)}%`)
  if (decisionPattern.cost_sensitive > 0.5) {
    lines.push(`- Cost Sensitive: ${(decisionPattern.cost_sensitive * 100).toFixed(0)}%`)
  }
  if (decisionPattern.likes_new_tech > 0.5) {
    lines.push(`- Early Adopter: ${(decisionPattern.likes_new_tech * 100).toFixed(0)}%`)
  }
  if (decisionPattern.values_privacy > 0.5) {
    lines.push(`- Privacy Conscious: ${(decisionPattern.values_privacy * 100).toFixed(0)}%`)
  }
  if (decisionPattern.prefers_simplicity > 0.5) {
    lines.push(`- Prefers Simplicity: ${(decisionPattern.prefers_simplicity * 100).toFixed(0)}%`)
  }
  lines.push('')

  // v2.0: 沟通风格
  if (communicationStyle.evidence.length > 0) {
    lines.push('## Communication Style')
    lines.push(`- Formality: ${communicationStyle.formality}`)
    lines.push(`- Detail Level: ${communicationStyle.detail_level}`)
    if (communicationStyle.prefers.short_answer) lines.push('- Prefers: Short answers')
    if (communicationStyle.prefers.code_first) lines.push('- Prefers: Code-first responses')
    if (communicationStyle.prefers.markdown) lines.push('- Prefers: Markdown format')
    lines.push('')
  }

  if (communication.style.length > 0 || communication.format.length > 0) {
    lines.push('## Communication Preferences')
    if (communication.style.length > 0) {
      lines.push('Style:')
      for (const s of communication.style) lines.push(`- ${s}`)
    }
    if (communication.format.length > 0) {
      lines.push('Format:')
      for (const f of communication.format) lines.push(`- ${f}`)
    }
    lines.push('')
  }

  if (communication.avoid.length > 0) {
    lines.push('## Avoid')
    for (const a of communication.avoid) lines.push(`- ${a}`)
    lines.push('')
  }

  if (projects.length > 0) {
    lines.push('## Projects')
    for (const p of projects) {
      lines.push(`### ${p.name}`)
      lines.push(p.description.slice(0, 150))
      if (p.techStack.length > 0) {
        lines.push(`Tech: ${p.techStack.join(', ')}`)
      }
      lines.push('')
    }
  }

  if (constitution.length > 0) {
    lines.push('## Personal Constitution')
    for (const c of constitution) {
      lines.push(`- ${c.subject}: ${c.value}`)
    }
    lines.push('')
  }

  if (preferences.length > 0) {
    lines.push('## Other Preferences')
    for (const p of preferences.slice(0, 20)) {
      lines.push(`- ${p.subject}: ${p.value} (confidence: ${(p.confidence * 100).toFixed(0)}%)`)
    }
    lines.push('')
  }

  return lines.join('\n')
}