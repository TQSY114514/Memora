import { describe, it, expect, vi } from 'vitest'

/**
 * accessControl 单测（报告 #2 / 任务 2）
 *
 * 不 mock accessControl 本身，测其真实的 sanitizeArgs 脱敏逻辑。
 * 依赖的 logger 被 mock 以吞掉日志输出。
 */

vi.mock('../../src/main/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}))

import { sanitizeArgs, WRITE_TOOLS, DESTRUCTIVE_TOOLS } from '../../src/mcp/accessControl'

describe('accessControl — sanitizeArgs 脱敏', () => {
  it('超长字符串（>200）替换为长度标记', () => {
    const result = sanitizeArgs({ content: 'x'.repeat(500), title: 'short' })
    expect(result.content).toBe('<string len=500>')
    expect(result.title).toBe('short')
  })

  it('边界长度 200 保留原文', () => {
    const result = sanitizeArgs({ s: 'x'.repeat(200) })
    expect(result.s).toBe('x'.repeat(200))
  })

  it('边界长度 201 替换为标记', () => {
    const result = sanitizeArgs({ s: 'x'.repeat(201) })
    expect(result.s).toBe('<string len=201>')
  })

  it('非字符串值原样保留', () => {
    const result = sanitizeArgs({ n: 123, b: true, arr: [1, 2], obj: { a: 1 } })
    expect(result.n).toBe(123)
    expect(result.b).toBe(true)
    expect(result.arr).toEqual([1, 2])
    expect(result.obj).toEqual({ a: 1 })
  })

  it('空对象返回空对象', () => {
    expect(sanitizeArgs({})).toEqual({})
  })
})

describe('accessControl — 工具集合', () => {
  it('WRITE_TOOLS 包含所有写工具', () => {
    expect(WRITE_TOOLS.has('add_session')).toBe(true)
    expect(WRITE_TOOLS.has('add_message')).toBe(true)
    expect(WRITE_TOOLS.has('memory_write')).toBe(true)
    expect(WRITE_TOOLS.has('update_session')).toBe(true)
    expect(WRITE_TOOLS.has('create_folder')).toBe(true)
    expect(WRITE_TOOLS.has('knowledge_entry_update')).toBe(true)
    expect(WRITE_TOOLS.has('summarize_session')).toBe(true)
  })

  it('DESTRUCTIVE_TOOLS 包含所有破坏性工具', () => {
    expect(DESTRUCTIVE_TOOLS.has('delete_session')).toBe(true)
    expect(DESTRUCTIVE_TOOLS.has('knowledge_entry_delete')).toBe(true)
    expect(DESTRUCTIVE_TOOLS.has('memory_forget')).toBe(true)
  })

  it('只读工具不在写/破坏性集合中', () => {
    const readOnly = ['search_sessions', 'get_session', 'list_sessions', 'list_workspaces', 'knowledge_search']
    for (const t of readOnly) {
      expect(WRITE_TOOLS.has(t)).toBe(false)
      expect(DESTRUCTIVE_TOOLS.has(t)).toBe(false)
    }
  })

  it('写工具不在破坏性集合中（集合互斥）', () => {
    for (const t of WRITE_TOOLS) {
      expect(DESTRUCTIVE_TOOLS.has(t)).toBe(false)
    }
  })
})
