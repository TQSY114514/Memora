import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import { addAuditLog } from '../../../src/database/repositories/auditRepo'
import {
  createPreference,
  getPreference,
  listPreferences,
  updatePreference,
  deletePreference,
  archivePreference,
  decayConfidence,
  touchPreference,
  searchPreferences,
  getUserProfile,
  getConstitution,
  countPreferences,
  detectConflicts
} from '../../../src/database/repositories/preferencesRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))
vi.mock('@search/segmenter', () => ({ segment: vi.fn((s: string) => s) }))
vi.mock('../../../src/search/query', () => ({ buildFtsQuery: vi.fn((q: string) => q) }))
vi.mock('../../../src/database/repositories/auditRepo', () => ({ addAuditLog: vi.fn() }))

const prefRow = {
  id: 'p1',
  workspace_id: 'ws1',
  session_id: 's1',
  subject: 'language',
  value: 'TypeScript',
  context: null,
  confidence: 0.5,
  source: 'manual',
  status: 'active',
  superseded_by: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  last_accessed_at: '2024-01-01T00:00:00.000Z',
  access_count: 0
}

describe('preferencesRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(addAuditLog).mockClear()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  describe('createPreference', () => {
    it('creates new preference constitution source (skip conflict check)', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: { ...prefRow, source: 'constitution' } })
      const pref = createPreference({ workspaceId: 'ws1', subject: 'my-rules', value: 'strict', source: 'constitution' })
      expect(pref.source).toBe('constitution')
      expect(pref.status).toBe('active')
      expect(addAuditLog).toHaveBeenCalled()
    })

    it('creates new preference when no existing same subject', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
      stmtResults.set('(context IS ? OR (context IS NOT NULL AND context = ?))', { all: [] })
      const pref = createPreference({ workspaceId: 'ws1', subject: 'language', value: 'TypeScript' })
      expect(pref.subject).toBe('language')
      expect(pref.value).toBe('TypeScript')
      expect(addAuditLog).toHaveBeenCalled()
    })

    it('boosts confidence when existing same value', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: { ...prefRow, confidence: 0.55, access_count: 1 } })
      stmtResults.set('(context IS ? OR (context IS NOT NULL AND context = ?))', { all: [prefRow] })
      const pref = createPreference({ workspaceId: 'ws1', subject: 'language', value: 'TypeScript' })
      expect(pref.confidence).toBeGreaterThan(0.4)
      expect(pref.accessCount).toBe(1)
      expect(addAuditLog).toHaveBeenCalled()
    })

    it('supersedes existing when existing different value', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
      stmtResults.set('(context IS ? OR (context IS NOT NULL AND context = ?))', {
        all: [{ ...prefRow, value: 'JavaScript', id: 'p-old' }]
      })
      const pref = createPreference({ workspaceId: 'ws1', subject: 'language', value: 'TypeScript' })
      expect(pref.subject).toBe('language')
      // 1 for superseded old + 1 for new = at least 2 (can be more if there are multiple olds)
      expect(addAuditLog).toHaveBeenCalledTimes(2)
    })

    it('handles non-null context matching', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
      stmtResults.set('(context IS ? OR (context IS NOT NULL AND context = ?))', { all: [] })
      createPreference({ workspaceId: 'ws1', subject: 'language', value: 'TypeScript', context: 'web' })
      expect(db.prepare).toHaveBeenCalled()
    })

    it('same-value different context do not conflict, both can coexist', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
      stmtResults.set('(context IS ? OR (context IS NOT NULL AND context = ?))', { all: [] })
      createPreference({ workspaceId: 'ws1', subject: 'editor', value: 'VS Code', context: 'web' })
      expect(addAuditLog).toHaveBeenCalled()
    })
  })

  it('getPreference returns null when not found', () => {
    expect(getPreference('nope')).toBeNull()
  })

  it('getPreference maps row to object correctly', () => {
    stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
    expect(getPreference('p1')?.subject).toBe('language')
  })

  it('listPreferences builds conditions and filters', () => {
    stmtResults.set('ORDER BY subject ASC, confidence DESC', { all: [prefRow] })
    const list = listPreferences({ workspaceId: 'ws1', status: 'active', subject: 'language' })
    expect(list).toHaveLength(1)
    const arg = db.prepare.mock.calls.find((c: any[]) => String(c[0]).includes('WHERE '))![0]
    expect(String(arg)).toContain('workspace_id = @workspaceId')
    expect(String(arg)).toContain('status = @status')
  })

  it('updatePreference returns null when not found', () => {
    expect(updatePreference('nope', { value: 'new' })).toBeNull()
  })

  it('updatePreference with empty patch returns before', () => {
    stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
    expect(updatePreference('p1', {})?.id).toBe('p1')
  })

  it('updatePreference rebuilds FTS when subject/value changes', () => {
    stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
    updatePreference('p1', { value: 'new' })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO preferences_fts'))
  })

  it('deletePreference unindexes and deletes, adds audit', () => {
    stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
    deletePreference('p1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM preferences WHERE id = ?')
    expect(addAuditLog).toHaveBeenCalled()
  })

  it('archivePreference returns null when not found', () => {
    expect(archivePreference('nope')).toBeNull()
  })

  it('archivePreference archives existing and adds audit', () => {
    stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: prefRow })
    archivePreference('p1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SET status = \'archived\''))
    expect(addAuditLog).toHaveBeenCalled()
  })

  describe('decayConfidence', () => {
    it('returns 0 when no rows to decay', () => {
      stmtResults.set('last_accessed_at < ?', { all: [] })
      expect(decayConfidence('ws1')).toBe(0)
    })

    it('decays and leaves above threshold confidence only', () => {
      stmtResults.set('last_accessed_at < ?', {
        all: [{ id: 'p1', confidence: 0.3 }, { id: 'p2', confidence: 0.1 }]
      })
      const count = decayConfidence()
      expect(count).toBe(2)
    })

    it('archives when new confidence <= 0.05', () => {
      stmtResults.set('last_accessed_at < ?', { all: [{ id: 'p1', confidence: 0.05 }] })
      decayConfidence(undefined, 30, 0.1)
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SET status = \'archived\''))
    })

    it('works with workspaceId filter', () => {
      stmtResults.set('last_accessed_at < ?', { all: [{ id: 'p1', confidence: 0.5 }] })
      const count = decayConfidence('ws1')
      expect(count).toBe(1)
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('workspace_id = ?'))
    })
  })

  it('touchPreference updates access_count and last_accessed_at', () => {
    touchPreference('p1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SET access_count = access_count + 1'))
  })

  it('searchPreferences returns empty when ftsQuery is empty', () => {
    expect(searchPreferences('', { workspaceId: 'ws1' })).toEqual([])
  })

  it('searchPreferences returns results when fts matches', () => {
    stmtResults.set('JOIN preferences_fts', { all: [prefRow] })
    const results = searchPreferences('lang', { workspaceId: 'ws1' })
    expect(results).toHaveLength(1)
  })

  it('getUserProfile aggregates preferences with constitution on top', () => {
    stmtResults.set('WHERE workspace_id = @workspaceId AND status = @status', {
      all: [
        { ...prefRow, id: 'p1', source: 'constitution', subject: 'constitution', value: 'rule1' },
        { ...prefRow, id: 'p2', source: 'manual', subject: 'language', value: 'TS' }
      ]
    })
    stmtResults.set('SELECT COUNT(*) as n FROM preferences WHERE workspace_id = ?', { get: { n: 2 } })
    const profile = getUserProfile('ws1')
    expect(profile.bySubject[0].subject).toBe('constitution')
    expect(profile.activePreferences).toBe(2)
  })

  it('getConstitution queries with filter', () => {
    stmtResults.set('source = \'constitution\' AND status = \'active\'', { all: [prefRow] })
    const list = getConstitution('ws1')
    expect(list).toHaveLength(1)
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('workspace_id = ?'))
  })

  it('getConstitution without workspaceId returns all', () => {
    stmtResults.set('source = \'constitution\' AND status = \'active\'', { all: [prefRow] })
    expect(getConstitution()).toHaveLength(1)
  })

  it('countPreferences returns breakdown', () => {
    stmtResults.set("status = 'active'", { get: { n: 5 } })
    stmtResults.set("status = 'superseded'", { get: { n: 2 } })
    stmtResults.set("status = 'archived'", { get: { n: 1 } })
    stmtResults.set('SELECT COUNT(*) as n FROM preferences WHERE workspace_id = ?', { get: { n: 8 } })
    expect(countPreferences('ws1')).toEqual({ total: 8, active: 5, superseded: 2, archived: 1 })
  })

  describe('detectConflicts', () => {
    it('returns empty when no conflicts', () => {
      stmtResults.set('GROUP BY subject', { all: [] })
      expect(detectConflicts('ws1')).toEqual([])
    })

    it('detects conflicts where subject has multiple distinct values', () => {
      stmtResults.set('GROUP BY subject', { all: [{ subject: 'language', value_count: 2 }] })
      stmtResults.set('ORDER BY created_at DESC', {
        all: [
          { ...prefRow, id: 'p1', value: 'TypeScript', confidence: 0.8 },
          { ...prefRow, id: 'p2', value: 'JavaScript', confidence: 0.5 }
        ]
      })
      const conflicts = detectConflicts('ws1')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].subject).toBe('language')
      expect(conflicts[0].conflicts).toHaveLength(1)
    })

    it('skips groups with less than 2 distinct values', () => {
      stmtResults.set('GROUP BY subject', { all: [{ subject: 'language', value_count: 2 }] })
      stmtResults.set('ORDER BY created_at DESC', {
        all: [{ ...prefRow, value: 'TypeScript' }, { ...prefRow, value: 'TypeScript' }]
      })
      const conflicts = detectConflicts('ws1')
      expect(conflicts).toEqual([])
    })

    it('works without workspaceId', () => {
      stmtResults.set('GROUP BY subject', { all: [] })
      detectConflicts()
      expect(db.prepare).toHaveBeenCalled()
    })
  })
})