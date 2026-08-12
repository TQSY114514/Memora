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
import { readdirSync, statSync, existsSync } from 'fs'
import { safeReadFileSync, safeJsonParse } from './safeRead'
import { join } from 'path'
import type { Provider, ExtractedSession } from '@shared/types'
import type { ParsedMessage } from './types'
import { registerBuiltins } from './index'
import { normalizeRole, toIsoTimestamp, fallbackTitle } from './common'
import { assembleOpenCodeMessages } from './opencode/parts'
import type { OpenCodeMessage, OpenCodePart, OpenCodeSession } from './opencode/parts'

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
    return safeJsonParse<T>(s)
  } catch {
    return null
  }
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
        const createdAt = toIsoTimestamp(chat.createdAt) ?? new Date().toISOString()
        const updatedAt = toIsoTimestamp(chat.lastUpdatedAt || chat.createdAt) ?? new Date().toISOString()

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
    let files = safeReaddir(projDir).filter((f) => f.endsWith('.jsonl'))
    if (files.length > 5000) {
      console.warn(`[安全] ClaudeCode 项目 ${proj} 文件数过多 (${files.length})，截断到 5000`)
      files = files.slice(0, 5000)
    }
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
    content = safeReadFileSync(filePath)
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

    const ts = entry.timestamp ? toIsoTimestamp(entry.timestamp) ?? new Date().toISOString() : new Date().toISOString()
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
// OpenCode 扒取
// 新版（v1.2.0+）：数据在 opencode.db（SQLite），message 正文拆到 part 表
// 旧版（v1.2.0 之前）：JSON 文件存储 storage/session|message|part
// ============================================================

/** opencode.db 候选文件名（channel 变体） */
const OPENCODE_DB_NAMES = ['opencode.db', 'opencode-dev.db', 'opencode-preview.db', 'opencode-beta.db']

/** 单条会话的最大消息数（防超大会话拖垮整次扒取） */
const MAX_MESSAGES_PER_SESSION = 2000

interface OpenCodeSessionRow {
  id: string
  project_id: string | null
  title: string | null
  agent: string | null
  model: string | null
  time_created: number | null
  time_updated: number | null
}

interface OpenCodeMessageRow {
  id: string
  time_created: number | null
  data: string
}

interface OpenCodePartRow {
  id: string
  data: string
}

/** 定位 opencode.db（优先 OPENCODE_DB 环境变量，其次按 channel 变体探测） */
function findOpenCodeDb(dir: string): string | null {
  if (process.env.OPENCODE_DB && existsSync(process.env.OPENCODE_DB)) {
    return process.env.OPENCODE_DB
  }
  for (const name of OPENCODE_DB_NAMES) {
    const p = join(dir, name)
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

/** Path 1（优先）：从 opencode.db（SQLite，只读）扒取会话 */
function extractOpenCodeFromDb(dbPath: string): ExtractedSession[] {
  console.log('[extractor] OpenCode sqlite db:', dbPath)
  const Database = loadSqlite()
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const sessions: ExtractedSession[] = []
    // 预编译语句 + 只选必要列：opencode.db 可能 1GB+（1w+ parts），绝不用 SELECT *
    const sessionStmt = db.prepare(
      'SELECT id, project_id, title, agent, model, time_created, time_updated FROM session ORDER BY time_updated DESC'
    )
    const msgStmt = db.prepare(
      'SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC, id ASC LIMIT ' +
        MAX_MESSAGES_PER_SESSION
    )
    const partStmt = db.prepare('SELECT id, data FROM part WHERE message_id = ? ORDER BY id ASC')

    const rows = sessionStmt.all() as OpenCodeSessionRow[]
    for (const row of rows) {
      // 无时间戳的会话直接跳过
      if (row.time_created == null) continue
      const msgRows = msgStmt.all(row.id) as OpenCodeMessageRow[]
      const rawMessages: OpenCodeMessage[] = []
      for (const mr of msgRows) {
        const data = tryParse<OpenCodeMessage>(mr.data)
        if (!data || typeof data !== 'object') continue
        // 正文在 part 表，按消息取出后挂到 parts 上（与 importer 共用同一套拼装逻辑）
        const partRows = partStmt.all(mr.id) as OpenCodePartRow[]
        data.parts = partRows
          .map((pr) => tryParse<OpenCodePart>(pr.data))
          .filter((p): p is OpenCodePart => !!p && typeof p === 'object')
        if (data.time?.created == null && mr.time_created != null) {
          data.time = { created: mr.time_created }
        }
        rawMessages.push(data)
      }
      const messages = assembleOpenCodeMessages(rawMessages)
      if (messages.length === 0) continue

      sessions.push({
        id: tmpId(),
        provider: 'OpenCode' as Provider,
        title: row.title?.trim() || fallbackTitle(messages),
        source: 'OpenCode 本地扒取',
        messageCount: messages.length,
        createdAt: toIsoTimestamp(row.time_created) ?? new Date().toISOString(),
        updatedAt: toIsoTimestamp(row.time_updated || row.time_created) ?? new Date().toISOString(),
        messages
      })
    }
    console.log('[extractor] OpenCode sqlite done:', sessions.length, 'sessions')
    return sessions
  } finally {
    db.close()
  }
}

/** Path 2（兜底）：旧版 JSON 文件存储扒取（v1.2.0 之前） */
function extractOpenCodeLegacy(dir: string): ExtractedSession[] {
  console.log('[extractor] OpenCode legacy json storage:', dir)
  // storage 可能在 <dir>/storage，也可能直接在 <dir> 根
  const storageRoot = existsSync(join(dir, 'storage')) ? join(dir, 'storage') : dir
  const sessionRoot = join(storageRoot, 'session')
  if (!isDir(sessionRoot)) return []

  // 递归收集 *.json，排除旧式布局里的 session/message 与 session/part 子目录
  const sessionFiles = collectJsonFiles(sessionRoot, (rel) => {
    const seg = rel.split(/[\\/]/)[0]
    return seg === 'message' || seg === 'part'
  })
  const sessions: ExtractedSession[] = []

  for (const sf of sessionFiles) {
    try {
      const parsed = tryParse<OpenCodeSession>(tryReadFile(sf))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const sessionId = String(parsed.id || basenameOf(sf) || '')
      if (!sessionId) continue

      // 消息：扁平布局 storage/message/<sid>/，旧式布局 storage/session/message/<sid>/
      const msgFiles = collectJsonFiles(join(storageRoot, 'message', sessionId)).concat(
        collectJsonFiles(join(sessionRoot, 'message', sessionId))
      )
      const rawMessages: OpenCodeMessage[] = []
      for (const mf of msgFiles) {
        const m = tryParse<OpenCodeMessage>(tryReadFile(mf))
        if (!m || typeof m !== 'object') continue
        // parts 可能内联在消息 JSON，也可能在 part 目录
        if (!Array.isArray(m.parts)) {
          const messageId = String(m.id || basenameOf(mf) || '')
          const partFiles = collectJsonFiles(join(storageRoot, 'part', messageId)).concat(
            collectJsonFiles(join(sessionRoot, 'part', sessionId, messageId))
          )
          m.parts = partFiles
            .map((pf) => tryParse<OpenCodePart>(tryReadFile(pf)))
            .filter((p): p is OpenCodePart => !!p && typeof p === 'object')
        }
        rawMessages.push(m)
      }
      // 按 time.created 升序，id 兜底（与 SQLite 路径的排序一致）
      rawMessages.sort(
        (a, b) =>
          (a.time?.created ?? 0) - (b.time?.created ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
      )
      const messages = assembleOpenCodeMessages(rawMessages)
      if (messages.length === 0) continue

      const title = String(parsed.title || '').trim() || fallbackTitle(messages)
      sessions.push({
        id: tmpId(),
        provider: 'OpenCode' as Provider,
        title,
        source: 'OpenCode 本地扒取',
        messageCount: messages.length,
        createdAt: toIsoTimestamp(parsed.time?.created) ?? messages[0]?.createdAt ?? new Date().toISOString(),
        updatedAt:
          toIsoTimestamp(parsed.time?.updated ?? parsed.time?.created) ??
          messages[messages.length - 1]?.createdAt ??
          new Date().toISOString(),
        messages
      })
    } catch {
      // 单个会话失败不阻断整批
    }
  }
  console.log('[extractor] OpenCode legacy done:', sessions.length, 'sessions')
  return sessions
}

function extractOpenCode(dir: string): ExtractedSession[] {
  console.log('[extractor] extractOpenCode dir:', dir)
  const dbPath = findOpenCodeDb(dir)
  if (dbPath) {
    try {
      const sessions = extractOpenCodeFromDb(dbPath)
      if (sessions.length > 0) return sessions
      // DB 存在但没扒到会话（可能是旧 schema 空表），退回 JSON 兜底
      console.log('[extractor] OpenCode sqlite 无会话，回退 JSON 存储')
    } catch (e) {
      console.warn('[extractor] OpenCode sqlite 读取失败，回退 JSON 存储：', (e as Error).message)
    }
  }
  return extractOpenCodeLegacy(dir)
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

/** 递归收集目录下所有 *.json 文件（可按相对路径过滤，用于旧版 OpenCode storage） */
function collectJsonFiles(root: string, exclude?: (rel: string) => boolean): string[] {
  if (!isDir(root)) return []
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of safeReaddir(dir)) {
      const full = join(dir, entry)
      if (isDir(full)) {
        const rel = full.slice(root.length + 1)
        if (exclude && exclude(rel)) continue
        walk(full)
      } else if (entry.endsWith('.json')) {
        files.push(full)
      }
    }
  }
  walk(root)
  return files
}

/** 安全读取文件，失败返回空串（旧版 storage 文件可能损坏/超限） */
function tryReadFile(p: string): string {
  try {
    return safeReadFileSync(p)
  } catch {
    return ''
  }
}

/** 取文件名（不含 .json 扩展名） */
function basenameOf(p: string): string {
  const segs = p.split(/[\\/]/)
  const name = segs[segs.length - 1] || ''
  return name.endsWith('.json') ? name.slice(0, -5) : name
}
