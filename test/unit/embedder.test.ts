import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../src/database/repositories/sessionRepo', () => ({
  getSession: vi.fn()
}))
vi.mock('../../src/database/repositories/embeddingRepo', () => ({
  upsertEmbeddings: vi.fn(),
  getMessagesWithoutEmbeddings: vi.fn(),
  hasSessionEmbeddings: vi.fn(),
  countSessionEmbeddings: vi.fn()
}))
vi.mock('../../src/search/semantic', () => ({
  invalidateEmbeddingCache: vi.fn()
}))
vi.mock('../../src/ai/apiClient', () => ({
  embedBatch: vi.fn()
}))

import { getSession } from '../../src/database/repositories/sessionRepo'
import {
  upsertEmbeddings,
  getMessagesWithoutEmbeddings,
  hasSessionEmbeddings,
  countSessionEmbeddings
} from '../../src/database/repositories/embeddingRepo'
import { invalidateEmbeddingCache } from '../../src/search/semantic'
import { embedBatch } from '../../src/ai/apiClient'
import { embedSession, isSessionEmbedded, getEmbedStatus } from '../../src/ai/embedder'

function makeSession(overrides: any = {}) {
  return {
    id: 's1',
    title: '会话',
    messages: [
      { id: 'm1', sessionId: 's1', role: 'user', content: '你好啊', order: 0, createdAt: 'x' },
      { id: 'm2', sessionId: 's1', role: 'assistant', content: '你好', order: 1, createdAt: 'x' }
    ],
    ...overrides
  }
}

const config = {
  provider: 'openai',
  apiStyle: 'openai',
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  chatModel: 'gpt-4o',
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 3
} as any

describe('embedder.embedSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('会话不存在时抛出', async () => {
    vi.mocked(getSession).mockReturnValue(null as any)
    await expect(embedSession('s1', config)).rejects.toThrow('会话不存在')
  })

  it('会话无消息时抛出', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession({ messages: [] }))
    await expect(embedSession('s1', config)).rejects.toThrow('无消息')
  })

  it('无待嵌入消息时跳过全部', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(getMessagesWithoutEmbeddings).mockReturnValue([])
    const result = await embedSession('s1', config)
    expect(result).toEqual({ total: 2, embedded: 0, skipped: 2 })
  })

  it('批量嵌入成功并写入向量', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(getMessagesWithoutEmbeddings).mockReturnValue([
      { id: 'm1', sessionId: 's1', content: '你好啊' },
      { id: 'm2', sessionId: 's1', content: '你好' }
    ])
    vi.mocked(embedBatch).mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ])
    const result = await embedSession('s1', config)
    expect(result.embedded).toBe(2)
    expect(upsertEmbeddings).toHaveBeenCalledTimes(1)
    expect(invalidateEmbeddingCache).toHaveBeenCalled()
  })

  it('向量数量不匹配时抛出', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(getMessagesWithoutEmbeddings).mockReturnValue([
      { id: 'm1', sessionId: 's1', content: '你好啊' }
    ])
    vi.mocked(embedBatch).mockResolvedValue([[0.1, 0.2, 0.3], [0.9, 0.9, 0.9]])
    await expect(embedSession('s1', config)).rejects.toThrow('数量不匹配')
  })

  it('向量维度不匹配时抛出', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(getMessagesWithoutEmbeddings).mockReturnValue([
      { id: 'm1', sessionId: 's1', content: '你好啊' }
    ])
    vi.mocked(embedBatch).mockResolvedValue([[0.1, 0.2]])
    await expect(embedSession('s1', config)).rejects.toThrow('维度不匹配')
  })

  it('过滤过短内容（<2 字符）', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(getMessagesWithoutEmbeddings).mockReturnValue([
      { id: 'm1', sessionId: 's1', content: 'a' },
      { id: 'm2', sessionId: 's1', content: '有效内容' }
    ])
    vi.mocked(embedBatch).mockResolvedValue([[0.1, 0.2, 0.3]])
    const result = await embedSession('s1', config)
    expect(result.skipped).toBe(1)
    expect(result.embedded).toBe(1)
  })
})

describe('embedder.isSessionEmbedded / getEmbedStatus', () => {
  it('isSessionEmbedded 透传 hasSessionEmbeddings', () => {
    vi.mocked(hasSessionEmbeddings).mockReturnValue(true)
    expect(isSessionEmbedded('s1')).toBe(true)
  })

  it('getEmbedStatus 计算完成度', () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(countSessionEmbeddings).mockReturnValue(2)
    expect(getEmbedStatus('s1')).toEqual({ total: 2, embedded: 2, complete: true })
  })

  it('getEmbedStatus 无会话时 total 为 0', () => {
    vi.mocked(getSession).mockReturnValue(null as any)
    vi.mocked(countSessionEmbeddings).mockReturnValue(0)
    expect(getEmbedStatus('s1')).toEqual({ total: 0, embedded: 0, complete: false })
  })
})