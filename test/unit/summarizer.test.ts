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
vi.mock('../../src/database/repositories/sessionRepo', () => ({
  getSession: vi.fn()
}))
vi.mock('../../src/database/repositories/summaryRepo', () => ({
  upsertSummary: vi.fn(),
  getSummary: vi.fn()
}))
vi.mock('../../src/database/repositories/distillationRepo', () => ({
  getDistillationTemplate: vi.fn()
}))
vi.mock('../../src/database/repositories/preferencesRepo', () => ({
  createPreference: vi.fn()
}))
vi.mock('../../src/ai/apiClient', () => ({
  callChat: vi.fn()
}))

import { getSession } from '../../src/database/repositories/sessionRepo'
import { getSummary } from '../../src/database/repositories/summaryRepo'
import { generateKnowledgeMd, getSessionSummary } from '../../src/ai/summarizer'

function makeSession(overrides: any = {}) {
  return {
    id: 's1',
    title: '技术讨论',
    provider: 'ChatGPT',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  }
}

describe('summarizer.generateKnowledgeMd', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('无总结时提示尚未生成', () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(getSummary).mockReturnValue(null)
    const md = generateKnowledgeMd('s1')
    expect(md).toContain('# 技术讨论')
    expect(md).toContain('尚未生成 AI 总结')
  })

  it('会话不存在时抛出', () => {
    vi.mocked(getSession).mockReturnValue(null as any)
    expect(() => generateKnowledgeMd('s1')).toThrow('会话不存在')
  })

  it('渲染摘要、关键决定、知识要点、待办', () => {
    vi.mocked(getSession).mockReturnValue(makeSession())
    vi.mocked(getSummary).mockReturnValue({
      summary: '这是摘要',
      keyPoints: ['决定A', '决定B'],
      todos: ['待办A'],
      knowledge: ['知识A'],
      suggestedTags: [],
      model: 'gpt-4o'
    } as any)
    const md = generateKnowledgeMd('s1')
    expect(md).toContain('## 摘要')
    expect(md).toContain('这是摘要')
    expect(md).toContain('## 关键决定')
    expect(md).toContain('- 决定A')
    expect(md).toContain('## 知识要点')
    expect(md).toContain('- 知识A')
    expect(md).toContain('## 待办事项')
    expect(md).toContain('- [ ] 待办A')
  })
})

describe('summarizer.getSessionSummary', () => {
  it('透传 getSummary 结果', () => {
    vi.mocked(getSummary).mockReturnValue({ summary: 'x' } as any)
    expect(getSessionSummary('s1')).toEqual({ summary: 'x' })
  })

  it('无总结返回 null', () => {
    vi.mocked(getSummary).mockReturnValue(null)
    expect(getSessionSummary('s1')).toBeNull()
  })
})