import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import { buildUpdateSets } from './sqlHelpers'
import type { Folder, FolderRule } from '@shared/types'

interface FolderRow {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  sort_order: number
  rule: string | null
  created_at: string
  updated_at: string
}

/** 安全解析 JSON，损坏时返回 fallback 并记录警告，避免单个坏行崩溃整列加载 */
function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch (e) {
    console.warn('[folderRepo] JSON.parse 失败，使用默认值:', e)
    return fallback
  }
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id ?? undefined,
    name: row.name,
    sortOrder: row.sort_order,
    rule: row.rule ? safeJsonParse<FolderRule | null>(row.rule, null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createFolder(input: {
  workspaceId: string
  parentId?: string
  name: string
  rule?: FolderRule | null
}): Folder {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO folders (id, workspace_id, parent_id, name, sort_order, rule, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(id, input.workspaceId, input.parentId ?? null, input.name, input.rule ? JSON.stringify(input.rule) : null, now, now)
  return getFolder(id)!
}

export function getFolder(id: string): Folder | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | undefined
  return row ? rowToFolder(row) : null
}

export function listFolders(workspaceId?: string): Folder[] {
  const db = getDatabase()
  const rows = workspaceId
    ? (db
        .prepare('SELECT * FROM folders WHERE workspace_id = ? ORDER BY sort_order, name')
        .all(workspaceId) as FolderRow[])
    : (db.prepare('SELECT * FROM folders ORDER BY sort_order, name').all() as FolderRow[])
  return rows.map(rowToFolder)
}

export function listRootFolders(workspaceId: string): Folder[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      'SELECT * FROM folders WHERE workspace_id = ? AND parent_id IS NULL ORDER BY sort_order, name'
    )
    .all(workspaceId) as FolderRow[]
  return rows.map(rowToFolder)
}

export function listChildFolders(parentId: string): Folder[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM folders WHERE parent_id = ? ORDER BY sort_order, name')
    .all(parentId) as FolderRow[]
  return rows.map(rowToFolder)
}

export function updateFolder(
  id: string,
  patch: Partial<Pick<Folder, 'name' | 'parentId' | 'sortOrder' | 'rule'>>
): void {
  const db = getDatabase()
  // rule 需要序列化为 JSON 字符串
  const transformedPatch: Record<string, unknown> = { ...patch }
  if (patch.rule !== undefined) {
    transformedPatch.rule = patch.rule ? JSON.stringify(patch.rule) : null
  }
  const { sets, params } = buildUpdateSets(transformedPatch, {
    name: 'name',
    parentId: 'parent_id',
    sortOrder: 'sort_order',
    rule: 'rule'
  })
  if (sets.length === 0) return

  sets.push('updated_at = @nowIso')
  db.prepare(`UPDATE folders SET ${sets.join(', ')} WHERE id = @id`).run({ ...params, id, nowIso: new Date().toISOString() })
}

export function deleteFolder(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM folders WHERE id = ?').run(id)
}
