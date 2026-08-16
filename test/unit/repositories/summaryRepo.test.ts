import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import { getSummary, upsertSummary, deleteSummary } from '../../../src/database/repositories/summaryRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const baseRow = {
  id: 'sum1',
  session_id: 's1',
  summary: 'Overall summary',
  key_points: '["a","b"]',
  todos: '["c"]',
  knowledge: '["k"]',
  suggested_tags: '["t"]',
  model: 'gpt-4',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
}

describe('summaryRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('getSummary returns null when not found', () => {
    expect(getSummary('s1')).toBeNull()
  })

  it('getSummary parses valid JSON arrays', () => {
    stmtResults.set('SELECT * FROM session_summaries WHERE session_id = ?', { get: baseRow })
    const s = getSummary('s1')!
    expect(s.keyPoints).toEqual(['a', 'b'])
    expect(s.todos).toEqual(['c'])
    expect(s.knowledge).toEqual(['k'])
    expect(s.suggestedTags).toEqual(['t'])
    expect(s.model).toBe('gpt-4')
  })

  it('getSummary returns [] for invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stmtResults.set('SELECT * FROM session_summaries WHERE session_id = ?', {
      get: { ...baseRow, key_points: '{bad json' }
    })
    expect(getSummary('s1')?.keyPoints).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('getSummary returns [] for non-array JSON value', () => {
    stmtResults.set('SELECT * FROM session_summaries WHERE session_id = ?', {
      get: { ...baseRow, todos: '"just a string"', key_points: null }
    })
    const s = getSummary('s1')!
    expect(s.todos).toEqual([])
    expect(s.keyPoints).toEqual([])
  })

  it('getSummary returns undefined for null knowledge/suggestedTags', () => {
    stmtResults.set('SELECT * FROM session_summaries WHERE session_id = ?', {
      get: { ...baseRow, knowledge: null, suggested_tags: null }
    })
    const s = getSummary('s1')!
    expect(s.knowledge).toBeUndefined()
    expect(s.suggestedTags).toBeUndefined()
  })

  it('upsertSummary uses single ON CONFLICT upsert (existing row keeps id)', () => {
    stmtResults.set('SELECT * FROM session_summaries WHERE session_id = ?', { get: baseRow })
    const s = upsertSummary('s1', { summary: 'new', keyPoints: ['x'], todos: ['y'] })
    expect(s.id).toBe('sum1')
    // 单条 SQL 原子 upsert（不再先 SELECT 再 UPDATE）
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(session_id) DO UPDATE'))
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO session_summaries'))
  })

  it('upsertSummary works when summary does not exist (insert path)', () => {
    stmtResults.set('SELECT * FROM session_summaries WHERE session_id = ?', { get: undefined })
    upsertSummary('s1', { summary: 'new', keyPoints: ['x'], todos: ['y'], knowledge: ['k'], suggestedTags: ['t'], model: 'gpt' })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO session_summaries'))
  })

  it('deleteSummary runs a DELETE', () => {
    deleteSummary('s1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM session_summaries WHERE session_id = ?')
  })
})