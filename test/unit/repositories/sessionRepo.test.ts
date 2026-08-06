import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import {
  createSession,
  getSession,
  findBySourceId,
  listMessagesBySession,
  listSessions,
  getSessionTagsBatch,
  getSessionsByIds,
  listSessionsByWorkspace,
  listSessionsByRule,
  updateSession,
  toggleFavorite,
  moveSession,
  deleteSession,
  setSessionTemporary,
  cleanupExpiredSessions,
  DEFAULT_TEMP_SESSION_DAYS
} from '../../../src/database/repositories/sessionRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))
vi.mock('@search/indexer', () => ({
  indexSessionForSearch: vi.fn(),
  unindexSession: vi.fn()
}))

const sessionRow = {
  id: 's1',
  source_id: 'src1',
  provider: 'openai',
  model: 'gpt-4',
  title: 'Project Alpha',
  description: 'Planning',
  folder_id: 'f1',
  is_favorite: 1,
  message_count: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  imported_at: '2024-01-01T00:00:00.000Z'
}

const messageRow = {
  id: 'm1',
  session_id: 's1',
  role: 'user',
  content: 'hello',
  model: 'gpt-4',
  tokens: 10,
  msg_order: 0,
  created_at: '2024-01-01T00:00:00.000Z'
}

const tagRow = {
  session_id: 's1',
  id: 't1',
  name: 'important',
  color: null,
  created_at: '2024-01-01T00:00:00.000Z'
}

describe('sessionRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('createSession with messages inserts session and messages and returns it', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: sessionRow })
    const session = createSession(
      {
        provider: 'openai',
        title: 'Project Alpha',
        isFavorite: true,
        messageCount: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tags: []
      },
      [
        {
          role: 'user' as const,
          content: 'hello',
          order: 0,
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    )
    expect(session.id).toBe('s1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chat_sessions'))
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO messages'))
  })

  it('createSession without messages does not insert messages', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: { ...sessionRow, message_count: 0 } })
    const session = createSession({
      provider: 'openai',
      title: 'No Msgs',
      isFavorite: false,
      messageCount: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      tags: []
    })
    expect(session.id).toBe('s1')
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO messages'))
  })

  it('createSession returns existing session when insert conflicts (changes===0)', () => {
    stmtResults.set('INSERT INTO chat_sessions', { run: { changes: 0 } })
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: undefined })
    stmtResults.set('SELECT * FROM chat_sessions WHERE source_id = ?', { get: sessionRow })
    const session = createSession({
      sourceId: 'src1',
      provider: 'openai',
      title: 'Duplicate',
      isFavorite: false,
      messageCount: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      tags: []
    })
    expect(session.id).toBe('s1')
  })

  it('getSession returns null when not found', () => {
    expect(getSession('nope')).toBeNull()
  })

  it('getSession loads tags and messages when withMessages is true', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: sessionRow })
    stmtResults.set('SELECT * FROM messages WHERE session_id = ?', { all: [messageRow] })
    stmtResults.set('SELECT t.* FROM tags t', { all: [{ ...tagRow, session_id: undefined }] })
    const session = getSession('s1')
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages?.[0].content).toBe('hello')
  })

  it('getSession omits messages when withMessages is false', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: sessionRow })
    const session = getSession('s1', false)
    expect(session?.messages).toBeUndefined()
  })

  it('findBySourceId returns null when not found', () => {
    expect(findBySourceId('x', 'openai')).toBeNull()
  })

  it('findBySourceId returns the session when found', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE source_id = ?', { get: sessionRow })
    expect(findBySourceId('src1', 'openai')?.id).toBe('s1')
  })

  it('listMessagesBySession uses default limit and clamps', () => {
    stmtResults.set('LIMIT ? OFFSET ?', { all: [messageRow] })
    const msgs = listMessagesBySession('s1')
    expect(msgs).toHaveLength(1)
    const args = db.prepare.mock.calls.find((c: any[]) => String(c[0]).includes('LIMIT ? OFFSET ?'))!
    expect(String(args[0])).toContain('LIMIT ? OFFSET ?')
  })

  it('listMessagesBySession clamps limit to [1,500]', () => {
    stmtResults.set('LIMIT ? OFFSET ?', { all: [] })
    listMessagesBySession('s1', { limit: 9999, offset: -5 })
    expect(db.prepare).toHaveBeenCalled()
  })

  it('listSessions without filters returns all', () => {
    stmtResults.set('ORDER BY updated_at DESC LIMIT @limit OFFSET @offset', { all: [sessionRow] })
    const list = listSessions()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('s1')
  })

  it('listSessions with filters builds conditions', () => {
    stmtResults.set('ORDER BY updated_at DESC LIMIT @limit OFFSET @offset', { all: [sessionRow] })
    const list = listSessions({ folderId: 'f1', provider: 'openai', favorite: true })
    expect(list).toHaveLength(1)
    const arg = db.prepare.mock.calls.find((c: any[]) => String(c[0]).includes('ORDER BY updated_at DESC'))![0]
    expect(String(arg)).toContain('folder_id = @folderId')
    expect(String(arg)).toContain('provider = @provider')
    expect(String(arg)).toContain('is_favorite = @favorite')
  })

  it('getSessionTagsBatch returns empty map for empty ids', () => {
    expect(getSessionTagsBatch([])).toEqual(new Map())
  })

  it('getSessionTagsBatch groups rows by session', () => {
    stmtResults.set('SELECT st.session_id, t.id', { all: [tagRow] })
    const map = getSessionTagsBatch(['s1'])
    expect(map.get('s1')?.[0].name).toBe('important')
  })

  it('getSessionsByIds returns empty map for empty ids', () => {
    expect(getSessionsByIds([])).toEqual(new Map())
  })

  it('getSessionsByIds maps sessions with tags', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id IN', { all: [sessionRow] })
    stmtResults.set('SELECT st.session_id, t.id', { all: [tagRow] })
    const map = getSessionsByIds(['s1'])
    expect(map.get('s1')?.id).toBe('s1')
    expect(map.get('s1')?.tags[0].name).toBe('important')
  })

  it('listSessionsByWorkspace lists sessions in a workspace', () => {
    stmtResults.set('INNER JOIN folders f ON cs.folder_id = f.id', { all: [sessionRow] })
    const list = listSessionsByWorkspace('ws1')
    expect(list).toHaveLength(1)
  })

  it('listSessionsByRule matches by keywords', () => {
    stmtResults.set('INNER JOIN folders f ON cs.folder_id = f.id', { all: [sessionRow] })
    stmtResults.set('SELECT st.session_id, t.id', { all: [tagRow] })
    expect(listSessionsByRule('ws1', { keywords: ['project'] })).toHaveLength(1)
    expect(listSessionsByRule('ws1', { keywords: ['zzz'] })).toHaveLength(0)
  })

  it('listSessionsByRule matches by providers', () => {
    stmtResults.set('INNER JOIN folders f ON cs.folder_id = f.id', { all: [sessionRow] })
    stmtResults.set('SELECT st.session_id, t.id', { all: [tagRow] })
    expect(listSessionsByRule('ws1', { providers: ['openai'] })).toHaveLength(1)
    expect(listSessionsByRule('ws1', { providers: ['claude'] })).toHaveLength(0)
  })

  it('listSessionsByRule matches by tags', () => {
    stmtResults.set('INNER JOIN folders f ON cs.folder_id = f.id', { all: [sessionRow] })
    stmtResults.set('SELECT st.session_id, t.id', { all: [tagRow] })
    expect(listSessionsByRule('ws1', { tags: ['important'] })).toHaveLength(1)
    expect(listSessionsByRule('ws1', { tags: ['other'] })).toHaveLength(0)
  })

  it('listSessionsByRule matches by favoriteOnly', () => {
    stmtResults.set('INNER JOIN folders f ON cs.folder_id = f.id', { all: [sessionRow] })
    stmtResults.set('SELECT st.session_id, t.id', { all: [tagRow] })
    expect(listSessionsByRule('ws1', { favoriteOnly: true })).toHaveLength(1)
    stmtResults.set('INNER JOIN folders f ON cs.folder_id = f.id', { all: [{ ...sessionRow, is_favorite: 0 }] })
    expect(listSessionsByRule('ws1', { favoriteOnly: true })).toHaveLength(0)
  })

  it('updateSession maps isFavorite to integer', () => {
    updateSession('s1', { title: 'New', isFavorite: true })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE chat_sessions SET'))
  })

  it('updateSession with isFavorite false maps to 0', () => {
    updateSession('s1', { isFavorite: false })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE chat_sessions SET'))
  })

  it('updateSession with empty patch does nothing', () => {
    updateSession('s1', {})
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE chat_sessions'))
  })

  it('toggleFavorite runs its UPDATE', () => {
    toggleFavorite('s1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('is_favorite = 1 - is_favorite'))
  })

  it('moveSession runs its UPDATE', () => {
    moveSession('s1', 'f2')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SET folder_id = ?'))
  })

  it('moveSession with null folder unassigns', () => {
    moveSession('s1', null)
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SET folder_id = ?'))
  })

  it('deleteSession unindexes and deletes in a transaction', () => {
    deleteSession('s1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM chat_sessions WHERE id = ?')
  })

  // ===== 临时会话模式（v1.15 行动项 4）=====

  it('setSessionTemporary marks session temporary with expiresAt', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: sessionRow })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    try {
      setSessionTemporary('s1', 'temporary')
      const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls
      const idx = prepareCalls.findIndex(([sql]: [string]) => sql.includes('SET session_type'))
      expect(idx).toBeGreaterThanOrEqual(0)
      const runCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.results[idx].value.run.mock.calls
      const params = runCalls[0] as [string, string, string, string]
      expect(params[0]).toBe('temporary')
      expect(params[1]).toBe('2026-08-31T00:00:00.000Z') // 30 天后（默认）
    } finally {
      vi.useRealTimers()
    }
  })

  it('setSessionTemporary honors custom days', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: sessionRow })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    try {
      setSessionTemporary('s1', 'temporary', 7)
      const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls
      const idx = prepareCalls.findIndex(([sql]: [string]) => sql.includes('SET session_type'))
      const runCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.results[idx].value.run.mock.calls
      const params = runCalls[0] as [string, string, string, string]
      expect(params[1]).toBe('2026-08-08T00:00:00.000Z') // 7 天后
    } finally {
      vi.useRealTimers()
    }
  })

  it('setSessionTemporary reverting to persistent clears expiresAt', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: { ...sessionRow, session_type: 'temporary', expires_at: '2026-09-01T00:00:00.000Z' } })
    setSessionTemporary('s1', 'persistent')
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls
    const idx = prepareCalls.findIndex(([sql]: [string]) => sql.includes('SET session_type'))
    const runCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.results[idx].value.run.mock.calls
    const params = runCalls[0] as [string, string, string, string]
    expect(params[0]).toBe('persistent')
    expect(params[1]).toBeNull()
  })

  it('setSessionTemporary clamps days to [1, 365]', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: sessionRow })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    try {
      setSessionTemporary('s1', 'temporary', 9999)
      const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls
      const idx = prepareCalls.findIndex(([sql]: [string]) => sql.includes('SET session_type'))
      const runCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.results[idx].value.run.mock.calls
      const params = runCalls[0] as [string, string, string, string]
      expect(params[1]).toBe('2027-08-01T00:00:00.000Z') // 365 天后（上限）
    } finally {
      vi.useRealTimers()
    }
  })

  it('setSessionTemporary throws when session missing', () => {
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: undefined })
    expect(() => setSessionTemporary('ghost', 'temporary')).toThrow('会话不存在')
  })

  it('cleanupExpiredSessions deletes only expired temporary sessions', () => {
    // 两条过期 + 一条未过期临时 + 一条常驻
    stmtResults.set('SELECT id FROM chat_sessions WHERE session_type =', {
      all: [
        { id: 'exp1' },
        { id: 'exp2' }
      ]
    })
    const deleted = cleanupExpiredSessions('2026-08-01T00:00:00.000Z')
    expect(deleted).toBe(2)
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM chat_sessions WHERE id IN'))
  })

  it('cleanupExpiredSessions returns 0 when none expired', () => {
    stmtResults.set('SELECT id FROM chat_sessions WHERE session_type =', { all: [] })
    const deleted = cleanupExpiredSessions('2026-08-01T00:00:00.000Z')
    expect(deleted).toBe(0)
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM chat_sessions WHERE id IN'))
  })

  it('DEFAULT_TEMP_SESSION_DAYS is 30', () => {
    expect(DEFAULT_TEMP_SESSION_DAYS).toBe(30)
  })
})