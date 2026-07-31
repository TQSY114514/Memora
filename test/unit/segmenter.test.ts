import { describe, it, expect } from 'vitest'
import { segment, segmentQuery } from '@search/segmenter'

describe('segmenter', () => {
  describe('segment', () => {
    it('中文段落按词切分（空格分隔）', () => {
      const out = segment('知识管理工具')
      // 至少应切出多个词，且用空格连接
      expect(out.length).toBeGreaterThan('知识管理工具'.length)
      expect(out).toMatch(/[\u4e00-\u9fa5]/)
    })

    it('英文保持原样', () => {
      expect(segment('hello world')).toBe('hello world')
    })

    it('连字符词汇被分词器拆分（Intl.Segmenter 行为）', () => {
      // Intl.Segmenter 在 zh-CN 粒度下把 'gpt-4' 切成 'gpt' '4'
      const out = segment('gpt-4')
      expect(out).toContain('gpt')
      expect(out).toContain('4')
    })

    it('空字符串与空白', () => {
      expect(segment('')).toBe('')
      expect(segment('   ')).toBe('')
    })

    it('过滤标点', () => {
      const out = segment('你好，世界！')
      expect(out).not.toContain('，')
      expect(out).not.toContain('！')
    })
  })

  describe('segmentQuery', () => {
    it('返回去重词数组', () => {
      const terms = segmentQuery('SQLite SQLite 性能')
      // 去重，相同词只出现一次
      const sqliteCount = terms.filter((t) => t.toLowerCase() === 'sqlite').length
      expect(sqliteCount).toBe(1)
    })

    it('空查询返回空数组', () => {
      expect(segmentQuery('')).toEqual([])
      expect(segmentQuery('   ')).toEqual([])
    })

    it('英文 + 中文混合', () => {
      const terms = segmentQuery('Electron 项目')
      expect(terms.length).toBeGreaterThanOrEqual(2)
    })
  })
})
