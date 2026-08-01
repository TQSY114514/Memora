import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// accessControl 依赖 logger（可能间接引入 electron），mock 掉避免环境问题
vi.mock('../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
  WRITE_TOOLS,
  DESTRUCTIVE_TOOLS,
  sanitizeArgs,
  auditToolCall
} from '../src/mcp/accessControl'
import { TOOLS } from '../src/mcp/schemas'

/**
 * MCP 访问控制测试
 *
 * 覆盖报告 #7 "MCP Server 核心文件零测试" + #4 "默认只读 / 写操作 opt-in" 安全语义。
 */
describe('sanitizeArgs', () => {
  it('长字符串（>200）被脱敏为长度占位符', () => {
    const long = 'x'.repeat(500)
    const out = sanitizeArgs({ content: long, title: '短标题' })
    expect(out.content).toBe('<string len=500>')
    expect(out.title).toBe('短标题')
  })

  it('非字符串值原样保留', () => {
    const out = sanitizeArgs({ n: 42, b: true, arr: [1, 2], obj: { a: 1 } })
    expect(out.n).toBe(42)
    expect(out.b).toBe(true)
    expect(out.arr).toEqual([1, 2])
    expect(out.obj).toEqual({ a: 1 })
  })

  it('空对象返回空对象', () => {
    expect(sanitizeArgs({})).toEqual({})
  })

  it('恰好 200 字符的字符串不脱敏（边界）', () => {
    const s = 'x'.repeat(200)
    expect(sanitizeArgs({ s }).s).toBe(s)
  })

  it('201 字符的字符串被脱敏（边界）', () => {
    const s = 'x'.repeat(201)
    expect(sanitizeArgs({ s }).s).toBe('<string len=201>')
  })
})

describe('auditToolCall', () => {
  it('调用不抛错（logger.info 已 mock）', () => {
    expect(() => auditToolCall('delete_session', { id: 'x' }, false, 'destructive not enabled')).not.toThrow()
  })
})

describe('工具分类一致性', () => {
  const allToolNames = new Set(TOOLS.map((t) => t.name))

  it('WRITE_TOOLS 与 DESTRUCTIVE_TOOLS 不相交', () => {
    for (const w of WRITE_TOOLS) {
      expect(DESTRUCTIVE_TOOLS.has(w), `${w} 不应同时出现在 WRITE 和 DESTRUCTIVE 集合`).toBe(false)
    }
  })

  it('WRITE_TOOLS / DESTRUCTIVE_TOOLS 中的工具都在 TOOLS 中存在', () => {
    for (const w of WRITE_TOOLS) {
      expect(allToolNames.has(w), `WRITE_TOOLS 中的 ${w} 不在 TOOLS 列表`).toBe(true)
    }
    for (const d of DESTRUCTIVE_TOOLS) {
      expect(allToolNames.has(d), `DESTRUCTIVE_TOOLS 中的 ${d} 不在 TOOLS 列表`).toBe(true)
    }
  })

  it('破坏性工具恰好 3 个（delete_session / knowledge_entry_delete / memory_forget）', () => {
    expect(DESTRUCTIVE_TOOLS.size).toBe(3)
    expect(DESTRUCTIVE_TOOLS.has('delete_session')).toBe(true)
    expect(DESTRUCTIVE_TOOLS.has('knowledge_entry_delete')).toBe(true)
    expect(DESTRUCTIVE_TOOLS.has('memory_forget')).toBe(true)
  })

  it('写工具集合非空且为合理子集', () => {
    expect(WRITE_TOOLS.size).toBeGreaterThan(0)
    expect(WRITE_TOOLS.size).toBeLessThan(TOOLS.length)
  })
})

// ===== 访问控制 flag 逻辑（需模块重载以模拟不同 env） =====
describe('访问控制 flag（env/argv）', () => {
  const origEnv = { ...process.env }
  const origArgv = [...process.argv]

  beforeEach(() => {
    // 清理相关 env / argv
    delete process.env['MEMORA_READONLY']
    delete process.env['MEMORA_WRITE']
    delete process.env['MEMORA_DESTRUCTIVE']
    process.argv = origArgv.filter((a) => !['--readonly', '--write', '--destructive'].includes(a))
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...origEnv }
    process.argv = [...origArgv]
  })

  async function loadFlags() {
    const mod = await import('../src/mcp/accessControl')
    return {
      isReadOnly: mod.isReadOnly,
      isWriteEnabled: mod.isWriteEnabled,
      isDestructiveEnabled: mod.isDestructiveEnabled
    }
  }

  it('默认（无 env）：只读关闭、写关闭、破坏性关闭 —— 即默认拒绝一切写操作', async () => {
    const f = await loadFlags()
    expect(f.isReadOnly).toBe(false)
    expect(f.isWriteEnabled).toBe(false)
    expect(f.isDestructiveEnabled).toBe(false)
  })

  it('MEMORA_READONLY=true：显式只读，写被关闭', async () => {
    process.env['MEMORA_READONLY'] = 'true'
    const f = await loadFlags()
    expect(f.isReadOnly).toBe(true)
    expect(f.isWriteEnabled).toBe(false)
    expect(f.isDestructiveEnabled).toBe(false)
  })

  it('MEMORA_WRITE=true：开启普通写，但破坏性仍关闭', async () => {
    process.env['MEMORA_WRITE'] = 'true'
    const f = await loadFlags()
    expect(f.isReadOnly).toBe(false)
    expect(f.isWriteEnabled).toBe(true)
    expect(f.isDestructiveEnabled).toBe(false)
  })

  it('MEMORA_WRITE + MEMORA_DESTRUCTIVE：破坏性开启（必须先开 write）', async () => {
    process.env['MEMORA_WRITE'] = 'true'
    process.env['MEMORA_DESTRUCTIVE'] = 'true'
    const f = await loadFlags()
    expect(f.isWriteEnabled).toBe(true)
    expect(f.isDestructiveEnabled).toBe(true)
  })

  it('仅 MEMORA_DESTRUCTIVE=true（未开 write）：破坏性仍关闭（write 是前置条件）', async () => {
    process.env['MEMORA_DESTRUCTIVE'] = 'true'
    const f = await loadFlags()
    expect(f.isWriteEnabled).toBe(false)
    expect(f.isDestructiveEnabled).toBe(false)
  })

  it('MEMORA_READONLY=true 优先级最高：即使同时设 WRITE，写仍关闭', async () => {
    process.env['MEMORA_READONLY'] = 'true'
    process.env['MEMORA_WRITE'] = 'true'
    const f = await loadFlags()
    expect(f.isReadOnly).toBe(true)
    expect(f.isWriteEnabled).toBe(false)
  })

  it('--write argv 等价于 MEMORA_WRITE=true', async () => {
    process.argv = [...origArgv, '--write']
    const f = await loadFlags()
    expect(f.isWriteEnabled).toBe(true)
  })

  it('--destructive argv 需配合 --write 才生效', async () => {
    process.argv = [...origArgv, '--destructive']
    const f = await loadFlags()
    expect(f.isDestructiveEnabled).toBe(false)
    process.argv = [...origArgv, '--write', '--destructive']
    vi.resetModules()
    const f2 = await loadFlags()
    expect(f2.isDestructiveEnabled).toBe(true)
  })
})
