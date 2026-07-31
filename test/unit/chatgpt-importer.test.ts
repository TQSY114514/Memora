import { describe, it, expect } from 'vitest'
import { chatgptImporter } from '@importer/chatgpt'

// 构造一条最小合法 ChatGPT conversations.json 元素
function makeConversation(overrides: Record<string, unknown> = {}): string {
  const conv = {
    title: '测试对话',
    id: 'test-001',
    create_time: 1700000000,
    update_time: 1700001000,
    mapping: {
      root: {
        id: 'root',
        children: ['a']
      },
      a: {
        id: 'a',
        parent: 'root',
        children: ['b'],
        message: {
          id: 'm1',
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['你好'] },
          create_time: 1700000000
        }
      },
      b: {
        id: 'b',
        parent: 'a',
        children: [],
        message: {
          id: 'm2',
          author: { role: 'assistant' },
          content: { content_type: 'text', parts: ['你好！有什么可以帮你的？'] },
          model: 'gpt-4',
          create_time: 1700000050
        }
      }
    },
    ...overrides
  }
  return JSON.stringify([conv])
}

describe('chatgptImporter', () => {
  describe('detect', () => {
    it('识别 conversations.json 文件名', () => {
      expect(chatgptImporter.detect('conversations.json', '[]')).toBe(true)
    })

    it('识别含 mapping 结构的 json', () => {
      const content = makeConversation()
      expect(chatgptImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(chatgptImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 mapping 的数组', () => {
      expect(chatgptImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })
  })

  describe('parse', () => {
    it('解析一条对话返回正确结构', () => {
      const content = makeConversation()
      const sessions = chatgptImporter.parse(content)
      expect(sessions.length).toBe(1)

      const s = sessions[0]
      expect(s.sourceId).toBe('test-001')
      expect(s.title).toBe('测试对话')
      expect(s.provider).toBe('ChatGPT')
      expect(s.messages.length).toBe(2)
      expect(s.messages[0].role).toBe('user')
      expect(s.messages[0].content).toBe('你好')
      expect(s.messages[1].role).toBe('assistant')
      expect(s.messages[1].model).toBe('gpt-4')
    })

    it('空 title 时用首条 user 消息回退标题', () => {
      const content = makeConversation({ title: '' })
      const sessions = chatgptImporter.parse(content)
      expect(sessions[0].title).toBe('你好')
    })

    it('无消息的对话被跳过', () => {
      const conv = {
        title: '空对话',
        id: 'empty',
        create_time: 1700000000,
        mapping: { root: { id: 'root', children: [] } }
      }
      const sessions = chatgptImporter.parse(JSON.stringify([conv]))
      expect(sessions.length).toBe(0)
    })

    it('非法 JSON 返回空数组', () => {
      expect(chatgptImporter.parse('not json')).toEqual([])
    })

    it('时间戳转换为 ISO 字符串', () => {
      const content = makeConversation()
      const sessions = chatgptImporter.parse(content)
      // 1700000000 → 2023-11-14T22:13:20.000Z
      expect(sessions[0].createdAt).toBe('2023-11-14T22:13:20.000Z')
    })
  })
})
