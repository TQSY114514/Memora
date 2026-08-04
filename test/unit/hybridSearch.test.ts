import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const getSessionsByIdsMock = vi.fn()
vi.mock('../../src/database/repositories/sessionRepo', () => ({
  getSessionsByIds: (...args: unknown[]) => getSessionsByIdsMock(...args)
}))

const semanticSearchMock = vi.fn()
vi.mock('../../src/search/semantic', () => ({
  semanticSearch: (...args: unknown[]) => semanticSearchMock(...args)
}))

vi.mock('../../src/database/connection', () => ({
  getDatabase: vi.fn()
}))

import { getDatabase } from '../../src/database/connection'
import { hybridSearch, computeGraphBoost } from '../../src/search/hybridSearch'

const config = {
  provider: 'openai',
  baseUrl: 'https://api.example.com',
  apiKey: 'test',
  chatModel: 'gpt-4o',
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 1536
}

function makeSession(id: string, title: string, isFavorite = false) {
  return {
    id,
    title,
    provider: 'ChatGPT',
    isFavorite,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-20T00:00:00Z',
    folderId: undefined
  }
}

/** 构造一个返回 FTS 行的 mock db */
function makeFtsDb(rows: any[]) {
  const stmt = { all: vi.fn(() => rows), get: vi.fn(() => undefined) }
  return { prepare: vi.fn(() => stmt), _stmt: stmt }
}

describe('hybridSearch', () => {
  it('仅 FTS 模式：vectorScore 为 0，不调用 semanticSearch', async () => {
    const ftsRow = { session_id: 's1', title: '架构', content: '使用 Electron 构建', provider: 'ChatGPT', rank: 1 }
    const mockDb = makeFtsDb([ftsRow])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    getSessionsByIdsMock.mockReturnValue(new Map([['s1', makeSession('s1', '架构')]]))
    semanticSearchMock.mockClear()

    const results = await hybridSearch('Electron', config, { semantic: false })

    expect(results.length).toBe(1)
    expect(results[0].scoreBreakdown.vectorScore).toBe(0)
    expect(semanticSearchMock).not.toHaveBeenCalled()
  })

  it('语义模式：FTS 未命中的语义结果会被合并进来', async () => {
    const mockDb = makeFtsDb([]) // FTS 无结果（AND/OR 都为空）
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    getSessionsByIdsMock.mockReturnValue(new Map())
    semanticSearchMock.mockResolvedValue([
      {
        session: makeSession('s2', 'Rust 学习'),
        messageId: 'm1',
        snippet: '开始学习 Rust',
        score: 0.85
      }
    ])

    const results = await hybridSearch('rust', config, { semantic: true, limit: 10 })

    expect(results.length).toBe(1)
    expect(results[0].session.id).toBe('s2')
    expect(results[0].scoreBreakdown.vectorScore).toBe(0.85)
    expect(semanticSearchMock).toHaveBeenCalled()
  })

  it('语义模式：FTS 与语义共同命中时会更新 vectorScore 并提升总分', async () => {
    const ftsRow = { session_id: 's1', title: 'Python', content: '后端开发', provider: 'ChatGPT', rank: 2 }
    const mockDb = makeFtsDb([ftsRow])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    getSessionsByIdsMock.mockReturnValue(new Map([['s1', makeSession('s1', 'Python')]]))
    semanticSearchMock.mockResolvedValue([
      { session: makeSession('s1', 'Python'), messageId: 'm1', snippet: 'Python 后端', score: 0.9 }
    ])

    const results = await hybridSearch('Python', config, { semantic: true, limit: 10 })

    expect(results.length).toBe(1)
    const bd = results[0].scoreBreakdown
    expect(bd.vectorScore).toBe(0.9)
    expect(bd.ftsScore).toBeGreaterThan(0)
    // 融合后 total = fts*0.4 + vector*0.3 + timeDecay*0.15 + graph + favorite
    expect(bd.total).toBeCloseTo(bd.ftsScore * 0.4 + bd.vectorScore * 0.3 + bd.timeDecay * 0.15, 5)
  })
})

describe('computeGraphBoost', () => {
  it('无图数据时返回 0', () => {
    const mockDb = makeFtsDb([])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    // get 返回 undefined → entryCount/relCount 均为 0
    expect(computeGraphBoost('s1')).toBe(0)
  })

  it('会话关联的知识条目与关系越多，boost 越高（最多 0.1）', () => {
    // prepare 根据 SQL 返回对应计数：知识条目 10，关系 5 → (10+5)/20*0.1 = 0.075
    const stmt = {
      all: vi.fn(() => []),
      get: vi.fn(() => undefined)
    }
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('knowledge_relations')) stmt.get = vi.fn(() => ({ cnt: 5 }))
        else if (sql.includes('knowledge_entries')) stmt.get = vi.fn(() => ({ cnt: 10 }))
        else stmt.get = vi.fn(() => undefined)
        return stmt
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const boost = computeGraphBoost('s1')
    expect(boost).toBeCloseTo(0.075, 5)
  })

  it('boost 上限为 0.1', () => {
    const stmt = {
      all: vi.fn(() => []),
      get: vi.fn(() => undefined)
    }
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        stmt.get = vi.fn(() => ({ cnt: 100 }))
        return stmt
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    expect(computeGraphBoost('s1')).toBeCloseTo(0.1, 5)
  })
})