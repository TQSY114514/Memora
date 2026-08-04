import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('worker_threads', () => ({
  // 强制 worker 创建失败，走主进程 fallback 路径
  Worker: class {
    constructor() {
      throw new Error('worker unavailable in test')
    }
    postMessage() {}
    on() {}
    off() {}
    terminate() {}
  }
}))
vi.mock('../../src/database/connection', () => ({
  getDatabase: vi.fn(),
  getDbPath: () => '/tmp/memora-test-userdata/aether.db'
}))
vi.mock('../../src/database/repositories/sessionRepo', () => ({
  getSession: vi.fn()
}))
vi.mock('../../src/ai/apiClient', () => ({
  embedQuery: vi.fn()
}))

import { getDatabase } from '../../src/database/connection'
import { getSession } from '../../src/database/repositories/sessionRepo'
import { embedQuery } from '../../src/ai/apiClient'
import { semanticSearch } from '../../src/search/semantic'

const config = {
  provider: 'openai',
  apiStyle: 'openai',
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  chatModel: 'gpt-4o',
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 3
} as any

/** 构造一个退回主进程同步检索的 mock db */
function makeFallbackDb() {
  const embeddingsStmt = {
    all: vi.fn(() => [
      { message_id: 'm1', session_id: 's1', embedding: Buffer.from(new Float32Array([1, 0, 0]).buffer), model: 'x' }
    ])
  }
  const messagesStmt = {
    all: vi.fn(() => [{ id: 'm1', content: '用户喜欢 TypeScript' }])
  }
  const db = {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('message_embeddings')) return embeddingsStmt
      return messagesStmt
    }),
    _embeddingsStmt: embeddingsStmt,
    _messagesStmt: messagesStmt
  }
  return db
}

describe('semanticSearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('空查询返回空数组', async () => {
    expect(await semanticSearch('   ', config)).toEqual([])
  })

  it('worker 不可用时走主进程 fallback 并聚合结果', async () => {
    const db = makeFallbackDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)
    vi.mocked(getSession).mockReturnValue({
      id: 's1',
      title: '会话',
      provider: 'ChatGPT',
      isFavorite: false,
      messageCount: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      importedAt: '2026-08-01T00:00:00.000Z',
      tags: [],
      messages: []
    } as any)
    vi.mocked(embedQuery).mockResolvedValue([1, 0, 0])

    const results = await semanticSearch('TypeScript', config, { limit: 5, threshold: 0.5 })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].session.id).toBe('s1')
    expect(results[0].snippet).toBe('用户喜欢 TypeScript')
    expect(results[0].score).toBeGreaterThanOrEqual(0.5)
  })

  it('无向量命中时返回空数组', async () => {
    // 查询向量与库中向量正交，低于阈值
    const db = makeFallbackDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)
    vi.mocked(embedQuery).mockResolvedValue([0, 1, 0])
    const results = await semanticSearch('unrelated', config, { limit: 5, threshold: 0.9 })
    expect(results).toEqual([])
  })
})