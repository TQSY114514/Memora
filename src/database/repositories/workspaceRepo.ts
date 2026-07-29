import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { Workspace } from '@shared/types'

interface WorkspaceRow {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createWorkspace(input: {
  name: string
  description?: string
  color?: string
  icon?: string
}): Workspace {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO workspaces (id, name, description, color, icon, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, input.name, input.description ?? null, input.color ?? null, input.icon ?? null, now, now)
  return getWorkspace(id)!
}

export function getWorkspace(id: string): Workspace | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
    | WorkspaceRow
    | undefined
  return row ? rowToWorkspace(row) : null
}

export function listWorkspaces(): Workspace[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM workspaces ORDER BY sort_order ASC, created_at ASC')
    .all() as WorkspaceRow[]
  return rows.map(rowToWorkspace)
}

export function updateWorkspace(
  id: string,
  patch: Partial<Pick<Workspace, 'name' | 'description' | 'color' | 'icon' | 'sortOrder'>>
): void {
  const db = getDatabase()
  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (patch.name !== undefined) {
    sets.push('name = @name')
    params.name = patch.name
  }
  if (patch.description !== undefined) {
    sets.push('description = @description')
    params.description = patch.description
  }
  if (patch.color !== undefined) {
    sets.push('color = @color')
    params.color = patch.color
  }
  if (patch.icon !== undefined) {
    sets.push('icon = @icon')
    params.icon = patch.icon
  }
  if (patch.sortOrder !== undefined) {
    sets.push('sort_order = @sortOrder')
    params.sortOrder = patch.sortOrder
  }
  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  db.prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

export function deleteWorkspace(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}
