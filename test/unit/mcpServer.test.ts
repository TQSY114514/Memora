import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * MCP Server 路由 + 访问控制 + 参数校验集成测试
 *
 * 验证 callTool：
 * - 参数校验：Zod schema 校验在路由前执行，拒绝畸形/恶意数据
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

/** 每个工具的合法入参（用于路由/访问控制测试，确保通过 Zod 校验） */
const validArgs: Record<string, Record<string, unknown>> = {
  search_sessions: { query: 'test' },
  get_session: { sessionId: 's1' },
  list_sessions: {},
  get_session_summary: { sessionId: 's1' },
  add_session: { title: 'test', provider: 'Test' },
  add_message: { sessionId: 's1', role: 'user', content: 'hello' },
  update_session: { sessionId: 's1' },
  delete_session: { sessionId: 's1' },
  export_session: { sessionId: 's1' },
  summarize_session: { sessionId: 's1' },
  knowledge_search: { query: 'test' },
  decision_search: { query: 'test' },
  project_context: { workspaceId: 'w1' },
  knowledge_entry_update: { entryId: 'k1' },
  knowledge_entry_delete: { entryId: 'k1' },
  memory_recall: { query: 'test' },
  memory_write: { title: 'test', content: 'test' },
  memory_save_preference: { workspaceId: 'w1', subject: 's', value: 'v' },
  memory_profile: { workspaceId: 'w1' },
  memory_forget: { preferenceId: 'p1' },
  preference_search: { query: 'test' },
  list_workspaces: {},
  list_tags: {},
  create_folder: { workspaceId: 'w1', name: 'folder' },
  list_folders: {}
}

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
      await callTool(t, validArgs[t])
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
      await callTool(t, validArgs[t])
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
      await callTool(t, validArgs[t])
    }
    expect(memoryHandler).toHaveBeenCalledTimes(tools.length)
  })

  it('workspace 域工具路由到 handleWorkspaceTool', async () => {
    workspaceHandler.mockResolvedValue({ ok: true })
    const tools = ['list_workspaces', 'list_tags', 'create_folder', 'list_folders']
    for (const t of tools) {
      await callTool(t, validArgs[t])
    }
    expect(workspaceHandler).toHaveBeenCalledTimes(tools.length)
  })

  it('未知工具抛错', async () => {
    await expect(callTool('nonexistent_tool', {})).rejects.toThrow(/未知工具/)
  })

  it('handler 错误向上抛出', async () => {
    sessionsHandler.mockRejectedValue(new Error('db locked'))
    await expect(callTool('search_sessions', { query: 'x' })).rejects.toThrow('db locked')
  })
})

describe('MCP callTool — 参数校验（Zod Schema）', () => {
  beforeEach(() => {
    sessionsHandler.mockReset()
    knowledgeHandler.mockReset()
    memoryHandler.mockReset()
    workspaceHandler.mockReset()
    vi.mocked(auditToolCall).mockReset()
    state.write = true
    state.destructive = true
  })

  it('必填字段缺失时拒绝', async () => {
    await expect(callTool('search_sessions', {})).rejects.toThrow(/参数校验失败/)
    await expect(callTool('get_session', {})).rejects.toThrow(/参数校验失败/)
    await expect(callTool('add_session', { title: 'x' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('add_message', { sessionId: 's1' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('memory_write', { title: 'x' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('memory_save_preference', { workspaceId: 'w1' })).rejects.toThrow(/参数校验失败/)
  })

  it('非法 ID 格式被拒绝', async () => {
    await expect(callTool('get_session', { sessionId: 'a b c' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('get_session', { sessionId: 'a;b' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('delete_session', { sessionId: '../../../etc' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('memory_forget', { preferenceId: 'x'.repeat(65) })).rejects.toThrow(/参数校验失败/)
  })

  it('非法枚举值被拒绝', async () => {
    await expect(callTool('add_message', { sessionId: 's1', role: 'invalid', content: 'x' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('knowledge_search', { query: 'x', type: 'invalid' })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('knowledge_entry_update', { entryId: 'k1', status: 'invalid' })).rejects.toThrow(/参数校验失败/)
  })

  it('数值超限被拒绝', async () => {
    await expect(callTool('search_sessions', { query: 'x', limit: 0 })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('search_sessions', { query: 'x', limit: 101 })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('memory_recall', { query: 'x', threshold: 1.5 })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('memory_recall', { query: 'x', threshold: -0.1 })).rejects.toThrow(/参数校验失败/)
    await expect(callTool('memory_save_preference', { workspaceId: 'w1', subject: 's', value: 'v', confidence: 2 })).rejects.toThrow(/参数校验失败/)
  })

  it('校验通过后 handler 收到带默认值的参数', async () => {
    sessionsHandler.mockResolvedValue([])
    await callTool('search_sessions', { query: 'x' })
    // limit 有默认值 10
    expect(sessionsHandler).toHaveBeenCalledWith('search_sessions', { query: 'x', limit: 10 })
  })

  it('add_session 的 messages 数组结构被校验', async () => {
    sessionsHandler.mockResolvedValue({ id: 'new' })
    // 合法 messages
    await callTool('add_session', {
      title: 'test', provider: 'Test',
      messages: [{ role: 'user', content: 'hello' }]
    })
    expect(sessionsHandler).toHaveBeenCalledTimes(1)

    // 非法 role
    await expect(callTool('add_session', {
      title: 'test', provider: 'Test',
      messages: [{ role: 'invalid', content: 'hello' }]
    })).rejects.toThrow(/参数校验失败/)
  })

  it('校验失败时不触发审计日志（在访问控制之前）', async () => {
    state.write = false
    await expect(callTool('add_session', {})).rejects.toThrow(/参数校验失败/)
    // 校验失败不应到达访问控制层
    expect(auditToolCall).not.toHaveBeenCalled()
    expect(sessionsHandler).not.toHaveBeenCalled()
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
    await expect(callTool('get_session', { sessionId: 's1' })).resolves.toEqual([])
    await expect(callTool('search_sessions', { query: 'x' })).resolves.toEqual([])
    await expect(callTool('list_workspaces', {})).resolves.toEqual([])
    await expect(callTool('knowledge_search', { query: 'x' })).resolves.toEqual([])
    await expect(callTool('memory_recall', { query: 'x' })).resolves.toEqual([])

    // 只读工具不应触发 audit
    expect(auditToolCall).not.toHaveBeenCalled()
  })

  it('写工具在只读模式下被拒绝', async () => {
    await expect(callTool('add_session', validArgs.add_session)).rejects.toThrow(/READONLY/)
    await expect(callTool('add_message', validArgs.add_message)).rejects.toThrow(/READONLY/)
    await expect(callTool('memory_write', validArgs.memory_write)).rejects.toThrow(/READONLY/)
    await expect(callTool('update_session', validArgs.update_session)).rejects.toThrow(/READONLY/)
    await expect(callTool('create_folder', validArgs.create_folder)).rejects.toThrow(/READONLY/)
    await expect(callTool('knowledge_entry_update', validArgs.knowledge_entry_update)).rejects.toThrow(/READONLY/)
    await expect(callTool('summarize_session', validArgs.summarize_session)).rejects.toThrow(/READONLY/)

    // 拒绝时审计日志记录 allowed=false
    expect(auditToolCall).toHaveBeenCalledTimes(7)
    // handler 不应被调用
    expect(sessionsHandler).not.toHaveBeenCalled()
  })

  it('破坏性工具在只读模式下被拒绝（优先级高于写）', async () => {
    await expect(callTool('delete_session', validArgs.delete_session)).rejects.toThrow(/DESTRUCTIVE/)
    await expect(callTool('knowledge_entry_delete', validArgs.knowledge_entry_delete)).rejects.toThrow(/DESTRUCTIVE/)
    await expect(callTool('memory_forget', validArgs.memory_forget)).rejects.toThrow(/DESTRUCTIVE/)

    // 破坏性拒绝时审计日志记录
    expect(auditToolCall).toHaveBeenCalledWith(
      'delete_session', { sessionId: 's1' }, false, 'destructive not enabled'
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

    await callTool('add_session', validArgs.add_session)
    await callTool('memory_write', validArgs.memory_write)
    await callTool('create_folder', validArgs.create_folder)
    await callTool('knowledge_entry_update', validArgs.knowledge_entry_update)

    // 允许时审计日志记录 allowed=true
    expect(auditToolCall).toHaveBeenCalledTimes(4)
    expect(auditToolCall).toHaveBeenCalledWith(
      'add_session', { title: 'test', provider: 'Test' }, true, 'write'
    )
  })

  it('破坏性工具仍被拒绝（destructive 未开启）', async () => {
    await expect(callTool('delete_session', validArgs.delete_session)).rejects.toThrow(/DESTRUCTIVE/)
    await expect(callTool('memory_forget', validArgs.memory_forget)).rejects.toThrow(/DESTRUCTIVE/)
    expect(auditToolCall).toHaveBeenCalledWith(
      'delete_session', { sessionId: 's1' }, false, 'destructive not enabled'
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

    await callTool('delete_session', validArgs.delete_session)
    await callTool('knowledge_entry_delete', validArgs.knowledge_entry_delete)
    await callTool('memory_forget', validArgs.memory_forget)

    expect(auditToolCall).toHaveBeenCalledTimes(3)
    expect(auditToolCall).toHaveBeenCalledWith('delete_session', { sessionId: 's1' }, true, 'destructive')
    expect(auditToolCall).toHaveBeenCalledWith('knowledge_entry_delete', { entryId: 'k1' }, true, 'destructive')
    expect(auditToolCall).toHaveBeenCalledWith('memory_forget', { preferenceId: 'p1' }, true, 'destructive')
  })
})

describe('MCP callTool — 审计日志调用', () => {
  beforeEach(() => {
    sessionsHandler.mockReset()
    vi.mocked(auditToolCall).mockReset()
    state.write = true
    state.destructive = false
  })

  it('auditToolCall 收到校验后的工具名与参数', async () => {
    sessionsHandler.mockResolvedValue({})
    await callTool('add_message', { content: 'hello', sessionId: 's1', role: 'user' })
    // 注：脱敏逻辑在 accessControl.sanitizeArgs 内部，此处 mock 了 auditToolCall，
    // 故收到的为校验后参数；脱敏单独在 accessControl 单测中验证
    expect(auditToolCall).toHaveBeenCalledWith(
      'add_message',
      { content: 'hello', sessionId: 's1', role: 'user' },
      true,
      'write'
    )
  })
})
