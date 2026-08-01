import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import { buildUpdateSets } from './sqlHelpers'
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
  const { sets, params } = buildUpdateSets(patch, {
    name: 'name',
    description: 'description',
    color: 'color',
    icon: 'icon',
    sortOrder: 'sort_order'
  })
  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  db.prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = @id`).run({ ...params, id })
}

export function deleteWorkspace(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}
