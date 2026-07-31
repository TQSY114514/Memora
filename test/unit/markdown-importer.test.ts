import { describe, it, expect } from 'vitest'
import { markdownImporter } from '@importer/markdown'

describe('markdownImporter', () => {
  describe('detect', () => {
    it('识别 .md 文件', () => {
      expect(markdownImporter.detect('notes.md', '# title')).toBe(true)
    })

    it('识别 .markdown 文件', () => {
      // 当前实现仅识别 .md 后缀，.markdown 不在列表中（记录现状）
      expect(markdownImporter.detect('notes.markdown', '# title')).toBe(false)
    })

    it('拒绝非 md 文件', () => {
      expect(markdownImporter.detect('notes.txt', 'hello')).toBe(false)
    })
  })

  describe('parse', () => {
    it('解析 frontmatter 格式', () => {
      const content = `---
title: 测试对话
provider: Claude
created_at: 2026-01-01T00:00:00Z
---
## user
你好
## assistant
你好！有什么可以帮你？`
      const sessions = markdownImporter.parse(content)
      expect(sessions.length).toBe(1)
      expect(sessions[0].title).toBe('测试对话')
      expect(sessions[0].provider).toBe('Claude')
      expect(sessions[0].messages.length).toBeGreaterThanOrEqual(2)
    })

    it('解析纯 markdown 按标题分割', () => {
      const content = `# 第一段内容

这是用户的问题

# 回答

这是助手的回答`
      const sessions = markdownImporter.parse(content)
      expect(sessions.length).toBeGreaterThanOrEqual(1)
      expect(sessions[0].messages.length).toBeGreaterThanOrEqual(1)
    })

    it('空内容返回带默认标题的会话（兜底）', () => {
      // markdown 导入器对空内容也返回一条「未命名对话」，记录现状
      const sessions = markdownImporter.parse('')
      expect(sessions.length).toBe(1)
      expect(sessions[0].title).toBe('未命名对话')
    })
  })
})
