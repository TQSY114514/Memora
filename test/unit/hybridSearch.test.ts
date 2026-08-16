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

// 语义模块 mock：生产代码在 catch 里用 instanceof SearchTimeoutError 判定，
// 因此 mock 必须提供同名类（用 vi.hoisted 避免工厂闭包引用类声明的 TDZ 问题）
const { semanticSearchMock, TestSearchTimeoutError } = vi.hoisted(() => {
  class TestSearchTimeoutError extends Error {
    constructor(message?: string) {
      super(message)
      this.name = 'SearchTimeoutError'
    }
  }
  return { semanticSearchMock: vi.fn(), TestSearchTimeoutError }
})
vi.mock('../../src/search/semantic', () => ({
  semanticSearch: (...args: unknown[]) => semanticSearchMock(...args),
  SearchTimeoutError: TestSearchTimeoutError
}))

const listFoldersMock = vi.fn()
vi.mock('../../src/database/repositories/folderRepo', () => ({
  listFolders: (...args: unknown[]) => listFoldersMock(...args)
}))

vi.mock('../../src/database/connection', () => ({
  getDatabase: vi.fn()
}))

import { getDatabase } from '../../src/database/connection'
import { hybridSearch, computeGraphBoost, computeEntityBoost } from '../../src/search/hybridSearch'

const config = {
  provider: 'openai',
  baseUrl: 'https://api.example.com',
  apiKey: 'test',
  chatModel: 'gpt-4o',
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 1536
}

function makeSession(id: string, title: string, isFavorite = false, extra: Partial<Record<string, any>> = {}) {
  return {
    id,
    title,
    provider: 'ChatGPT',
    isFavorite,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-20T00:00:00Z',
    folderId: undefined,
    tags: [],
    ...extra
  }
}

/** 构造一个返回 FTS 行的 mock db（图谱/实体 boost 查询路由到空结果） */
function makeFtsDb(rows: any[]) {
  const stmt = { all: vi.fn(() => rows), get: vi.fn(() => undefined) }
  const emptyStmt = { all: vi.fn(() => [] as any[]), get: vi.fn(() => undefined) }
  return {
    prepare: vi.fn((sql: string) => {
      // computeGraphBoost / computeEntityBoost 的批量查询（boost = 0）
      if (sql.includes('knowledge_entries') || sql.includes('knowledge_relations')) {
        return emptyStmt
      }
      return stmt
    }),
    _stmt: stmt
  }
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

  it('语义搜索超时：跳过语义召回，仅返回 FTS 结果（不降级为主进程同步扫描）', async () => {
    const ftsRow = { session_id: 's1', title: '架构', content: '使用 Electron 构建', provider: 'ChatGPT', rank: 1 }
    const mockDb = makeFtsDb([ftsRow])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    getSessionsByIdsMock.mockReturnValue(new Map([['s1', makeSession('s1', '架构')]]))
    semanticSearchMock.mockRejectedValue(
      new TestSearchTimeoutError('worker search timeout (reqId=1, exceeded 30000ms)')
    )

    const results = await hybridSearch('Electron', config, { semantic: true })

    // FTS 结果保留，语义超时不参与融合、也不让整个搜索失败
    expect(results.length).toBe(1)
    expect(results[0].session.id).toBe('s1')
    expect(results[0].scoreBreakdown.vectorScore).toBe(0)
  })
})

describe('computeGraphBoost（批量）', () => {
  it('无图数据时返回 0', () => {
    const mockDb = makeFtsDb([])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    // knowledge 查询返回空 → entryCount/relCount 均为 0
    const boosts = computeGraphBoost(['s1', 's2'])
    expect(boosts.get('s1')).toBe(0)
    expect(boosts.get('s2')).toBe(0)
  })

  it('会话关联的知识条目与关系越多，boost 越高（最多 0.1）', () => {
    // 条目 GROUP BY 计数：s1 = 10；关系端点行 5 条（from 属于 s1）→ (10+5)/20*0.1 = 0.075
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('GROUP BY session_id')) {
          return { all: vi.fn(() => [{ session_id: 's1', cnt: 10 }]) }
        }
        if (sql.includes('knowledge_relations')) {
          return {
            all: vi.fn(() =>
              Array.from({ length: 5 }, (_, i) => ({
                from_id: 'e1',
                to_id: `other-${i}`,
                relation: 'relates',
                from_session: 's1',
                to_session: `other-${i}` // 不在候选集，不计数
              }))
            )
          }
        }
        return { all: vi.fn(() => [] as any[]) }
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const boosts = computeGraphBoost(['s1'])
    expect(boosts.get('s1')).toBeCloseTo(0.075, 5)
  })

  it('关系两端属于同一会话时只计一次（与单会话 COUNT(*) 语义一致）', () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('GROUP BY session_id')) {
          return { all: vi.fn(() => [{ session_id: 's1', cnt: 0 }]) }
        }
        if (sql.includes('knowledge_relations')) {
          return {
            all: vi.fn(() => [
              { from_id: 'e1', to_id: 'e2', relation: 'relates', from_session: 's1', to_session: 's1' }, // 同会话 → 只计 1
              { from_id: 'e1', to_id: 'e3', relation: 'relates', from_session: 's1', to_session: 'other' }
            ])
          }
        }
        return { all: vi.fn(() => [] as any[]) }
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    // entries 0 + rels 2 → 2/20*0.1 = 0.01
    expect(computeGraphBoost(['s1']).get('s1')).toBeCloseTo(0.01, 5)
  })

  it('boost 上限为 0.1', () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('GROUP BY session_id')) {
          return { all: vi.fn(() => [{ session_id: 's1', cnt: 100 }]) }
        }
        return { all: vi.fn(() => [] as any[]) }
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    expect(computeGraphBoost(['s1']).get('s1')).toBeCloseTo(0.1, 5)
  })

  it('跨 chunk 的关系行全局去重：只计一次，不随 chunk 数重复计数', () => {
    // 401 个会话拆成 2 个 chunk（IN_CHUNK_SIZE=400）：s-0 在 chunk1，s-400 在 chunk2
    const ids = Array.from({ length: 401 }, (_, i) => `s-${i}`)
    const crossA = 's-0'
    const crossB = 's-400'
    const relationRow = {
      from_id: 'eA',
      to_id: 'eB',
      relation: 'relates',
      from_session: crossA,
      to_session: crossB
    }
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('GROUP BY session_id')) {
          return { all: vi.fn(() => []) } // 无知识条目
        }
        if (sql.includes('knowledge_relations')) {
          // 两个 chunk 的查询都会命中同一条跨 chunk 关系行（真实场景中两端分属两批）
          return { all: vi.fn(() => [relationRow]) }
        }
        return { all: vi.fn(() => [] as any[]) }
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const boosts = computeGraphBoost(ids)
    // 去重后：两端会话各只计 1 次 → (0+1)/20*0.1 = 0.005（未去重会各 +2 得到 0.01）
    expect(boosts.get(crossA)).toBeCloseTo(0.005, 5)
    expect(boosts.get(crossB)).toBeCloseTo(0.005, 5)
    // 其余会话 boost 为 0
    expect(boosts.get('s-1')).toBe(0)
    expect(boosts.get('s-399')).toBe(0)
  })
})

describe('computeEntityBoost（批量）', () => {
  it('无知识条目时返回 0', () => {
    const mockDb = makeFtsDb([])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    expect(computeEntityBoost(['s1']).get('s1')).toBe(0)
  })

  it('会话存在实体链接关系时返回加成（最多 0.15）', () => {
    // s1 的条目 e1/e2 作为端点的显式关系 2 条 → 2/4*0.15 = 0.075
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('SELECT id, session_id FROM knowledge_entries')) {
          return { all: vi.fn(() => [{ id: 'e1', session_id: 's1' }, { id: 'e2', session_id: 's1' }]) }
        }
        if (sql.includes('knowledge_relations')) {
          return {
            all: vi.fn(() => [
              { from_id: 'e1', to_id: 'e2', relation: 'relates' },
              { from_id: 'e2', to_id: 'e1', relation: 'relates' }
            ])
          }
        }
        return { all: vi.fn(() => [] as any[]) }
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    expect(computeEntityBoost(['s1']).get('s1')).toBeCloseTo(0.075, 5)
  })

  it('实体链接越多加成越高，且有上限 0.15', () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('SELECT id, session_id FROM knowledge_entries')) {
          return { all: vi.fn(() => [{ id: 'e1', session_id: 's1' }]) }
        }
        if (sql.includes('knowledge_relations')) {
          return {
            all: vi.fn(() =>
              Array.from({ length: 100 }, (_, i) => ({
                from_id: 'e1',
                to_id: `other-${i}`,
                relation: 'relates'
              }))
            )
          }
        }
        return { all: vi.fn(() => [] as any[]) }
      })
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    expect(computeEntityBoost(['s1']).get('s1')).toBeCloseTo(0.15, 5)
  })
})

describe('hybridSearch scope（结构化检索范围，借鉴 MemPalace）', () => {
  it('按 workspaceId 过滤：仅返回该工作区文件夹下的会话', async () => {
    listFoldersMock.mockReturnValue([{ id: 'folder-a' }, { id: 'folder-b' }])
    const ftsRow = { session_id: 's1', title: '架构', content: 'Electron', provider: 'ChatGPT', rank: 1 }
    const mockDb = makeFtsDb([ftsRow])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    getSessionsByIdsMock.mockReturnValue(
      new Map([['s1', makeSession('s1', '架构', false, { folderId: 'folder-x' })]])
    )
    semanticSearchMock.mockResolvedValue([])

    const results = await hybridSearch('Electron', config, {
      semantic: true,
      scope: { workspaceId: 'ws1' }
    })

    // 会话 folderId=folder-x 不在允许集合内 → 被过滤
    expect(results.length).toBe(0)
  })

  it('按 tag 过滤：仅返回含指定标签的会话', async () => {
    const ftsRow = { session_id: 's1', title: 'Python', content: '后端', provider: 'ChatGPT', rank: 1 }
    const mockDb = makeFtsDb([ftsRow])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    getSessionsByIdsMock.mockReturnValue(
      new Map([['s1', makeSession('s1', 'Python', false, { tags: [{ name: 'work' }] })]])
    )
    semanticSearchMock.mockResolvedValue([])

    // 会话标签为 work，不匹配 personal → 被过滤
    const results = await hybridSearch('Python', config, {
      semantic: true,
      scope: { tag: 'personal' }
    })
    expect(results.length).toBe(0)

    // 匹配 work → 保留
    const kept = await hybridSearch('Python', config, {
      semantic: true,
      scope: { tag: 'work' }
    })
    expect(kept.length).toBe(1)
  })

  it('按 title 关键词过滤：仅返回标题包含关键词的会话', async () => {
    const ftsRow = { session_id: 's1', title: 'Electron 项目', content: '构建', provider: 'ChatGPT', rank: 1 }
    const mockDb = makeFtsDb([ftsRow])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
    getSessionsByIdsMock.mockReturnValue(new Map([['s1', makeSession('s1', 'Electron 项目')]]))
    semanticSearchMock.mockResolvedValue([])

    const matched = await hybridSearch('Electron', config, {
      semantic: true,
      scope: { title: 'electron' }
    })
    expect(matched.length).toBe(1)

    const missed = await hybridSearch('Electron', config, {
      semantic: true,
      scope: { title: 'rust' }
    })
    expect(missed.length).toBe(0)
  })
})