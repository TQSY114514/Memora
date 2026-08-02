import { describe, it, expect } from 'vitest'
import {
  listTemplates,
  getTemplate,
  exportTemplate,
  importTemplate,
  filterByCategory,
  searchTemplates
} from '../src/templates/templateMarket'

describe('templateMarket', () => {
  describe('listTemplates', () => {
    it('returns 3 builtin templates', () => {
      const list = listTemplates()
      expect(list).toHaveLength(3)
    })

    it('developer template has correct fields', () => {
      const list = listTemplates()
      const dev = list.find((t) => t.id === 'builtin_developer')
      expect(dev).toBeDefined()
      expect(dev!.name).toBe('开发者知识包')
      expect(dev!.category).toBe('开发')
      expect(dev!.knowledgeCount).toBe(3)
      expect(dev!.preferenceCount).toBe(2)
    })

    it('researcher template has correct fields', () => {
      const list = listTemplates()
      const res = list.find((t) => t.id === 'builtin_researcher')
      expect(res).toBeDefined()
      expect(res!.name).toBe('研究者知识包')
      expect(res!.category).toBe('学术')
      expect(res!.knowledgeCount).toBe(2)
      expect(res!.preferenceCount).toBe(1)
    })

    it('product manager template has correct fields', () => {
      const list = listTemplates()
      const pm = list.find((t) => t.id === 'builtin_product_manager')
      expect(pm).toBeDefined()
      expect(pm!.name).toBe('产品经理知识包')
      expect(pm!.category).toBe('产品')
      expect(pm!.knowledgeCount).toBe(2)
      expect(pm!.preferenceCount).toBe(1)
    })
  })

  describe('getTemplate', () => {
    it('returns full template for known id', () => {
      const t = getTemplate('builtin_developer')
      expect(t).not.toBeNull()
      expect(t!.id).toBe('builtin_developer')
      expect(t!.name).toBe('开发者知识包')
      expect(t!.author).toBe('Memora')
      expect(t!.version).toBe('1.0.0')
      expect(t!.knowledgeTemplates).toHaveLength(3)
      expect(t!.preferenceTemplates).toHaveLength(2)
    })

    it('returns null for unknown id', () => {
      expect(getTemplate('nonexistent_id')).toBeNull()
    })
  })

  describe('exportTemplate', () => {
    it('returns a valid JSON string parseable by JSON.parse', () => {
      const t = getTemplate('builtin_developer')!
      const json = exportTemplate(t)
      expect(typeof json).toBe('string')
      const parsed = JSON.parse(json)
      expect(parsed.id).toBe('builtin_developer')
      expect(parsed.name).toBe('开发者知识包')
      expect(parsed.knowledgeTemplates).toHaveLength(3)
      expect(parsed.preferenceTemplates).toHaveLength(2)
    })
  })

  describe('importTemplate', () => {
    it('returns success=true with new id prefixed imported_ for valid JSON', () => {
      const t = getTemplate('builtin_developer')!
      const json = exportTemplate(t)
      const result = importTemplate(json)
      expect(result.success).toBe(true)
      expect(result.template).toBeDefined()
      expect(result.template!.id.startsWith('imported_')).toBe(true)
      expect(result.template!.name).toBe('开发者知识包')
    })

    it('returns success=false when name is missing', () => {
      const json = JSON.stringify({ knowledgeTemplates: [] })
      const result = importTemplate(json)
      expect(result.success).toBe(false)
      expect(result.template).toBeUndefined()
    })

    it('returns success=false when knowledgeTemplates is missing', () => {
      const json = JSON.stringify({ name: 'some name' })
      const result = importTemplate(json)
      expect(result.success).toBe(false)
      expect(result.template).toBeUndefined()
    })

    it('returns success=false with error for invalid JSON', () => {
      const result = importTemplate('not a json string')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    })
  })

  describe('filterByCategory', () => {
    it('filters templates by category', () => {
      const list = listTemplates()
      const filtered = filterByCategory(list, '开发')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('builtin_developer')
    })

    it('returns all templates when category is empty', () => {
      const list = listTemplates()
      const filtered = filterByCategory(list, '')
      expect(filtered).toHaveLength(3)
    })
  })

  describe('searchTemplates', () => {
    it('searches by name', () => {
      const list = listTemplates()
      const results = searchTemplates(list, '开发者')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('builtin_developer')
    })

    it('searches by description', () => {
      const list = listTemplates()
      const results = searchTemplates(list, '学术')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((t) => t.id === 'builtin_researcher')).toBe(true)
    })

    it('searches by tags', () => {
      const list = listTemplates()
      const results = searchTemplates(list, '需求')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('builtin_product_manager')
    })

    it('returns all templates when query is empty', () => {
      const list = listTemplates()
      const results = searchTemplates(list, '')
      expect(results).toHaveLength(3)
    })
  })
})
