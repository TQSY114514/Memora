import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
  detectConflicts,
  feedbackPreference,
  computeTemporalScore,
  isPreferenceActive
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

  describe('feedbackPreference（记忆纠错闭环，借鉴 MemOS）', () => {
    // 状态化 mock：第一次 get 返回原始偏好，后续 get 返回更新后的偏好
    // （feedbackPreference 内部 getPreference 会先读原始值，updatePreference 更新后再读一次）
    function statefulGet(updated: typeof prefRow) {
      let n = 0
      return () => {
        n++
        return n < 3 ? prefRow : updated
      }
    }

    it('returns null when preference not found', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: undefined })
      const updated = feedbackPreference({
        preferenceId: 'p1',
        feedback: '改成 Rust',
        workspaceId: 'ws1'
      })
      expect(updated).toBeNull()
    })

    it('correction 类型：修正值，保留原值为 context', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', {
        get: statefulGet({ ...prefRow, value: 'Rust', context: '修正前：TypeScript', confidence: 0.7 })
      })
      stmtResults.set('UPDATE preferences SET ', { run: undefined })
      const updated = feedbackPreference({
        preferenceId: 'p1',
        feedback: '不对，其实我更喜欢 Rust',
        workspaceId: 'ws1'
      })
      expect(updated?.value).toBe('Rust')
      expect(updated?.confidence).toBe(0.5 + 0.2) // 提升置信度 0.2
      expect(updated?.context).toContain('修正前：TypeScript')
      expect(addAuditLog).toHaveBeenCalled()
    })

    it('append 类型：补充信息追加到 context', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', {
        get: statefulGet({ ...prefRow, context: '补充：适合大型项目', confidence: 0.7 })
      })
      stmtResults.set('UPDATE preferences SET ', { run: undefined })
      const updated = feedbackPreference({
        preferenceId: 'p1',
        feedback: '补充：适合大型项目',
        workspaceId: 'ws1'
      })
      expect(updated?.value).toBe('TypeScript') // value 不变
      expect(updated?.context).toContain('补充：适合大型项目')
      expect(addAuditLog).toHaveBeenCalled()
    })

    it('replace 类型：直接替换 value', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', {
        get: statefulGet({ ...prefRow, value: 'JavaScript', confidence: 0.7 })
      })
      stmtResults.set('UPDATE preferences SET ', { run: undefined })
      const updated = feedbackPreference({
        preferenceId: 'p1',
        feedback: 'JavaScript',
        workspaceId: 'ws1'
      })
      expect(updated?.value).toBe('JavaScript')
      expect(updated?.confidence).toBe(0.5 + 0.2)
      expect(addAuditLog).toHaveBeenCalled()
    })

    it('extracts value from quoted content', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', {
        get: statefulGet({ ...prefRow, value: 'Rust', confidence: 0.7 })
      })
      stmtResults.set('UPDATE preferences SET ', { run: undefined })
      const updated = feedbackPreference({
        preferenceId: 'p1',
        feedback: '应该改成 "Rust"',
        workspaceId: 'ws1'
      })
      expect(updated?.value).toBe('Rust')
    })

    it('confidence capped at 1.0', () => {
      stmtResults.set('SELECT * FROM preferences WHERE id = ?', {
        get: statefulGet({ ...prefRow, confidence: 1.0, value: 'Python' })
      })
      stmtResults.set('UPDATE preferences SET ', { run: undefined })
      const updated = feedbackPreference({
        preferenceId: 'p1',
        feedback: '改成 Python',
        workspaceId: 'ws1'
      })
      expect(updated?.confidence).toBe(1.0)
    })
  })

  describe('computeTemporalScore（v1.15 时间感知检索）', () => {
    it('permanent（无时间边界）返回 1.0', () => {
      expect(computeTemporalScore({})).toBe(1)
      expect(computeTemporalScore({ validAt: undefined, invalidAt: undefined })).toBe(1)
    })

    it('未生效（valid_at 在未来）返回 0', () => {
      const score = computeTemporalScore(
        { validAt: '2099-01-01T00:00:00.000Z' },
        new Date('2026-01-01T00:00:00.000Z')
      )
      expect(score).toBe(0)
    })

    it('已过期（invalid_at 在过去）返回 0', () => {
      const score = computeTemporalScore(
        { invalidAt: '2020-01-01T00:00:00.000Z' },
        new Date('2026-01-01T00:00:00.000Z')
      )
      expect(score).toBe(0)
    })

    it('窗口中心分数最高（≥0.9），边界处衰减', () => {
      const now = new Date('2026-06-15T00:00:00.000Z')
      // 窗口：2026-01-01 ~ 2026-12-31，现在正处中心附近
      const center = computeTemporalScore(
        { validAt: '2026-01-01T00:00:00.000Z', invalidAt: '2026-12-31T00:00:00.000Z' },
        now
      )
      // 窗口：2026-06-15T00:00 ~ 2026-06-16T00:00，now 恰在窗口左边界
      const edge = computeTemporalScore(
        { validAt: '2026-06-15T00:00:00.000Z', invalidAt: '2026-06-16T00:00:00.000Z' },
        now
      )
      expect(center).toBeGreaterThan(0.9)
      expect(edge).toBeLessThan(center)
      expect(edge).toBeGreaterThanOrEqual(0.6)
    })

    it('只有 valid_at 无 invalid_at：从 start 时刻到未来一周内维持高分', () => {
      const now = new Date('2026-06-15T00:00:00.000Z')
      const score = computeTemporalScore({ validAt: '2026-06-14T00:00:00.000Z' }, now)
      expect(score).toBeGreaterThan(0.6)
    })

    it('只有 invalid_at 无 valid_at：从过去一周内到到期日', () => {
      const now = new Date('2026-06-15T00:00:00.000Z')
      const score = computeTemporalScore({ invalidAt: '2026-06-16T00:00:00.000Z' }, now)
      expect(score).toBeGreaterThan(0.6)
    })
  })

  describe('isPreferenceActive（v1.15 过期过滤）', () => {
    it('已过期偏好返回 false', () => {
      expect(
        isPreferenceActive(
          { invalidAt: '2020-01-01T00:00:00.000Z' },
          new Date('2026-01-01T00:00:00.000Z')
        )
      ).toBe(false)
    })

    it('未生效偏好返回 false', () => {
      expect(
        isPreferenceActive(
          { validAt: '2099-01-01T00:00:00.000Z' },
          new Date('2026-01-01T00:00:00.000Z')
        )
      ).toBe(false)
    })

    it('窗口内偏好返回 true', () => {
      expect(
        isPreferenceActive(
          { validAt: '2026-01-01T00:00:00.000Z', invalidAt: '2026-12-31T00:00:00.000Z' },
          new Date('2026-06-01T00:00:00.000Z')
        )
      ).toBe(true)
    })

    it('无时间窗口的 permanent 偏好始终 true', () => {
      expect(isPreferenceActive({}, new Date())).toBe(true)
    })
  })

  describe('searchPreferences 时态过滤（v1.15）', () => {
    // 固定系统时间为 2026-06-15（窗口中心附近），使时态打分断言确定
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('过期偏好不进入结果（SQL 层时态条件 + 打分过滤）', () => {
      // mock 返回的数据里含一条 invalid_at 在未来、一条已过期；
      // searchPreferences 内部先按 SQL 过滤（mock 直接返回 all 行集绕过 SQL），
      // 此处验证时态打分排序：过期行算 0 分会被排到末尾，最后 slice 掉
      stmtResults.set('JOIN preferences_fts', {
        all: [
          { ...prefRow, id: 'p-valid', confidence: 0.5, invalid_at: '2026-12-31T00:00:00.000Z', valid_at: '2026-01-01T00:00:00.000Z', temporal_type: 'temporary' },
          { ...prefRow, id: 'p-expired', confidence: 0.9, invalid_at: '2020-01-01T00:00:00.000Z', temporal_type: 'temporary' }
        ]
      })
      const results = searchPreferences('lang', { workspaceId: 'ws1', limit: 1 })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('p-valid')
    })

    it('有效窗口内偏好按 confidence × 时态分排序（时态分反超置信度）', () => {
      // p-low: 高置信 0.7 但正处窗口边界（invalid 恰为 now）→ 时态分 0.6，加权 0.42
      // p-high: 低置信 0.5 但处窗口中心附近 → 时态分 ≈1，加权 ≈0.48
      // 结果：p-high 因时态加权反超 p-low，证明时态分参与排序
      stmtResults.set('JOIN preferences_fts', {
        all: [
          { ...prefRow, id: 'p-low', confidence: 0.7, invalidAt: undefined, invalid_at: '2026-06-15T00:00:00.000Z', valid_at: '2026-06-14T00:00:00.000Z', temporal_type: 'temporary' },
          { ...prefRow, id: 'p-high', confidence: 0.5, valid_at: '2026-01-01T00:00:00.000Z', invalid_at: '2026-12-31T00:00:00.000Z', temporal_type: 'temporary' }
        ]
      })
      const results = searchPreferences('lang', { workspaceId: 'ws1', limit: 2 })
      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('p-high')
    })
  })
})