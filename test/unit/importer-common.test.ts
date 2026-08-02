import { describe, it, expect } from 'vitest'
import {
  normalizeRole,
  toIsoTimestamp,
  fallbackTitle,
  extractTextParts,
  safeParseJson,
  UNTITLED_TITLE
} from '@importer/common'
import type { ParsedMessage } from '@importer/types'

describe('importer common helpers', () => {
  describe('safeParseJson', () => {
    it('解析合法 JSON', () => {
      expect(safeParseJson('{"a":1}')).toEqual({ a: 1 })
    })

    it('非法 JSON 返回 null', () => {
      expect(safeParseJson('not json')).toBeNull()
    })
  })

  describe('normalizeRole', () => {
    it('兼容各平台角色', () => {
      expect(normalizeRole('human')).toBe('user')
      expect(normalizeRole('你')).toBe('user')
      expect(normalizeRole('我')).toBe('user')
      expect(normalizeRole('model')).toBe('assistant')
      expect(normalizeRole('AI')).toBe('assistant')
      expect(normalizeRole('bot')).toBe('assistant')
      expect(normalizeRole('system')).toBe('system')
      expect(normalizeRole('tool')).toBe('tool')
      expect(normalizeRole('function')).toBe('tool')
    })

    it('未知或空角色回退 assistant', () => {
      expect(normalizeRole('unknown')).toBe('assistant')
      expect(normalizeRole()).toBe('assistant')
      expect(normalizeRole('')).toBe('assistant')
    })
  })

  describe('toIsoTimestamp', () => {
    it('Unix 秒转 ISO', () => {
      expect(toIsoTimestamp(1704067200)).toBe('2024-01-01T00:00:00.000Z')
    })

    it('毫秒时间戳直接使用', () => {
      expect(toIsoTimestamp(1704067200000)).toBe('2024-01-01T00:00:00.000Z')
    })

    it('数字字符串按时间戳处理', () => {
      expect(toIsoTimestamp('1704067200')).toBe('2024-01-01T00:00:00.000Z')
    })

    it('ISO 字符串原样归一化', () => {
      expect(toIsoTimestamp('2024-01-01T00:00:00.000Z')).toBe('2024-01-01T00:00:00.000Z')
    })

    it('缺失或无效返回 undefined', () => {
      expect(toIsoTimestamp(undefined)).toBeUndefined()
      expect(toIsoTimestamp(null)).toBeUndefined()
      expect(toIsoTimestamp('')).toBeUndefined()
      expect(toIsoTimestamp('invalid')).toBeUndefined()
      expect(toIsoTimestamp({})).toBeUndefined()
    })
  })

  describe('fallbackTitle', () => {
    const mk = (role: ParsedMessage['role'], content: string): ParsedMessage => ({
      role,
      content,
      createdAt: '2024-01-01T00:00:00.000Z'
    })

    it('取首条 user 消息并压缩空白', () => {
      expect(fallbackTitle([mk('user', '  你好  世界  ')])).toBe('你好 世界')
    })

    it('超过 50 字符截断并加省略号', () => {
      const title = fallbackTitle([mk('user', '字'.repeat(60))])
      expect(title).toBe('字'.repeat(50) + '…')
    })

    it('按码点截断，不切断 emoji', () => {
      const title = fallbackTitle([mk('user', '😀'.repeat(60))])
      expect(title).toBe('😀'.repeat(50) + '…')
    })

    it('无 user 消息时返回默认标题', () => {
      expect(fallbackTitle([mk('assistant', 'hi')])).toBe(UNTITLED_TITLE)
      expect(fallbackTitle([])).toBe(UNTITLED_TITLE)
    })
  })

  describe('extractTextParts', () => {
    it('拼接字符串与 { text } 片段', () => {
      expect(extractTextParts(['a', { text: 'b' }, { text: '' }, 42])).toBe('a\nb')
    })

    it('undefined 或空数组返回空字符串', () => {
      expect(extractTextParts(undefined)).toBe('')
      expect(extractTextParts([])).toBe('')
    })
  })
})
