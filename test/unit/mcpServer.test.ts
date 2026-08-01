import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * MCP Server 路由 + 访问控制集成测试（报告 #2 / 任务 2）
 *
 * 验证 callTool：
 * - 路由：工具名正确分发到对应 handler
 * - 访问控制：默认只读拒绝写/破坏性；开启后允许
 * - 审计日志：拒绝/允许均调用 auditToolCall
 * - 未知工具抛错
 *
 * 通过 mock accessControl 的 getter 实现访问控制状态切换。
 */

// 访问控制状态（测试中可变）
const state = {
  write: false,
  destructive: false
}

vi.mock('../../src/mcp/accessControl', () => ({
  isReadOnly: false,
  get isWriteEnabled() { return state.write },
  get isDestructiveEnabled() { return state.destructive },
  WRITE_TOOLS: new Set([
    'add_session', 'add_message', 'memory_write', 'memory_save_preference',
    'update_session', 'create_folder', 'knowledge_entry_update', 'summarize_session'
  ]),
  DESTRUCTIVE_TOOLS: new Set([
    'delete_session', 'knowledge_entry_delete', 'memory_forget'
  ]),
  auditToolCall: vi.fn()
}))

// Handler mock：每个域导出一个 vi.fn，测试中可断言调用参数
const sessionsHandler = vi.fn()
const knowledgeHandler = vi.fn()
const memoryHandler = vi.fn()
const workspaceHandler = vi.fn()

vi.mock('../../src/mcp/tools/sessions', () => ({
  handleSessionsTool: (...args: unknown[]) => sessionsHandler(...args)
}))
vi.mock('../../src/mcp/tools/knowledge', () => ({
  handleKnowledgeTool: (...args: unknown[]) => knowledgeHandler(...args)
}))
vi.mock('../../src/mcp/tools/memory', () => ({
  handleMemoryTool: (...args: unknown[]) => memoryHandler(...args)
}))
vi.mock('../../src/mcp/tools/workspace', () => ({
  handleWorkspaceTool: (...args: unknown[]) => workspaceHandler(...args)
}))

// 顶层依赖：connection / logger / electron app
vi.mock('../../src/database/connection', () => ({ initDatabase: vi.fn(), getDatabase: vi.fn() }))
vi.mock('../../src/main/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getVersion: () => '0.0.0-test' } }))

import { callTool } from '../../src/mcp/server'
import { auditToolCall } from '../../src/mcp/accessControl'

describe('MCP callTool — 路由分发', () => {
  beforeEach(() => {
    sessionsHandler.mockReset()
    knowledgeHandler.mockReset()
    memoryHandler.mockReset()
    workspaceHandler.mockReset()
    vi.mocked(auditToolCall).mockReset()
    // 默认开启写+破坏性，路由测试不受访问控制阻断
    state.write = true
    state.destructive = true
  })

  it('sessions 域工具路由到 handleSessionsTool', async () => {
    sessionsHandler.mockResolvedValue({ ok: true })
    const tools = [
      'search_sessions', 'get_session', 'list_sessions', 'get_session_summary',
      'add_session', 'add_message', 'update_session', 'delete_session',
      'export_session', 'summarize_session'
    ]
    for (const t of tools) {
      await callTool(t, { query: 'x' })
    }
    expect(sessionsHandler).toHaveBeenCalledTimes(tools.length)
    expect(knowledgeHandler).not.toHaveBeenCalled()
    expect(memoryHandler).not.toHaveBeenCalled()
    expect(workspaceHandler).not.toHaveBeenCalled()
  })

  it('knowledge 域工具路由到 handleKnowledgeTool', async () => {
    knowledgeHandler.mockResolvedValue({ ok: true })
    const tools = [
      'knowledge_search', 'decision_search', 'project_context',
      'knowledge_entry_update', 'knowledge_entry_delete'
    ]
    for (const t of tools) {
      await callTool(t, { query: 'x' })
    }
    expect(knowledgeHandler).toHaveBeenCalledTimes(tools.length)
    expect(sessionsHandler).not.toHaveBeenCalled()
  })

  it('memory 域工具路由到 handleMemoryTool', async () => {
    memoryHandler.mockResolvedValue({ ok: true })
    const tools = [
      'memory_recall', 'memory_write', 'memory_save_preference',
      'memory_profile', 'memory_forget', 'preference_search'
    ]
    for (const t of tools) {
      await callTool(t, { query: 'x' })
    }
    expect(memoryHandler).toHaveBeenCalledTimes(tools.length)
  })

  it('workspace 域工具路由到 handleWorkspaceTool', async () => {
    workspaceHandler.mockResolvedValue({ ok: true })
    const tools = ['list_workspaces', 'list_tags', 'create_folder', 'list_folders']
    for (const t of tools) {
      await callTool(t, {})
    }
    expect(workspaceHandler).toHaveBeenCalledTimes(tools.length)
  })

  it('未知工具抛错', async () => {
    await expect(callTool('nonexistent_tool', {})).rejects.toThrow(/未知工具/)
  })

  it('handler 错误向上抛出', async () => {
    sessionsHandler.mockRejectedValue(new Error('db locked'))
    await expect(callTool('search_sessions', {})).rejects.toThrow('db locked')
  })
})

describe('MCP callTool — 访问控制（默认只读）', () => {
  beforeEach(() => {
    sessionsHandler.mockReset()
    knowledgeHandler.mockReset()
    memoryHandler.mockReset()
    workspaceHandler.mockReset()
    vi.mocked(auditToolCall).mockReset()
    state.write = false
    state.destructive = false
  })

  it('只读工具始终允许（list/get/search 类）', async () => {
    sessionsHandler.mockResolvedValue([])
    knowledgeHandler.mockResolvedValue([])
    memoryHandler.mockResolvedValue([])
    workspaceHandler.mockResolvedValue([])

    await expect(callTool('list_sessions', {})).resolves.toEqual([])
    await expect(callTool('get_session', { sessionId: 'x' })).resolves.toEqual([])
    await expect(callTool('search_sessions', { query: 'x' })).resolves.toEqual([])
    await expect(callTool('list_workspaces', {})).resolves.toEqual([])
    await expect(callTool('knowledge_search', { query: 'x' })).resolves.toEqual([])
    await expect(callTool('memory_recall', { query: 'x' })).resolves.toEqual([])

    // 只读工具不应触发 audit
    expect(auditToolCall).not.toHaveBeenCalled()
  })

  it('写工具在只读模式下被拒绝', async () => {
    await expect(callTool('add_session', { title: 'x' })).rejects.toThrow(/READONLY/)
    await expect(callTool('add_message', {})).rejects.toThrow(/READONLY/)
    await expect(callTool('memory_write', {})).rejects.toThrow(/READONLY/)
    await expect(callTool('update_session', {})).rejects.toThrow(/READONLY/)
    await expect(callTool('create_folder', {})).rejects.toThrow(/READONLY/)
    await expect(callTool('knowledge_entry_update', {})).rejects.toThrow(/READONLY/)
    await expect(callTool('summarize_session', {})).rejects.toThrow(/READONLY/)

    // 拒绝时审计日志记录 allowed=false
    expect(auditToolCall).toHaveBeenCalledTimes(7)
    expect(auditToolCall).toHaveBeenCalledWith(
      'add_session', { title: 'x' }, false, 'write not enabled'
    )
    // handler 不应被调用
    expect(sessionsHandler).not.toHaveBeenCalled()
  })

  it('破坏性工具在只读模式下被拒绝（优先级高于写）', async () => {
    await expect(callTool('delete_session', { sessionId: 'x' })).rejects.toThrow(/DESTRUCTIVE/)
    await expect(callTool('knowledge_entry_delete', {})).rejects.toThrow(/DESTRUCTIVE/)
    await expect(callTool('memory_forget', {})).rejects.toThrow(/DESTRUCTIVE/)

    // 破坏性拒绝时审计日志记录
    expect(auditToolCall).toHaveBeenCalledWith(
      'delete_session', { sessionId: 'x' }, false, 'destructive not enabled'
    )
  })
})

describe('MCP callTool — 开启写模式（--write）', () => {
  beforeEach(() => {
    sessionsHandler.mockReset()
    knowledgeHandler.mockReset()
    memoryHandler.mockReset()
    workspaceHandler.mockReset()
    vi.mocked(auditToolCall).mockReset()
    state.write = true
    state.destructive = false
  })

  it('写工具被允许并记录审计日志', async () => {
    sessionsHandler.mockResolvedValue({ id: 'new-session' })
    memoryHandler.mockResolvedValue({ ok: true })
    workspaceHandler.mockResolvedValue({ folderId: 'f1' })
    knowledgeHandler.mockResolvedValue({ ok: true })

    await callTool('add_session', { title: 'new' })
    await callTool('memory_write', { content: 'x' })
    await callTool('create_folder', { name: 'f' })
    await callTool('knowledge_entry_update', { id: 'k1' })

    expect(sessionsHandler).toHaveBeenCalledWith('add_session', { title: 'new' })
    expect(memoryHandler).toHaveBeenCalledWith('memory_write', { content: 'x' })
    expect(workspaceHandler).toHaveBeenCalledWith('create_folder', { name: 'f' })
    expect(knowledgeHandler).toHaveBeenCalledWith('knowledge_entry_update', { id: 'k1' })

    // 允许时审计日志记录 allowed=true
    expect(auditToolCall).toHaveBeenCalledTimes(4)
    expect(auditToolCall).toHaveBeenCalledWith('add_session', { title: 'new' }, true, 'write')
  })

  it('破坏性工具仍被拒绝（destructive 未开启）', async () => {
    await expect(callTool('delete_session', { sessionId: 'x' })).rejects.toThrow(/DESTRUCTIVE/)
    await expect(callTool('memory_forget', {})).rejects.toThrow(/DESTRUCTIVE/)
    expect(auditToolCall).toHaveBeenCalledWith(
      'delete_session', { sessionId: 'x' }, false, 'destructive not enabled'
    )
  })

  it('只读工具仍允许且不记录审计', async () => {
    sessionsHandler.mockResolvedValue([])
    await callTool('list_sessions', {})
    expect(auditToolCall).not.toHaveBeenCalled()
  })
})

describe('MCP callTool — 开启破坏性模式（--destructive）', () => {
  beforeEach(() => {
    sessionsHandler.mockReset()
    knowledgeHandler.mockReset()
    memoryHandler.mockReset()
    vi.mocked(auditToolCall).mockReset()
    state.write = true
    state.destructive = true
  })

  it('破坏性工具被允许并记录审计日志', async () => {
    sessionsHandler.mockResolvedValue({ deleted: true })
    knowledgeHandler.mockResolvedValue({ deleted: true })
    memoryHandler.mockResolvedValue({ deleted: true })

    await callTool('delete_session', { sessionId: 'x' })
    await callTool('knowledge_entry_delete', { id: 'k1' })
    await callTool('memory_forget', { id: 'm1' })

    expect(auditToolCall).toHaveBeenCalledTimes(3)
    expect(auditToolCall).toHaveBeenCalledWith('delete_session', { sessionId: 'x' }, true, 'destructive')
    expect(auditToolCall).toHaveBeenCalledWith('knowledge_entry_delete', { id: 'k1' }, true, 'destructive')
    expect(auditToolCall).toHaveBeenCalledWith('memory_forget', { id: 'm1' }, true, 'destructive')
  })
})

describe('MCP callTool — 审计日志调用', () => {
  beforeEach(() => {
    sessionsHandler.mockReset()
    vi.mocked(auditToolCall).mockReset()
    state.write = true
    state.destructive = false
  })

  it('auditToolCall 收到原始工具名与参数', async () => {
    sessionsHandler.mockResolvedValue({})
    await callTool('add_message', { content: 'hello', sessionId: 's1' })
    // 注：脱敏逻辑在 accessControl.sanitizeArgs 内部，此处 mock 了 auditToolCall，
    // 故收到的为原始参数；脱敏单独在 accessControl 单测中验证
    expect(auditToolCall).toHaveBeenCalledWith(
      'add_message',
      { content: 'hello', sessionId: 's1' },
      true,
      'write'
    )
  })
})
