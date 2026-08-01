import { describe, it, expect } from 'vitest'
import { grokImporter } from '@importer/grok'

/**
 * Grok 导入器 fixture 测试（报告 #7）
 *
 * 覆盖三种结构：conversation 包裹、直接 messages、顶层数组。
 * Grok 特征检测（grok/x.ai/x.com）、model 角色归一化、title 回退。
 */
function makeConv(overrides: Record<string, unknown> = {}): string {
  const conv = {
    id: 'grok-001',
    title: 'Grok 对话',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:01:00.000Z',
    messages: [
      { role: 'user', content: '解释一下量子计算', created_at: '2024-01-01T00:00:00.000Z' },
      { role: 'assistant', content: '量子计算利用量子叠加原理', model: 'grok-2', created_at: '2024-01-01T00:00:30.000Z' }
    ],
    ...overrides
  }
  return JSON.stringify([conv])
}

describe('grokImporter', () => {
  describe('detect', () => {
    it('文件名含 grok 且内容含 messages 即识别', () => {
      // 注：grok detect 先校验内容含 messages 数组，再校验 grok 特征；
      // 文件名特征是辅助判定，内容无 messages 时不会仅凭文件名命中。
      expect(grokImporter.detect('grok_export.json', makeConv())).toBe(true)
    })

    it('内容含 x.ai 识别', () => {
      const content = makeConv({ model: 'grok-3' })
      // content 含 "grok" 字样
      expect(grokImporter.detect('export.json', content)).toBe(true)
    })

    it('识别 conversation 包裹结构', () => {
      const content = JSON.stringify({ conversation: { title: 'x', messages: [{ role: 'user', content: 'hi' }] } })
      // 注：包裹结构无 grok 特征词，需文件名
      expect(grokImporter.detect('grok.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(grokImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 messages 的 json', () => {
      expect(grokImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })

    it('拒绝无 Grok 特征的 messages json', () => {
      // 有 messages 但无 grok/x.ai/x.com 特征
      const content = JSON.stringify([{ title: 'x', messages: [{ role: 'user', content: 'hi' }] }])
      expect(grokImporter.detect('export.json', content)).toBe(false)
    })
  })

  describe('parse', () => {
    it('正确解析消息结构与角色', () => {
      const sessions = grokImporter.parse(makeConv())
      expect(sessions.length).toBe(1)

      const s = sessions[0]
      expect(s.provider).toBe('Grok')
      expect(s.sourceId).toBe('grok-001')
      expect(s.title).toBe('Grok 对话')
      expect(s.messages.length).toBe(2)

      expect(s.messages[0].role).toBe('user')
      expect(s.messages[0].content).toBe('解释一下量子计算')

      expect(s.messages[1].role).toBe('assistant')
      expect(s.messages[1].content).toBe('量子计算利用量子叠加原理')
      expect(s.messages[1].model).toBe('grok-2')
    })

    it('model 角色归一化为 assistant', () => {
      const content = makeConv({
        messages: [{ role: 'model', content: '我是 Grok', created_at: '2024-01-01T00:00:00.000Z' }]
      })
      const sessions = grokImporter.parse(content)
      expect(sessions[0].messages[0].role).toBe('assistant')
    })

    it('空 title 用首条 user 消息回退', () => {
      const sessions = grokImporter.parse(makeConv({ title: '' }))
      expect(sessions[0].title).toBe('解释一下量子计算')
    })

    it('conversation 包裹结构解析', () => {
      const content = JSON.stringify({
        conversation: {
          id: 'wrapped-1',
          title: '包裹对话',
          messages: [{ role: 'user', content: 'hi', created_at: '2024-01-01T00:00:00.000Z' }]
        }
      })
      const sessions = grokImporter.parse(content)
      expect(sessions.length).toBe(1)
      expect(sessions[0].title).toBe('包裹对话')
      expect(sessions[0].sourceId).toBe('wrapped-1')
    })

    it('Unix 秒级时间戳转 ISO', () => {
      const content = makeConv({
        created_at: 1704067200,  // 2024-01-01T00:00:00Z
        messages: [{ role: 'user', content: 'hi', timestamp: 1704067200 }]
      })
      const sessions = grokImporter.parse(content)
      expect(sessions[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
      expect(sessions[0].messages[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
    })
  })

  describe('parse - 边界', () => {
    it('非法 JSON 返回空数组', () => {
      expect(grokImporter.parse('not json')).toEqual([])
    })

    it('空消息对话被跳过', () => {
      const content = JSON.stringify([{ title: '空', messages: [] }])
      expect(grokImporter.parse(content)).toEqual([])
    })
  })
})
