import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Project Memory 来源归因测试（v1.15 Sources Attribution）
 *
 * 覆盖：
 * - parseAttribution 的 JSON 解析（含 ```json 围栏容错）
 * - askProjectMemory 归因成功时过滤 citations + 附加 reason
 * - askProjectMemory 归因失败时降级返回全部 citations（向后兼容）
 */

// 依赖 mock
vi.mock('../../src/database/connection', () => ({
  getDatabase: vi.fn(() => ({
    prepare: (sql: string) => ({
      get: (...params: unknown[]) => {
        // current 消息查询（WHERE id = ?）返回消息本身；上下文查询返回 undefined
        if (sql.includes('WHERE id = ?')) {
          return { id: params[0], session_id: `s${String(params[0]).replace('m', '')}`, role: 'user', content: '内容', msg_order: 1 }
        }
        return undefined
      },
      all: () => []
    })
  }))
}))
vi.mock('../../src/database/repositories/sessionRepo', () => ({
  getSession: vi.fn()
}))
vi.mock('../../src/database/repositories/embeddingRepo', () => ({
  getAllEmbeddings: vi.fn()
}))
vi.mock('../../src/search/embedding', () => ({}))
vi.mock('../../src/ai/apiClient', () => ({
  callChat: vi.fn(),
  embedQuery: vi.fn()
}))

import { askProjectMemory } from '../../src/ai/projectMemory'
import { callChat, embedQuery } from '../../src/ai/apiClient'
import { getAllEmbeddings } from '../../src/database/repositories/embeddingRepo'
import { getSession } from '../../src/database/repositories/sessionRepo'

const VEC = new Array(8).fill(0.1)

function mockEmbeddings(count: number) {
  getAllEmbeddings.mockReturnValue(
    Array.from({ length: count }, (_, i) => ({
      messageId: `m${i + 1}`,
      sessionId: `s${i + 1}`,
      embedding: VEC.map((v, j) => v + j * 0.01 * (i + 1))
    }))
  )
}

function mockSession(id: string) {
  getSession.mockReturnValue({ id, title: `会话${id}`, provider: 'Claude' } as any)
}

describe('askProjectMemory — 来源归因', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    embedQuery.mockResolvedValue(VEC)
    mockSession('s1')
    mockSession('s2')
  })

  it('归因成功时只返回被使用的来源并附加 reason', async () => {
    mockEmbeddings(2)
    vi.mocked(callChat)
      .mockResolvedValueOnce('用户偏好 TypeScript。') // 主回答
      .mockResolvedValueOnce('[{"index":1,"reason":"提供了技术栈偏好"}]') // 归因

    const result = await askProjectMemory('用户用什么语言？', { chatModel: 'gpt', embeddingDim: 8 } as any)

    expect(result.citations).toHaveLength(1)
    expect(result.citations[0].reason).toBe('提供了技术栈偏好')
  })

  it('归因返回超界 index 时安全降级', async () => {
    mockEmbeddings(2)
    vi.mocked(callChat)
      .mockResolvedValueOnce('回答内容')
      .mockResolvedValueOnce('[{"index":9,"reason":"越界"}]') // 片段 9 不存在于 2 条

    const result = await askProjectMemory('问题', { categoryModel: 'x' } as any)

    // 无合法引用 → 返回空 citations（不崩溃）
    expect(Array.isArray(result.citations)).toBe(true)
  })

  it('归因 LLM 抛出异常时降级返回全部 citations', async () => {
    mockEmbeddings(2)
    vi.mocked(callChat)
      .mockResolvedValueOnce('答案内容')
      .mockRejectedValueOnce(new Error('attribution timeout'))

    const result = await askProjectMemory('问题', { chatModel: 'x' } as any)

    expect(result.citations.length).toBeGreaterThan(0)
    expect(callChat).toHaveBeenCalledTimes(2)
  })

  it('归因输出带 Markdown 围栏时仍能解析', async () => {
    mockEmbeddings(2)
    vi.mocked(callChat)
      .mockResolvedValueOnce('答案')
      .mockResolvedValueOnce('```json\n[{"index":1,"reason":"根据用户技术栈"}]  \n```')

    const result = await askProjectMemory('问题', { chatModel: 'x' } as any)

    expect(result.citations[0].reason).toBe('根据用户技术栈')
  })

  it('归因未使用任何来源时返回空 citations（不返回未使用片段）', async () => {
    mockEmbeddings(3)
    vi.mocked(callChat)
      .mockResolvedValueOnce('没有可用信息。')
      .mockResolvedValueOnce('[]')

    const result = await askProjectMemory('问题', { chatModel: 'x' } as any)

    expect(result.citations).toHaveLength(0)
  })
})