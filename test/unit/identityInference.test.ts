import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/database/connection', () => ({
  getDatabase: vi.fn()
}))

import { getDatabase } from '../../src/database/connection'
import { inferDecisionPattern } from '../../src/identity/decisionPattern'
import { inferCommunicationStyle } from '../../src/identity/communicationStyle'

/** 构造一个可根据 rows 返回的 mock db */
function makeMockDb(rows: Array<{ subject: string; value: string; confidence: number }>) {
  const stmt = {
    all: vi.fn(() => rows),
    get: vi.fn(() => undefined)
  }
  return {
    prepare: vi.fn(() => stmt),
    _stmt: stmt
  }
}

describe('decisionPattern.inferDecisionPattern', () => {
  it('returns neutral defaults when no preferences exist', () => {
    const mockDb = makeMockDb([])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const pattern = inferDecisionPattern()
    expect(pattern.prefers_open_source).toBe(0.3)
    expect(pattern.cost_sensitive).toBe(0.3)
    expect(pattern.likes_new_tech).toBe(0.3)
    expect(pattern.values_privacy).toBe(0.3)
    expect(pattern.prefers_simplicity).toBe(0.3)
    expect(Array.isArray(pattern.evidence)).toBe(true)
    expect(pattern.evidence).toHaveLength(0)
  })

  it('raises open source score when open source preferences exist', () => {
    const mockDb = makeMockDb([
      { subject: '技术栈', value: '开源 自托管', confidence: 0.9 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const pattern = inferDecisionPattern()
    expect(pattern.prefers_open_source).toBeGreaterThan(0.3)
    expect(pattern.evidence.some((e) => e.includes('开源'))).toBe(true)
  })

  it('raises privacy score when privacy preferences exist', () => {
    const mockDb = makeMockDb([
      { subject: '数据', value: '本地 加密 隐私', confidence: 0.8 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const pattern = inferDecisionPattern()
    expect(pattern.values_privacy).toBeGreaterThan(0.3)
  })

  it('raises likes_new_tech and early_adopter for new tech preferences', () => {
    const mockDb = makeMockDb([
      { subject: '技术栈', value: 'Rust 最新', confidence: 0.9 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const pattern = inferDecisionPattern()
    expect(pattern.likes_new_tech).toBeGreaterThan(0.3)
    expect(pattern.early_adopter).toBeGreaterThan(0)
  })

  it('uses workspace_id filter when workspaceId is provided', () => {
    const mockDb = makeMockDb([])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    inferDecisionPattern('ws-1')
    const sqlCalls = mockDb.prepare.mock.calls.map((c) => String(c[0]))
    const sql = sqlCalls.find((s) => s.includes('FROM preferences'))
    expect(sql).toBeDefined()
    expect(sql).toContain('workspace_id')
    expect(sql).toContain('status = \'active\'')
  })
})

describe('communicationStyle.inferCommunicationStyle', () => {
  it('returns neutral style when no preferences exist', () => {
    const mockDb = makeMockDb([])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const style = inferCommunicationStyle()
    expect(style.prefers.short_answer).toBe(false)
    expect(style.prefers.code_first).toBe(false)
    expect(style.prefers.markdown).toBe(false)
    expect(style.formality).toBe('neutral')
    expect(style.detail_level).toBe('balanced')
    expect(style.evidence).toHaveLength(0)
  })

  it('detects short answer preference', () => {
    const mockDb = makeMockDb([
      { subject: '回答', value: '简洁 简短', confidence: 0.9 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const style = inferCommunicationStyle()
    expect(style.prefers.short_answer).toBe(true)
    expect(style.detail_level).toBe('brief')
  })

  it('detects code first preference', () => {
    const mockDb = makeMockDb([
      { subject: '回答', value: '优先给代码示例', confidence: 0.9 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const style = inferCommunicationStyle()
    expect(style.prefers.code_first).toBe(true)
  })

  it('detects formal communication style', () => {
    const mockDb = makeMockDb([
      { subject: '沟通', value: '正式 专业 商务', confidence: 0.9 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const style = inferCommunicationStyle()
    expect(style.formality).toBe('formal')
  })

  it('detects casual communication style', () => {
    const mockDb = makeMockDb([
      { subject: '沟通', value: '随意 轻松 友好', confidence: 0.9 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const style = inferCommunicationStyle()
    expect(style.formality).toBe('casual')
  })

  it('sets detailed level when descriptions requested and no short answer', () => {
    const mockDb = makeMockDb([
      { subject: '回答', value: '详细 深入 完整', confidence: 0.9 }
    ])
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const style = inferCommunicationStyle()
    expect(style.detail_level).toBe('detailed')
  })
})