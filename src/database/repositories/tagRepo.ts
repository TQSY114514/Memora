import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { Tag } from '@shared/types'

interface TagRow {
  id: string
  name: string
  color: string | null
  created_at: string
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.created_at
  }
}

export function createTag(input: { name: string; color?: string }): Tag {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    input.name,
    input.color ?? null,
    now
  )
  return getTag(id)!
}

export function getTag(id: string): Tag | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined
  return row ? rowToTag(row) : null
}

export function findByName(name: string): Tag | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as TagRow | undefined
  return row ? rowToTag(row) : null
}

export function listTags(): Tag[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM tags ORDER BY name').all() as TagRow[]
  return rows.map(rowToTag)
}

/** 附加标签到会话（幂等） */
export function attachTag(sessionId: string, tagId: string): void {
  const db = getDatabase()
  db.prepare(
    'INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)'
  ).run(sessionId, tagId)
}

/** 从会话移除标签 */
export function detachTag(sessionId: string, tagId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?').run(
    sessionId,
    tagId
  )
}

export function deleteTag(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM tags WHERE id = ?').run(id)
}

/** 按名称附加标签，不存在则创建 */
export function attachTagByName(sessionId: string, name: string): Tag {
  let tag = findByName(name)
  if (!tag) tag = createTag({ name })
  attachTag(sessionId, tag.id)
  return tag
}
