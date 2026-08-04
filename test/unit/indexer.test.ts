import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../src/database/connection', () => ({
  getDatabase: vi.fn()
}))

import { getDatabase } from '../../src/database/connection'
import { indexSessionForSearch, unindexSession } from '../../src/search/indexer'

function makeMockDb() {
  const delStmt = { run: vi.fn(() => ({ changes: 1 })) }
  const insStmt = { run: vi.fn(() => ({ changes: 1 })) }
  const db = {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('DELETE FROM chat_fts')) return delStmt
      return insStmt
    }),
    transaction: vi.fn((fn: () => void) => () => fn()),
    _delStmt: delStmt,
    _insStmt: insStmt
  }
  return db
}

describe('indexer.indexSessionForSearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('为每条消息写入索引行，并先删除旧索引', () => {
    const db = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)

    indexSessionForSearch('s1', '标题', [
      { content: '第一条' },
      { content: '第二条' }
    ], 'ChatGPT')

    expect(db._delStmt.run).toHaveBeenCalledWith('s1')
    expect(db._insStmt.run).toHaveBeenCalledTimes(2)
    // 每条消息都带 session_id 与 provider
    const calls = db._insStmt.run.mock.calls
    expect(calls[0][0]).toBe('s1')
    expect(calls[0][3]).toBe('ChatGPT')
  })

  it('无消息时写入一行空 content 索引', () => {
    const db = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)

    indexSessionForSearch('s1', '标题', [], 'ChatGPT')
    expect(db._insStmt.run).toHaveBeenCalledTimes(1)
    expect(db._insStmt.run.mock.calls[0][2]).toBe('')
  })
})

describe('indexer.unindexSession', () => {
  it('删除会话索引', () => {
    const db = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)
    unindexSession('s1')
    expect(db._delStmt.run).toHaveBeenCalledWith('s1')
  })
})