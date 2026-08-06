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
vi.mock('../../src/database/repositories/memoryBlocksRepo', () => ({
  listBlocks: vi.fn(),
  getBlock: vi.fn(),
  saveBlock: vi.fn(),
  deleteBlock: vi.fn(),
  listBlockHistory: vi.fn(),
  rollbackBlock: vi.fn()
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
import { listBlocks, getBlock, saveBlock, deleteBlock, listBlockHistory, rollbackBlock } from '../../src/database/repositories/memoryBlocksRepo'

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

  it('memory_block_list returns mapped blocks', async () => {
    vi.mocked(listBlocks).mockReturnValue([
      { id: 'b1', workspaceId: 'ws-1', label: 'human', value: '内容', readOnly: false, createdAt: 'x', updatedAt: 'x' } as any
    ])
    const result = await handleMemoryTool('memory_block_list', { workspaceId: 'ws-1' })
    expect(listBlocks).toHaveBeenCalledWith('ws-1')
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('human')
  })

  it('memory_block_get requires blockId and returns block', async () => {
    await expect(handleMemoryTool('memory_block_get', {})).rejects.toThrow('blockId')
    vi.mocked(getBlock).mockReturnValue({ id: 'b1', label: 'human', value: '内容' } as any)
    const result = await handleMemoryTool('memory_block_get', { blockId: 'b1' })
    expect(result.label).toBe('human')
  })

  it('memory_block_get throws when block does not exist', async () => {
    vi.mocked(getBlock).mockReturnValue(null as any)
    await expect(handleMemoryTool('memory_block_get', { blockId: 'b1' })).rejects.toThrow('不存在')
  })

  it('memory_block_save requires workspaceId/label/value', async () => {
    await expect(handleMemoryTool('memory_block_save', { workspaceId: 'ws-1', label: 'human' })).rejects.toThrow('value')
    await expect(handleMemoryTool('memory_block_save', {})).rejects.toThrow('workspaceId')
  })

  it('memory_block_save calls saveBlock with changedBy=mcp', async () => {
    vi.mocked(saveBlock).mockReturnValue({ id: 'b1', label: 'human', value: '内容', readOnly: false } as any)
    const result = await handleMemoryTool('memory_block_save', {
      workspaceId: 'ws-1',
      label: 'human',
      value: '内容',
      readOnly: true,
      reason: '测试'
    })
    expect(saveBlock).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      label: 'human',
      value: '内容',
      readOnly: true,
      changedBy: 'mcp',
      reason: '测试'
    })
    expect(result.label).toBe('human')
  })

  it('memory_block_delete requires blockId and calls deleteBlock with changedBy=mcp', async () => {
    await expect(handleMemoryTool('memory_block_delete', {})).rejects.toThrow('blockId')
    const result = await handleMemoryTool('memory_block_delete', { blockId: 'b1' })
    expect(deleteBlock).toHaveBeenCalledWith('b1', 'mcp')
    expect(result.deleted).toBe(true)
  })

  it('memory_block_history returns history', async () => {
    vi.mocked(listBlockHistory).mockReturnValue([
      { id: 'h1', blockId: 'b1', oldValue: '旧', newValue: '新', changedBy: 'mcp', createdAt: 'x' } as any
    ])
    const result = await handleMemoryTool('memory_block_history', { blockId: 'b1', limit: 5 })
    expect(listBlockHistory).toHaveBeenCalledWith('b1', 5)
    expect(result).toHaveLength(1)
  })

  it('memory_block_rollback requires blockId and historyId', async () => {
    await expect(handleMemoryTool('memory_block_rollback', { blockId: 'b1' })).rejects.toThrow('historyId')
    vi.mocked(rollbackBlock).mockReturnValue({ id: 'b1', label: 'human', value: '旧值' } as any)
    const result = await handleMemoryTool('memory_block_rollback', { blockId: 'b1', historyId: 'h1' })
    expect(rollbackBlock).toHaveBeenCalledWith('b1', 'h1', 'mcp')
    expect(result.note).toContain('h1')
  })

  it('throws on unknown tool', async () => {
    await expect(handleMemoryTool('unknown_tool', {})).rejects.toThrow('未知工具')
  })
})