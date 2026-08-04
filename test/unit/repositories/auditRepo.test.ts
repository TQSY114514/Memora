import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import { addAuditLog, listAuditLogs, getVersionHistory, diffVersions, applyVersionDiff } from '../../../src/database/repositories/auditRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const auditRow = {
  id: 'a1',
  entity_type: 'preference',
  entity_id: 'p1',
  action: 'update',
  before_value: '{"value":"old"}',
  after_value: '{"value":"new"}',
  workspace_id: 'ws1',
  session_id: 's1',
  reason: 'reason',
  created_at: '2024-01-01T00:00:00.000Z'
}

describe('auditRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('addAuditLog catches exceptions and does not throw', () => {
    db.prepare.mockImplementation(() => {
      throw new Error('db error')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      addAuditLog({ entityType: 'preference', entityId: 'p1', action: 'update' })
    }).not.toThrow()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('addAuditLog inserts with json serialization', () => {
    addAuditLog({
      entityType: 'preference',
      entityId: 'p1',
      action: 'update',
      beforeValue: { value: 'old' },
      afterValue: { value: 'new' },
      workspaceId: 'ws1'
    })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'))
  })

  it('listAuditLogs builds conditions from options', () => {
    stmtResults.set('ORDER BY created_at DESC LIMIT @limit OFFSET @offset', { all: [auditRow] })
    const logs = listAuditLogs({ entityType: 'preference', entityId: 'p1', workspaceId: 'ws1' })
    expect(logs).toHaveLength(1)
    expect(logs[0].entityType).toBe('preference')
    expect(logs[0].entityId).toBe('p1')
  })

  it('listAuditLogs returns all when no filters', () => {
    stmtResults.set('ORDER BY created_at DESC', { all: [auditRow] })
    expect(listAuditLogs()).toHaveLength(1)
  })

  it('getVersionHistory returns ordered logs for entity', () => {
    stmtResults.set('WHERE entity_id = ? AND entity_type = ?', { all: [auditRow] })
    const history = getVersionHistory('p1', 'preference')
    expect(history).toHaveLength(1)
  })

  describe('diffVersions', () => {
    it('adds keys only in after', () => {
      const diff = diffVersions(null, { a: 1 })
      expect(diff.added).toEqual({ a: 1 })
      expect(Object.keys(diff.removed)).toHaveLength(0)
    })

    it('removes keys only in before', () => {
      const diff = diffVersions({ a: 1 }, null)
      expect(diff.removed).toEqual({ a: 1 })
      expect(Object.keys(diff.added)).toHaveLength(0)
    })

    it('detects changed when values differ', () => {
      const diff = diffVersions({ a: 1 }, { a: 2 })
      expect(diff.changed).toHaveProperty('a')
      expect(diff.changed.a).toEqual({ from: 1, to: 2 })
    })

    it('does not mark same as changed', () => {
      const diff = diffVersions({ a: 1 }, { a: 1 })
      expect(Object.keys(diff.changed)).toHaveLength(0)
    })

    it('handles empty both', () => {
      const diff = diffVersions(null, null)
      expect(Object.keys(diff.added)).toHaveLength(0)
      expect(Object.keys(diff.removed)).toHaveLength(0)
    })
  })

  describe('applyVersionDiff', () => {
    it('removes removed keys', () => {
      const result = applyVersionDiff({ a: 1, b: 2 }, { added: {}, removed: { a: 1 }, changed: {} })
      expect(result).toEqual({ b: 2 })
    })

    it('adds added keys', () => {
      const result = applyVersionDiff({ a: 1 }, { added: { b: 2 }, removed: {}, changed: {} })
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('reverts changed keys to before value', () => {
      const result = applyVersionDiff({ a: 2 }, { added: {}, removed: {}, changed: { a: { from: 1, to: 2 } } })
      expect(result.a).toBe(1)
    })
  })
})