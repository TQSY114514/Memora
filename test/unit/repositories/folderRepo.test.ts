import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import {
  createFolder,
  getFolder,
  listFolders,
  listRootFolders,
  listChildFolders,
  updateFolder,
  deleteFolder
} from '../../../src/database/repositories/folderRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const baseRow = {
  id: 'f1',
  workspace_id: 'ws1',
  parent_id: null,
  name: 'Folder',
  sort_order: 0,
  rule: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
}

describe('folderRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('createFolder inserts and returns the created folder', () => {
    stmtResults.set('SELECT * FROM folders WHERE id = ?', { get: baseRow })
    const folder = createFolder({ workspaceId: 'ws1', name: 'Folder' })
    expect(folder).toMatchObject({ id: 'f1', workspaceId: 'ws1', name: 'Folder', rule: null })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO folders'))
  })

  it('createFolder serializes a rule to JSON', () => {
    stmtResults.set('SELECT * FROM folders WHERE id = ?', {
      get: { ...baseRow, rule: JSON.stringify({ keywords: ['ai'] }) }
    })
    const folder = createFolder({ workspaceId: 'ws1', name: 'Folder', rule: { keywords: ['ai'] } })
    expect(folder.rule).toEqual({ keywords: ['ai'] })
  })

  it('getFolder returns null when not found', () => {
    expect(getFolder('nope')).toBeNull()
  })

  it('getFolder parses a valid JSON rule', () => {
    stmtResults.set('SELECT * FROM folders WHERE id = ?', {
      get: { ...baseRow, rule: '{"keywords":["x"]}' }
    })
    expect(getFolder('f1')?.rule).toEqual({ keywords: ['x'] })
  })

  it('getFolder falls back to null for invalid JSON rule', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stmtResults.set('SELECT * FROM folders WHERE id = ?', { get: { ...baseRow, rule: '{bad json' } })
    expect(getFolder('f1')?.rule).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('getFolder returns null rule when rule is null', () => {
    stmtResults.set('SELECT * FROM folders WHERE id = ?', { get: { ...baseRow, rule: null } })
    expect(getFolder('f1')?.rule).toBeNull()
  })

  it('listFolders without workspaceId lists all', () => {
    stmtResults.set('SELECT * FROM folders ORDER BY sort_order, name', { all: [baseRow] })
    expect(listFolders()).toHaveLength(1)
  })

  it('listFolders with workspaceId filters by workspace', () => {
    stmtResults.set('SELECT * FROM folders WHERE workspace_id = ? ORDER BY sort_order, name', { all: [baseRow] })
    const list = listFolders('ws1')
    expect(list).toHaveLength(1)
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE workspace_id = ?'))
  })

  it('listRootFolders queries parent_id IS NULL', () => {
    stmtResults.set('SELECT * FROM folders WHERE workspace_id = ? AND parent_id IS NULL', { all: [baseRow] })
    expect(listRootFolders('ws1')).toHaveLength(1)
  })

  it('listChildFolders queries by parent_id', () => {
    stmtResults.set('SELECT * FROM folders WHERE parent_id = ? ORDER BY sort_order, name', { all: [baseRow] })
    expect(listChildFolders('parent')).toHaveLength(1)
  })

  it('updateFolder serializes rule to JSON string', () => {
    updateFolder('f1', { name: 'Renamed', rule: { keywords: ['z'] } })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE folders SET'))
    const runCall = db.prepare.mock.calls.find((c: any[]) => String(c[0]).includes('UPDATE folders'))!
    expect(String(runCall[0])).toContain('rule = @rule')
  })

  it('updateFolder converts null rule to null', () => {
    updateFolder('f1', { rule: null })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE folders SET'))
  })

  it('updateFolder with empty patch does nothing', () => {
    updateFolder('f1', {})
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE folders'))
  })

  it('deleteFolder runs a DELETE', () => {
    deleteFolder('f1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM folders WHERE id = ?')
  })
})