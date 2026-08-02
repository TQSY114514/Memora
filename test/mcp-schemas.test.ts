import { describe, it, expect } from 'vitest'
import { TOOLS } from '../src/mcp/schemas'

/**
 * MCP 工具 schema 校验
 *
 * 直接覆盖报告 #7 指出的 "MCP Server 核心文件零测试" 缺口。
 * 这些测试纯数据校验，不依赖 DB / electron，可在 vitest node 环境运行。
 */
describe('MCP TOOLS schema', () => {
  it('暴露恰好 30 个工具', () => {
    expect(TOOLS).toHaveLength(30)
  })

  it('工具名唯一', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每个工具有非空 name / description / 合法 inputSchema', () => {
    for (const t of TOOLS) {
      expect(t.name, `工具 name 应非空`).toBeTruthy()
      expect(typeof t.name).toBe('string')
      expect(t.description, `${t.name} description 应非空`).toBeTruthy()
      expect(t.description.length).toBeGreaterThan(5)
      expect(t.inputSchema.type).toBe('object')
      expect(t.inputSchema.properties).toBeDefined()
      expect(typeof t.inputSchema.properties).toBe('object')
    }
  })

  it('required 字段（若存在）必须是 properties 中已声明的字段', () => {
    for (const t of TOOLS) {
      const required = t.inputSchema.required
      if (!required) continue
      const propKeys = Object.keys(t.inputSchema.properties)
      for (const r of required) {
        expect(propKeys, `${t.name} 的 required 字段 "${r}" 未在 properties 声明`).toContain(r)
      }
    }
  })

  it('每个 property 有 type 与 description', () => {
    for (const t of TOOLS) {
      for (const [key, prop] of Object.entries(t.inputSchema.properties)) {
        expect(prop.type, `${t.name}.${key} 缺少 type`).toBeTruthy()
        expect(prop.description, `${t.name}.${key} 缺少 description`).toBeTruthy()
      }
    }
  })

  it('关键工具齐备（覆盖各域）', () => {
    const names = new Set(TOOLS.map((t) => t.name))
    // 会话域
    expect(names.has('search_sessions')).toBe(true)
    expect(names.has('get_session')).toBe(true)
    expect(names.has('add_session')).toBe(true)
    expect(names.has('delete_session')).toBe(true)
    // 知识域
    expect(names.has('knowledge_search')).toBe(true)
    expect(names.has('knowledge_entry_update')).toBe(true)
    expect(names.has('knowledge_entry_delete')).toBe(true)
    // 偏好/记忆域
    expect(names.has('memory_recall')).toBe(true)
    expect(names.has('memory_write')).toBe(true)
    expect(names.has('memory_forget')).toBe(true)
    expect(names.has('memory_profile')).toBe(true)
    expect(names.has('memory_get_constitution')).toBe(true)
    expect(names.has('memory_audit_log')).toBe(true)
    // 工作区/文件夹域
    expect(names.has('list_workspaces')).toBe(true)
    expect(names.has('list_folders')).toBe(true)
    expect(names.has('create_folder')).toBe(true)
  })
})
