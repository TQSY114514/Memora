import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace
} from '../../../src/database/repositories/workspaceRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const workspaceRow = {
  id: 'w1',
  name: 'My Workspace',
  description: 'desc',
  color: '#fff',
  icon: 'icon',
  sort_order: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
}

describe('workspaceRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('createWorkspace inserts and returns the created workspace', () => {
    stmtResults.set('SELECT * FROM workspaces WHERE id = ?', { get: workspaceRow })
    const ws = createWorkspace({ name: 'My Workspace', description: 'desc', color: '#fff', icon: 'icon' })
    expect(ws).toMatchObject({ id: 'w1', name: 'My Workspace', description: 'desc', color: '#fff', icon: 'icon', sortOrder: 0 })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workspaces'))
  })

  it('createWorkspace handles missing optional fields with null', () => {
    stmtResults.set('SELECT * FROM workspaces WHERE id = ?', { get: { ...workspaceRow, description: null, color: null, icon: null } })
    const ws = createWorkspace({ name: 'Only Name' })
    expect(ws.sortOrder).toBe(0)
    expect(ws.description).toBeUndefined()
  })

  it('getWorkspace returns null when not found', () => {
    stmtResults.set('SELECT * FROM workspaces WHERE id = ?', { get: undefined })
    expect(getWorkspace('missing')).toBeNull()
  })

  it('getWorkspace returns null when row is undefined', () => {
    expect(getWorkspace('x')).toBeNull()
  })

  it('listWorkspaces maps rows', () => {
    stmtResults.set('SELECT * FROM workspaces ORDER BY sort_order ASC', {
      all: [workspaceRow, { ...workspaceRow, id: 'w2', name: 'Second' }]
    })
    const list = listWorkspaces()
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('My Workspace')
    expect(list[1].id).toBe('w2')
  })

  it('updateWorkspace runs an UPDATE with the patch', () => {
    updateWorkspace('w1', { name: 'Renamed', sortOrder: 3 })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE workspaces SET'))
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE id = @id'))
  })

  it('updateWorkspace with empty patch does nothing', () => {
    updateWorkspace('w1', {})
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE workspaces'))
  })

  it('deleteWorkspace runs a DELETE', () => {
    deleteWorkspace('w1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM workspaces WHERE id = ?')
  })
})