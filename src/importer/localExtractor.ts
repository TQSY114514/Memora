/**
 * 本地数据扒取器 —— 从 AI 应用的本地存储直接读取对话
 *
 * 当前支持扒取：
 * 1. Cursor —— 读取 state.vscdb（SQLite，只读），从 ItemTable 提取 composer 对话
 * 2. Claude Code —— 读取 ~/.claude/projects 下的 .jsonl 对话日志
 *
 * 安全保证：
 * - 只读模式打开外部数据库，绝不写入
 * - 仅读取对话相关数据，不读取配置/密钥/凭据
 * - 扒取结果暂存内存，用户确认后才导入
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import type { Provider, ExtractedSession } from '@shared/types'
import type { ParsedMessage } from './types'
import { registerBuiltins } from './index'

/**
 * 动态加载 better-sqlite3（仅 Cursor 扒取需要）
 *
 * 关键：不能在模块顶部静态 import，否则一旦 native 模块加载失败
 * （版本不匹配/路径问题），整个 localExtractor 会加载失败，
 * 连不依赖 sqlite 的 ClaudeCode 扒取也会一起崩。
 * 改为按需 require + try/catch，让 ClaudeCode 扒取不被拖累。
 */
let _Database: any = null
function loadSqlite(): any {
  if (_Database) return _Database
  try {
    _Database = require('better-sqlite3')
    return _Database
  } catch (e) {
    throw new Error(`无法加载 better-sqlite3（${(e as Error).message}）。Claude Code 扒取不受影响。`)
  }
}

/** 生成临时 ID */
function tmpId(): string {
  return 'ext_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** 安全 JSON parse */
function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function toISO(v: unknown): string {
  if (!v) return new Date().toISOString()
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v
    const d = new Date(ms)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  if (typeof v === 'string') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

function fallbackTitle(msgs: ParsedMessage[]): string {
  const first = msgs.find((m) => m.role === 'user')
  if (first) {
    const t = first.content.replace(/\s+/g, ' ').trim()
    return t.length > 50 ? t.slice(0, 50) + '…' : t
  }
  return '未命名对话'
}

// ============================================================
// Cursor 扒取：读取 state.vscdb 的 ItemTable
// ============================================================

interface CursorComposerMessage {
  role?: string
  text?: string
  content?: string
  sender?: string
  type?: string
  richText?: string
  bubble?: string
  fullText?: string
  ctx?: { text?: string }
}

interface CursorComposerChat {
  id?: string
  name?: string
  title?: string
  createdAt?: number | string
  lastUpdatedAt?: number | string
  fullConversationHeadersOnly?: CursorComposerMessage[]
  conversation?: CursorComposerMessage[]
  messages?: CursorComposerMessage[]
  chatTitle?: string
  composerBubbles?: CursorComposerMessage[]
  bubbles?: CursorComposerMessage[]
  fullConversation?: CursorComposerMessage[]
}

/** 从 state.vscdb 提取 Cursor 对话 */
function extractCursor(dbPath: string): ExtractedSession[] {
  console.log("[extractor] Cursor dbPath:", dbPath)
  const Database = loadSqlite()
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    // Cursor 把 composer 数据存在 ItemTable 的 value 字段（BLOB/TEXT）
    // 可能的 key：composer.composerData, aiService.prompts, workbench.panel.aichat...
    let rows: Array<{ key: string; value: Buffer | string }> = []
    try {
      rows = db.prepare('SELECT key, value FROM ItemTable').all() as Array<{ key: string; value: Buffer | string }>
    } catch {
      // ItemTable 不存在，尝试 cursorDatabase
      try {
        rows = db.prepare('SELECT key, value FROM cursorDatabase').all() as Array<{ key: string; value: Buffer | string }>
      } catch {
        return []
      }
    }

    const sessions: ExtractedSession[] = []
    const seen = new Set<string>()

    console.log("[extractor] rows:", rows.length)
    for (const row of rows) {
      const valStr = Buffer.isBuffer(row.value) ? row.value.toString('utf-8') : String(row.value)
      const parsed = tryParse<unknown>(valStr)
      if (!parsed) continue

      // 数据可能是单个对象、数组、或嵌套结构
      const chats = extractCursorChats(parsed)
      for (const chat of chats) {
        const messages = extractCursorMessages(chat)
        if (messages.length === 0) continue

        const sourceId = chat.id || ''
        if (sourceId && seen.has(sourceId)) continue
        if (sourceId) seen.add(sourceId)

        const title = chat.title || chat.name || chat.chatTitle || fallbackTitle(messages)
        const createdAt = toISO(chat.createdAt)
        const updatedAt = toISO(chat.lastUpdatedAt || chat.createdAt)

        sessions.push({
          id: tmpId(),
          provider: 'Cursor' as Provider,
          title,
          source: 'Cursor 本地扒取',
          messageCount: messages.length,
          createdAt,
          updatedAt,
          messages
        })
      }
    }
    console.log("[extractor] Cursor done: sessions=", sessions.length)
    return sessions
  } finally {
    db.close()
  }
}

/** 从任意结构中提取 Cursor 对话列表 */
function extractCursorChats(data: unknown, depth = 0): CursorComposerChat[] {
  if (depth > 5) return []  // 防止无限递归
  if (Array.isArray(data)) {
    return data.filter((d) => d && typeof d === 'object') as CursorComposerChat[]
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    // 常见：{ allChats: [...] } / { chats: [...] } / { composerData: { ... } }
    for (const key of ['allChats', 'chats', 'composerChats', 'conversations']) {
      if (Array.isArray(obj[key])) return obj[key] as CursorComposerChat[]
    }
    // 单个对话对象
    if (obj.fullConversationHeadersOnly || obj.conversation || obj.messages) {
      return [obj as unknown as CursorComposerChat]
    }
    // 嵌套：{ composerData: { allChats: [...] } }
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        const nested = extractCursorChats(obj[key], depth + 1)
        if (nested.length > 0) return nested
      }
    }
  }
  return []
}

function normalizeRole(role?: string): ParsedMessage['role'] {
  const r = (role || '').toLowerCase()
  if (r === 'user' || r === 'human') return 'user'
  if (r === 'assistant' || r === 'ai' || r === 'model' || r === 'bot') return 'assistant'
  if (r === 'system') return 'system'
  if (r === 'tool') return 'tool'
  return 'assistant'
}

/** 从 Cursor 对话对象提取消息 */
function extractCursorMessages(chat: CursorComposerChat): ParsedMessage[] {
  const raw = chat.fullConversationHeadersOnly || chat.conversation || chat.messages || chat.composerBubbles || chat.bubbles || chat.fullConversation || []
  const msgs: ParsedMessage[] = []
  for (const m of raw) {
    const role = normalizeRole(m.role || m.sender || m.type)
    const content = m.text || m.content || m.fullText || m.richText || m.bubble || (m.ctx && m.ctx.text) || ''
    if (!content || !content.trim()) continue
    const cleanContent = cleanCursorContent(content)
    if (cleanContent) msgs.push({ role, content: cleanContent, createdAt: new Date().toISOString() })
  }
  return msgs
}

function cleanCursorContent(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed.ops && Array.isArray(parsed.ops)) {
        return parsed.ops.map((op: { insert?: string }) => op.insert || '').join('').trim()
      }
      if (typeof parsed.text === 'string') return parsed.text.trim()
      if (typeof parsed.content === 'string') return parsed.content.trim()
    } catch {
      // 非合法 JSON，按原始文本返回
    }
  }
  return trimmed
}

// ============================================================
// Claude Code 扒取：读取 ~/.claude/projects/**/*.jsonl
// ============================================================

interface ClaudeCodeEntry {
  type?: string          // 'user' | 'assistant' | 'summary' | 'custom-title' | 'ai-title' | ...
  message?: { role?: string; content?: unknown }
  timestamp?: string
  summary?: string
  customTitle?: string   // 用户自定义标题
  aiTitle?: string       // AI 生成的标题
  parentUuid?: string
  uuid?: string
}

function extractClaudeCode(dir: string): ExtractedSession[] {
  console.log('[extractor] extractClaudeCode dir:', dir)
  const sessions: ExtractedSession[] = []
  // projects 目录下每个子目录是一个项目，内含 .jsonl 文件
  const projects = safeReaddir(dir)
  for (const proj of projects) {
    const projDir = join(dir, proj)
    if (!isDir(projDir)) continue
    const files = safeReaddir(projDir).filter((f) => f.endsWith('.jsonl'))
    for (const file of files) {
      const filePath = join(projDir, file)
      const session = parseClaudeCodeJsonl(filePath, proj)
      if (session) sessions.push(session)
    }
  }
  console.log('[extractor] extractClaudeCode done:', sessions.length, 'sessions')
  return sessions
}

function parseClaudeCodeJsonl(filePath: string, projectName: string): ExtractedSession | null {
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }

  const lines = content.split('\n').filter((l) => l.trim())
  const messages: ParsedMessage[] = []
  let firstTs: string | null = null
  let lastTs: string | null = null
  let summary = ''
  let customTitle = ''
  let aiTitle = ''

  for (const line of lines) {
    const entry = tryParse<ClaudeCodeEntry>(line)
    if (!entry) continue

    // 用户自定义标题（最高优先级）
    if (entry.type === 'custom-title' && entry.customTitle) {
      customTitle = entry.customTitle
      continue
    }
    // AI 生成的标题（次优先级）
    if (entry.type === 'ai-title' && entry.aiTitle) {
      aiTitle = entry.aiTitle
      continue
    }
    if (entry.type === 'summary' && entry.summary) {
      summary = entry.summary
      continue
    }

    const role = entry.message?.role || entry.type
    const text = extractClaudeCodeContent(entry.message?.content)
    if (!text.trim()) continue

    const ts = entry.timestamp ? toISO(entry.timestamp) : new Date().toISOString()
    if (!firstTs) firstTs = ts
    lastTs = ts

    messages.push({
      role: role === 'user' ? 'user' : 'assistant',
      content: text,
      createdAt: ts
    })
  }

  if (messages.length === 0) return null

  return {
    id: tmpId(),
    provider: 'ClaudeCode' as Provider,
    title: customTitle || aiTitle || summary || fallbackTitle(messages),
    source: `Claude Code · ${projectName}`,
    messageCount: messages.length,
    createdAt: firstTs || new Date().toISOString(),
    updatedAt: lastTs || new Date().toISOString(),
    messages
  }
}

/** Claude Code 的 content 可能是 string 或 [{ type: 'text', text: '...' }] */
function extractClaudeCodeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
      .join('\n')
  }
  return ''
}

// ============================================================
// OpenCode 扒取：读取 ~/.opencode 下的对话 JSON 文件
// ============================================================

interface OpenCodeMessage {
  role?: string
  content?: string | Array<{ type: string; text?: string }>
}

interface OpenCodeSession {
  id?: string
  title?: string
  name?: string
  messages?: OpenCodeMessage[]
  createdAt?: string | number
  updatedAt?: string | number
}

function extractOpenCode(dir: string): ExtractedSession[] {
  console.log('[extractor] extractOpenCode dir:', dir)
  const sessions: ExtractedSession[] = []

  // OpenCode 数据可能在多个子目录中
  function scanDir(currentDir: string, depth: number = 0): void {
    if (depth > 3) return
    const entries = safeReaddir(currentDir)
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      if (isDir(fullPath)) {
        scanDir(fullPath, depth + 1)
      } else if (entry.endsWith('.json')) {
        const session = parseOpenCodeJson(fullPath)
        if (session) sessions.push(session)
      }
    }
  }

  scanDir(dir)
  console.log('[extractor] extractOpenCode done:', sessions.length, 'sessions')
  return sessions
}

function parseOpenCodeJson(filePath: string): ExtractedSession | null {
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }

  const parsed = tryParse<OpenCodeSession | OpenCodeMessage[]>(content)
  if (!parsed) return null

  let messages: ParsedMessage[] = []
  let title = ''
  let createdAt = ''
  let updatedAt = ''

  if (Array.isArray(parsed)) {
    // 直接是消息数组
    messages = extractOpenCodeMessages(parsed)
  } else {
    // 对象格式：{ messages: [...], title: "...", ... }
    const obj = parsed as OpenCodeSession & Record<string, unknown>
    const rawMsgs = obj.messages || (obj as any).conversation || (obj as any).history || []
    messages = extractOpenCodeMessages(Array.isArray(rawMsgs) ? rawMsgs : [])
    title = obj.title || obj.name || (obj as any).name || ''
    createdAt = toISO(obj.createdAt)
    updatedAt = toISO(obj.updatedAt || obj.createdAt)
  }

  if (messages.length === 0) return null

  return {
    id: tmpId(),
    provider: 'OpenCode' as Provider,
    title: title || fallbackTitle(messages),
    source: 'OpenCode 本地扒取',
    messageCount: messages.length,
    createdAt: createdAt || messages[0]?.createdAt || new Date().toISOString(),
    updatedAt: updatedAt || messages[messages.length - 1]?.createdAt || new Date().toISOString(),
    messages
  }
}

function extractOpenCodeMessages(raw: OpenCodeMessage[]): ParsedMessage[] {
  const msgs: ParsedMessage[] = []
  for (const m of raw) {
    if (!m) continue
    const role = normalizeRole(m.role)
    const content = extractOpenCodeContent(m.content)
    if (!content.trim()) continue
    msgs.push({ role, content, createdAt: new Date().toISOString() })
  }
  return msgs
}

function extractOpenCodeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && 'text' in c) return String(c.text)
        return ''
      })
      .join('\n')
  }
  return ''
}

// ============================================================
// 统一扒取入口
// ============================================================

export interface ExtractOptions {
  /** 限定扒取数量（防止数据过大卡死） */
  maxSessions?: number
}

/**
 * 扒取指定 Provider 的本地对话
 * @returns ExtractedSession[] 已扒取的对话列表（含完整消息，可编辑标题/来源）
 */
export function extractLocal(
  provider: Provider,
  dataPath: string,
  opts?: ExtractOptions
): ExtractedSession[] {
  registerBuiltins()
  console.log('[extractor] extractLocal called:', { provider, dataPath, exists: dataPath ? existsSync(dataPath) : 'no path' })
  const max = opts?.maxSessions ?? 2000

  let sessions: ExtractedSession[]
  switch (provider) {
    case 'Cursor':
      sessions = extractCursor(dataPath)
      break
    case 'ClaudeCode':
      sessions = extractClaudeCode(dataPath)
      break
    case 'OpenCode':
      sessions = extractOpenCode(dataPath)
      break
    default:
      throw new Error(`不支持的 provider: ${provider}（仅支持 Cursor / ClaudeCode / OpenCode）`)
  }

  console.log('[extractor] extractLocal result:', { provider, sessionsFound: sessions.length })
  // 按更新时间倒序，截断
  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return sessions.slice(0, max)
}

// ============================================================
// 工具函数
// ============================================================

function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p)
  } catch {
    return []
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
