import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { Folder } from '@shared/types'

interface FolderRow {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id ?? undefined,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createFolder(input: {
  workspaceId: string
  parentId?: string
  name: string
}): Folder {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO folders (id, workspace_id, parent_id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run(id, input.workspaceId, input.parentId ?? null, input.name, now, now)
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
  patch: Partial<Pick<Folder, 'name' | 'parentId' | 'sortOrder'>>
): void {
  const db = getDatabase()
  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (patch.name !== undefined) {
    sets.push('name = @name')
    params.name = patch.name
  }
  if (patch.parentId !== undefined) {
    sets.push('parent_id = @parentId')
    params.parentId = patch.parentId
  }
  if (patch.sortOrder !== undefined) {
    sets.push('sort_order = @sortOrder')
    params.sortOrder = patch.sortOrder
  }
  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  db.prepare(`UPDATE folders SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

export function deleteFolder(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM folders WHERE id = ?').run(id)
}
