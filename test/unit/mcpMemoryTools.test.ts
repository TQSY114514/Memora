import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/repositories/knowledgeRepo', () => ({
  createEntry: vi.fn()
}))
vi.mock('../../src/database/repositories/sessionRepo', () => ({
  createSession: vi.fn()
}))
vi.mock('../../src/database/repositories/preferencesRepo', () => ({
  getUserProfile: vi.fn(),
  createPreference: vi.fn(),
  archivePreference: vi.fn(),
  searchPreferences: vi.fn(),
  getConstitution: vi.fn()
}))
vi.mock('../../src/database/repositories/auditRepo', () => ({
  listAuditLogs: vi.fn()
}))
vi.mock('../../src/search/semantic', () => ({
  semanticSearch: vi.fn()
}))
vi.mock('../../src/mcp/tools/shared', () => ({
  loadAiConfigForTool: vi.fn()
}))

import { handleMemoryTool } from '../../src/mcp/tools/memory'
import { createEntry } from '../../src/database/repositories/knowledgeRepo'
import { createSession } from '../../src/database/repositories/sessionRepo'
import { createPreference, archivePreference, searchPreferences, getConstitution, getUserProfile } from '../../src/database/repositories/preferencesRepo'
import { listAuditLogs } from '../../src/database/repositories/auditRepo'
import { semanticSearch } from '../../src/search/semantic'
import { loadAiConfigForTool } from '../../src/mcp/tools/shared'

describe('mcp.tools.memory.handleMemoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('memory_write requires title and content', async () => {
    await expect(handleMemoryTool('memory_write', { content: 'x' })).rejects.toThrow('title')
    await expect(handleMemoryTool('memory_write', { title: 'x' })).rejects.toThrow('content')
  })

  it('memory_write with workspaceId creates a knowledge entry', async () => {
    vi.mocked(createEntry).mockReturnValue({ id: 'e1' } as any)
    const result = await handleMemoryTool('memory_write', {
      title: '标题',
      content: '内容',
      workspaceId: 'ws-1'
    })
    expect(createEntry).toHaveBeenCalledTimes(1)
    expect(result.entryId).toBe('e1')
    expect(result.written).toBe(true)
  })

  it('memory_write with folderId creates a session', async () => {
    vi.mocked(createSession).mockReturnValue({ id: 's1' } as any)
    await handleMemoryTool('memory_write', {
      title: '标题',
      content: '内容',
      folderId: 'f-1'
    })
    expect(createSession).toHaveBeenCalledTimes(1)
  })

  it('memory_write without workspaceId or folderId does not persist', async () => {
    const result = await handleMemoryTool('memory_write', {
      title: '标题',
      content: '内容'
    })
    expect(createEntry).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(result.note).toContain('未提供')
  })

  it('memory_recall requires query', async () => {
    await expect(handleMemoryTool('memory_recall', {})).rejects.toThrow('query')
  })

  it('memory_recall calls semanticSearch and maps results', async () => {
    vi.mocked(loadAiConfigForTool).mockReturnValue({ provider: 'openai', chatModel: 'gpt', embeddingModel: 'ada', apiKey: 'k' } as any)
    vi.mocked(semanticSearch).mockResolvedValue([
      { session: { id: 's1', title: '标题', provider: 'openai' }, snippet: '内容', score: 0.9 } as any
    ])
    const result = await handleMemoryTool('memory_recall', { query: '技术栈' })
    expect(semanticSearch).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
    expect(result[0].sessionId).toBe('s1')
  })

  it('memory_save_preference requires subject and value', async () => {
    await expect(handleMemoryTool('memory_save_preference', { workspaceId: 'ws-1' })).rejects.toThrow('subject')
  })

  it('memory_save_preference creates a preference', async () => {
    vi.mocked(createPreference).mockReturnValue({ id: 'p1', subject: '语言', value: 'TS', confidence: 0.9, status: 'active' } as any)
    const result = await handleMemoryTool('memory_save_preference', {
      workspaceId: 'ws-1',
      subject: '语言',
      value: 'TS'
    })
    expect(createPreference).toHaveBeenCalledTimes(1)
    expect(result.preferenceId).toBe('p1')
  })

  it('memory_forget archives a preference', async () => {
    vi.mocked(archivePreference).mockReturnValue({ id: 'p1' } as any)
    const result = await handleMemoryTool('memory_forget', { preferenceId: 'p1' })
    expect(result.status).toBe('archived')
  })

  it('memory_forget throws when preference does not exist', async () => {
    vi.mocked(archivePreference).mockReturnValue(null as any)
    await expect(handleMemoryTool('memory_forget', { preferenceId: 'p1' })).rejects.toThrow('不存在')
  })

  it('preference_search requires query and returns mapped results', async () => {
    vi.mocked(searchPreferences).mockReturnValue([
      { id: 'p1', subject: '语言', value: 'TS', confidence: 0.9, status: 'active', source: 'mcp', createdAt: 'x', lastAccessedAt: null, accessCount: 0 } as any
    ])
    const result = await handleMemoryTool('preference_search', { query: '语言' })
    expect(result).toHaveLength(1)
    expect(result[0].subject).toBe('语言')
  })

  it('memory_get_constitution returns constitution entries', async () => {
    vi.mocked(getConstitution).mockReturnValue([
      { id: 'c1', subject: '规则', value: '简洁', confidence: 0.8, status: 'active', source: 'constitution', createdAt: 'x', updatedAt: 'x' } as any
    ])
    const result = await handleMemoryTool('memory_get_constitution', { workspaceId: 'ws-1' })
    expect(result).toHaveLength(1)
    expect(result[0].subject).toBe('规则')
  })

  it('memory_profile returns user profile', async () => {
    vi.mocked(getUserProfile).mockReturnValue({ name: '用户' } as any)
    const result = await handleMemoryTool('memory_profile', { workspaceId: 'ws-1' })
    expect(result).toEqual({ name: '用户' })
  })

  it('memory_audit_log returns audit logs', async () => {
    vi.mocked(listAuditLogs).mockReturnValue([
      { id: 'a1', entityType: 'preference', entityId: 'p1', action: 'create', beforeValue: null, afterValue: null, workspaceId: 'ws-1', sessionId: null, reason: null, createdAt: 'x' } as any
    ])
    const result = await handleMemoryTool('memory_audit_log', {})
    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('create')
  })

  it('throws on unknown tool', async () => {
    await expect(handleMemoryTool('unknown_tool', {})).rejects.toThrow('未知工具')
  })
})