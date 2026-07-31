import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { ChatSession, Message, Tag, FolderRule } from '@shared/types'
import { indexSessionForSearch, unindexSession } from '@search/indexer'

interface SessionRow {
  id: string
  source_id: string | null
  provider: string
  model: string | null
  title: string
  description: string | null
  folder_id: string | null
  is_favorite: number
  message_count: number
  created_at: string
  updated_at: string
  imported_at: string
}

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  model: string | null
  tokens: number | null
  msg_order: number
  created_at: string
}

interface TagRow {
  id: string
  name: string
  color: string | null
  created_at: string
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as Message['role'],
    content: row.content,
    model: row.model ?? undefined,
    tokens: row.tokens ?? undefined,
    order: row.msg_order,
    createdAt: row.created_at
  }
}

function rowToSession(row: SessionRow, tags: Tag[] = [], messages?: Message[]): ChatSession {
  return {
    id: row.id,
    sourceId: row.source_id ?? undefined,
    provider: row.provider as ChatSession['provider'],
    model: row.model ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    folderId: row.folder_id ?? undefined,
    isFavorite: row.is_favorite === 1,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    importedAt: row.imported_at,
    tags,
    messages
  }
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.created_at
  }
}

/** 获取会话的标签 */
function getSessionTags(sessionId: string): Tag[] {
  const db = getDatabase()
  const rows = db.prepare(
    `SELECT t.* FROM tags t
     JOIN session_tags st ON st.tag_id = t.id
     WHERE st.session_id = ?
     ORDER BY t.name`
  ).all(sessionId) as TagRow[]
  return rows.map(rowToTag)
}

/** 创建会话（含消息）+ 建立 FTS 索引。事务保证一致性 */
export function createSession(
  session: Omit<ChatSession, 'id' | 'importedAt'> & { id?: string },
  messages: Array<Omit<Message, 'id'> & { id?: string }> = []
): ChatSession {
  const db = getDatabase()
  const id = session.id ?? uuidv4()
  const importedAt = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO chat_sessions
       (id, source_id, provider, model, title, description, folder_id, is_favorite,
        message_count, created_at, updated_at, imported_at)
       VALUES (@id, @source_id, @provider, @model, @title, @description, @folder_id,
               @is_favorite, @message_count, @created_at, @updated_at, @imported_at)`
    ).run({
      id,
      source_id: session.sourceId ?? null,
      provider: session.provider,
      model: session.model ?? null,
      title: session.title,
      description: session.description ?? null,
      folder_id: session.folderId ?? null,
      is_favorite: session.isFavorite ? 1 : 0,
      message_count: messages.length,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      imported_at: importedAt
    })

    if (messages.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO messages
         (id, session_id, role, content, model, tokens, msg_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      messages.forEach((msg, idx) => {
        stmt.run(
          msg.id || uuidv4(),
          id,
          msg.role,
          msg.content,
          msg.model ?? null,
          msg.tokens ?? null,
          idx,
          msg.createdAt
        )
      })
    }
  })

  tx()

  // FTS 索引（移出事务，避免索引失败导致会话写入回滚）
  try {
    indexSessionForSearch(id, session.title, messages, session.provider)
  } catch (e) {
    console.error('[sessionRepo] FTS 索引失败（不影响会话写入）:', e)
  }

  return getSession(id)!
}

/**
 * 根据 sourceId 判断会话是否已存在（用于幂等导入）
 */
export function findBySourceId(sourceId: string, provider: string): ChatSession | null {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM chat_sessions WHERE source_id = ? AND provider = ?'
  ).get(sourceId, provider) as SessionRow | undefined
  return row ? rowToSession(row, getSessionTags(row.id)) : null
}

/** 根据 ID 获取会话（可选加载消息） */
export function getSession(id: string, withMessages = true): ChatSession | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as
    | SessionRow
    | undefined
  if (!row) return null
  const tags = getSessionTags(id)
  const messages = withMessages
    ? (db.prepare(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY msg_order ASC'
      ).all(id) as MessageRow[]).map(rowToMessage)
    : undefined
  return rowToSession(row, tags, messages)
}

/** 列出会话（轻量，不加载消息内容） */
export function listSessions(options?: {
  folderId?: string
  provider?: string
  favorite?: boolean
  limit?: number
  offset?: number
}): ChatSession[] {
  const db = getDatabase()
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (options?.folderId !== undefined) {
    conditions.push('folder_id = @folderId')
    params.folderId = options.folderId
  }
  if (options?.provider) {
    conditions.push('provider = @provider')
    params.provider = options.provider
  }
  if (options?.favorite !== undefined) {
    conditions.push('is_favorite = @favorite')
    params.favorite = options.favorite ? 1 : 0
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit ?? 1000
  const offset = options?.offset ?? 0

  const rows = db
    .prepare(`SELECT * FROM chat_sessions ${where} ORDER BY updated_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as SessionRow[]

  return rows.map((row) => rowToSession(row, getSessionTags(row.id)))
}

/** 检查会话是否匹配智能文件夹规则 */
function matchesRule(session: ChatSession, rule: FolderRule): boolean {
  // 关键词匹配（标题或描述）
  if (rule.keywords && rule.keywords.length > 0) {
    const text = (session.title + ' ' + (session.description ?? '')).toLowerCase()
    if (!rule.keywords.some((k: string) => text.includes(k.toLowerCase()))) return false
  }
  // 平台匹配
  if (rule.providers && rule.providers.length > 0) {
    if (!rule.providers.includes(session.provider)) return false
  }
  // 标签匹配
  if (rule.tags && rule.tags.length > 0) {
    if (!session.tags.some(t => rule.tags!.includes(t.name))) return false
  }
  // 收藏匹配
  if (rule.favoriteOnly && !session.isFavorite) return false
  return true
}

/** 列出工作区内所有会话（含未分组的） */
export function listSessionsByWorkspace(workspaceId: string): ChatSession[] {
  const db = getDatabase()
  const rows = db.prepare(
    `SELECT cs.* FROM chat_sessions cs
     LEFT JOIN folders f ON cs.folder_id = f.id
     WHERE f.workspace_id = ? OR cs.folder_id IS NULL
     ORDER BY cs.updated_at DESC`
  ).all(workspaceId) as SessionRow[]
  return rows.map((row) => rowToSession(row, getSessionTags(row.id)))
}

/** 列出匹配智能文件夹规则的会话 */
export function listSessionsByRule(workspaceId: string, rule: FolderRule): ChatSession[] {
  // 先获取工作区全部会话，再在应用层过滤（规则含 keywords/tags 难以纯 SQL 表达）
  const all = listSessionsByWorkspace(workspaceId)
  return all.filter(s => matchesRule(s, rule))
}

/** 更新会话元信息 */
export function updateSession(
  id: string,
  patch: Partial<Pick<ChatSession, 'title' | 'description' | 'folderId' | 'isFavorite'>>
): void {
  const db = getDatabase()
  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (patch.title !== undefined) {
    sets.push('title = @title')
    params.title = patch.title
  }
  if (patch.description !== undefined) {
    sets.push('description = @description')
    params.description = patch.description
  }
  if (patch.folderId !== undefined) {
    sets.push('folder_id = @folderId')
    params.folderId = patch.folderId
  }
  if (patch.isFavorite !== undefined) {
    sets.push('is_favorite = @favorite')
    params.favorite = patch.isFavorite ? 1 : 0
  }
  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  db.prepare(`UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

/** 切换收藏 */
export function toggleFavorite(id: string): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE chat_sessions SET is_favorite = 1 - is_favorite, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(id)
}

/** 移动会话到文件夹 */
export function moveSession(id: string, folderId: string | null): void {
  const db = getDatabase()
  db.prepare(
    "UPDATE chat_sessions SET folder_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(folderId, id)
}

/** 删除会话（级联删除消息、标签关联）+ 删除 FTS 索引 */
export function deleteSession(id: string): void {
  const db = getDatabase()
  const tx = db.transaction(() => {
    unindexSession(id)
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
  })
  tx()
}
