import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import {
  listMcpPermissions,
  saveMcpPermission,
  deleteMcpPermission,
  checkMcpPermission
} from '../../../src/database/repositories/mcpPermissionsRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const permRow = {
  id: '1',
  client_id: 'client-1',
  client_name: 'Claude',
  level: 'readonly',
  allowed_tools: 'tool1,tool2',
  enabled: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
}

describe('mcpPermissionsRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('listMcpPermissions ensures table and returns rows', () => {
    stmtResults.set('SELECT * FROM mcp_client_permissions ORDER BY created_at DESC', { all: [permRow] })
    const list = listMcpPermissions()
    expect(list).toHaveLength(1)
    expect(list[0].clientId).toBe('client-1')
    expect(db.exec).toHaveBeenCalled()
  })

  it('saveMcpPermission updates an existing permission', () => {
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: permRow })
    const saved = saveMcpPermission({ clientId: 'client-1', clientName: 'Claude', level: 'write' })
    expect(saved.level).toBe('write')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE mcp_client_permissions'))
  })

  it('saveMcpPermission inserts a new permission', () => {
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: undefined })
    const saved = saveMcpPermission({ clientId: 'client-2', clientName: 'New', level: 'full', enabled: true })
    expect(saved.clientId).toBe('client-2')
    expect(saved.level).toBe('full')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO mcp_client_permissions'))
  })

  it('saveMcpPermission defaults level to readonly and enabled to true', () => {
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: undefined })
    const saved = saveMcpPermission({ clientId: 'client-3', clientName: 'Base' })
    expect(saved.level).toBe('readonly')
    expect(saved.enabled).toBe(true)
  })

  it('deleteMcpPermission returns false when changes is 0', () => {
    stmtResults.set('DELETE FROM mcp_client_permissions WHERE client_id = ?', { run: { changes: 0 } })
    expect(deleteMcpPermission('client-1')).toBe(false)
  })

  it('deleteMcpPermission returns true when a row is deleted', () => {
    stmtResults.set('DELETE FROM mcp_client_permissions WHERE client_id = ?', { run: { changes: 1 } })
    expect(deleteMcpPermission('client-1')).toBe(true)
  })

  it('checkMcpPermission falls back to env vars when no config', () => {
    stmtResults.set('SELECT COUNT(*) as n FROM mcp_client_permissions', { get: { n: 0 } })
    const result = checkMcpPermission('client-1', 'tool1')
    expect(result).toEqual({ allowed: true, reason: 'no client permissions configured, falling back to env vars', level: 'inherit' })
  })

  it('checkMcpPermission rejects unknown client', () => {
    stmtResults.set('SELECT COUNT(*) as n FROM mcp_client_permissions', { get: { n: 1 } })
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: undefined })
    const result = checkMcpPermission('unknown', 'tool1')
    expect(result.allowed).toBe(false)
    expect(result.level).toBe('none')
  })

  it('checkMcpPermission rejects disabled client', () => {
    stmtResults.set('SELECT COUNT(*) as n FROM mcp_client_permissions', { get: { n: 1 } })
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: { ...permRow, enabled: 0 } })
    const result = checkMcpPermission('client-1', 'tool1')
    expect(result.allowed).toBe(false)
    expect(result.level).toBe('disabled')
  })

  it('checkMcpPermission rejects tool not in whitelist', () => {
    stmtResults.set('SELECT COUNT(*) as n FROM mcp_client_permissions', { get: { n: 1 } })
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: permRow })
    const result = checkMcpPermission('client-1', 'tool3')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('不在')
  })

  it('checkMcpPermission allows tool in whitelist', () => {
    stmtResults.set('SELECT COUNT(*) as n FROM mcp_client_permissions', { get: { n: 1 } })
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: permRow })
    const result = checkMcpPermission('client-1', 'tool1')
    expect(result.allowed).toBe(true)
    expect(result.level).toBe('readonly')
  })

  it('checkMcpPermission allows any tool when no whitelist', () => {
    stmtResults.set('SELECT COUNT(*) as n FROM mcp_client_permissions', { get: { n: 1 } })
    stmtResults.set('SELECT * FROM mcp_client_permissions WHERE client_id = ?', { get: { ...permRow, allowed_tools: null } })
    const result = checkMcpPermission('client-1', 'anything')
    expect(result.allowed).toBe(true)
  })
})