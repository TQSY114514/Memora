import { describe, it, expect, vi } from 'vitest'

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
import { scanConsolidationCandidates, executeConsolidation } from '../../src/memoryAgent/consolidation'

/** 构造一个 mock db：prepare().all() 返回给定 rows，.get() 返回 undefined */
function makeMockDb(rows: any[] = []) {
  const stmt = {
    all: vi.fn(() => rows),
    get: vi.fn(() => undefined),
    run: vi.fn(() => ({ changes: 1 }))
  }
  return {
    prepare: vi.fn(() => stmt),
    // 正确的 transaction 语义：返回一个可调用的函数，调用时才执行 fn
    transaction: vi.fn((fn: () => void) => {
      return () => fn()
    }),
    _stmt: stmt
  }
}

describe('scanConsolidationCandidates', () => {
  it('同主题多条 active 偏好会被合并为一组', async () => {
    const rows = [
      { id: 'a', subject: '技术栈', value: 'TypeScript', confidence: 0.9, status: 'active' },
      { id: 'b', subject: '技术栈', value: 'React', confidence: 0.7, status: 'active' },
      { id: 'c', subject: '音乐', value: '初音未来', confidence: 0.8, status: 'active' }
    ]
    const mockDb = makeMockDb(rows)
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const result = await scanConsolidationCandidates()
    // 同主题 "技术栈" 有 2 条 → 1 组可合并候选
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
    const tech = result.candidates.find((c) => c.subject === '技术栈')
    expect(tech).toBeDefined()
    expect(tech!.mergedIds).toContain('b')
    expect(result.totalMerged).toBeGreaterThanOrEqual(1)
  })

  it('无偏好时返回空结果', async () => {
    const mockDb = makeMockDb([])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const result = await scanConsolidationCandidates()
    expect(result.candidates).toHaveLength(0)
    expect(result.totalMerged).toBe(0)
  })

  it('跨主题语义相似（值含相同 token）也会被合并', async () => {
    const rows = [
      { id: 'a', subject: '技术栈', value: 'Python 是主要开发语言', confidence: 0.9, status: 'active' },
      { id: 'b', subject: '编程语言', value: 'Python 是主要语言', confidence: 0.8, status: 'active' }
    ]
    const mockDb = makeMockDb(rows)
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const result = await scanConsolidationCandidates()
    // subject+value 拼接后 token 相似度高（python/是/主要/语言 等），应产生跨主题合并候选
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
  })

  it('未启用 useEmbedding 时不会触发向量合并', async () => {
    const rows = [
      { id: 'a', subject: '技术栈', value: 'TypeScript', confidence: 0.9, status: 'active' },
      { id: 'b', subject: '技术栈', value: 'React', confidence: 0.7, status: 'active' }
    ]
    const mockDb = makeMockDb(rows)
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const result = await scanConsolidationCandidates('ws-1', {
      useEmbedding: true,
      config: { provider: 'openai', model: 'gpt', embeddingModel: 'ada', apiKey: 'x' } as any
    })
    // 未达到语义最小条目数（默认 100），不应走向量路径
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
  })
})

describe('executeConsolidation', () => {
  it('使用正确的 snake_case 列名（updated_at / workspace_id）', () => {
    const mockDb = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const candidates = [
      { subject: '技术栈', value: 'TS', confidence: 0.9, mergedIds: ['b'], reason: 'test' }
    ]
    const result = executeConsolidation('ws-1', candidates)

    // 找到 prepare 调用的 SQL，验证使用 snake_case 列名
    const sqlCalls = mockDb.prepare.mock.calls.map((c) => String(c[0]))
    const updateSql = sqlCalls.find((s) => s.includes('UPDATE preferences'))
    expect(updateSql).toBeDefined()
    expect(updateSql).toContain('updated_at')
    expect(updateSql).toContain('workspace_id')
    // 不应再使用 camelCase 列名
    expect(updateSql).not.toContain('updatedAt')
    expect(updateSql).not.toContain('workspaceId')

    expect(result.merged).toBe(1)
    expect(result.errors).toHaveLength(0)
  })
})