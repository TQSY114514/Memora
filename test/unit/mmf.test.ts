import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/repositories', () => ({
  createPreference: vi.fn(),
  listPreferences: vi.fn(),
  createEntry: vi.fn(),
  listEntries: vi.fn()
}))

import { parseMMF, importMMF } from '../../src/sharing/mmfImporter'
import { renderMemoryToMMF } from '../../src/sharing/mmfExporter'
import { createPreference, listPreferences, createEntry, listEntries } from '../../src/database/repositories'

describe('mmfExporter.renderMemoryToMMF', () => {
  it('produces a valid MMF JSON string with correct header and stats', () => {
    const json = renderMemoryToMMF({
      workspace: { id: 'ws-1', name: '测试' },
      preferences: [{ id: 'p1', subject: '语言', value: 'TS', confidence: 0.9 } as any],
      constitution: [{ id: 'c1', subject: '规则', value: '简洁', confidence: 0.8 } as any],
      knowledge: [{ id: 'k1', title: '知识', content: '内容' } as any],
      auditLogs: [{ id: 'a1', action: 'create' } as any]
    })

    const parsed = JSON.parse(json)
    expect(parsed.format).toBe('memora-memory-format')
    expect(parsed.version).toBe(1)
    expect(parsed.workspace.id).toBe('ws-1')
    expect(parsed.preferences).toHaveLength(1)
    expect(parsed.constitution).toHaveLength(1)
    expect(parsed.knowledge).toHaveLength(1)
    expect(parsed.auditLogs).toHaveLength(1)
    expect(parsed.stats.totalPreferences).toBe(2)
    expect(parsed.stats.totalKnowledge).toBe(1)
    expect(parsed.stats.totalAuditLogs).toBe(1)
  })
})

describe('mmfImporter.parseMMF', () => {
  it('parses a valid MMF object', () => {
    const file = parseMMF(
      JSON.stringify({
        format: 'memora-memory-format',
        version: 1,
        workspace: { id: 'a', name: 'b' },
        preferences: [],
        constitution: [],
        knowledge: [],
        auditLogs: []
      })
    )
    expect(file.format).toBe('memora-memory-format')
    expect(file.version).toBe(1)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseMMF('not json')).toThrow(/解析失败/)
  })

  it('throws when root is not an object', () => {
    expect(() => parseMMF('"string"')).toThrow(/根节点必须是对象/)
  })

  it('throws on wrong format field', () => {
    expect(() => parseMMF(JSON.stringify({ format: 'other', version: 1 }))).toThrow(/format/)
  })

  it('throws on unsupported version', () => {
    expect(() =>
      parseMMF(JSON.stringify({ format: 'memora-memory-format', version: 2 }))
    ).toThrow(/版本/)
  })

  it('throws when preferences is not an array', () => {
    expect(() =>
      parseMMF(JSON.stringify({ format: 'memora-memory-format', version: 1, preferences: 'x' }))
    ).toThrow(/preferences/)
  })
})

describe('mmfImporter.importMMF', () => {
  beforeEach(() => {
    vi.mocked(listPreferences).mockReturnValue([])
    vi.mocked(listEntries).mockReturnValue([])
    vi.mocked(createPreference).mockReturnValue({ id: 'new' } as any)
    vi.mocked(createEntry).mockReturnValue({ id: 'new' } as any)
  })

  it('imports preferences, constitution and knowledge', () => {
    const result = importMMF(
      {
        format: 'memora-memory-format',
        version: 1,
        workspace: { id: 'a', name: 'b' },
        preferences: [{ subject: '语言', value: 'TS', confidence: 0.9 } as any],
        constitution: [{ subject: '规则', value: '简洁', confidence: 0.8 } as any],
        knowledge: [{ title: '知识', content: '内容' } as any],
        auditLogs: []
      },
      'ws-target'
    )
    expect(result.imported.preferences).toBe(1)
    expect(result.imported.constitution).toBe(1)
    expect(result.imported.knowledge).toBe(1)
    expect(result.skipped).toBe(0)
    expect(createPreference).toHaveBeenCalledTimes(2)
    expect(createEntry).toHaveBeenCalledTimes(1)
  })

  it('skips duplicates based on subject+value (case-insensitive)', () => {
    vi.mocked(listPreferences).mockReturnValue([
      { subject: '语言', value: 'TS' } as any
    ])
    const result = importMMF(
      {
        format: 'memora-memory-format',
        version: 1,
        workspace: { id: 'a', name: 'b' },
        preferences: [{ subject: '语言', value: 'ts' } as any],
        constitution: [],
        knowledge: [],
        auditLogs: []
      },
      'ws-target'
    )
    expect(result.skipped).toBe(1)
    expect(result.imported.preferences).toBe(0)
  })

  it('collects errors when createPreference throws', () => {
    vi.mocked(createPreference).mockImplementation(() => {
      throw new Error('db error')
    })
    const result = importMMF(
      {
        format: 'memora-memory-format',
        version: 1,
        workspace: { id: 'a', name: 'b' },
        preferences: [{ subject: '语言', value: 'TS' } as any],
        constitution: [],
        knowledge: [],
        auditLogs: []
      },
      'ws-target'
    )
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('导入失败')
  })
})