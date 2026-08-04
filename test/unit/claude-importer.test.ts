import { describe, it, expect } from 'vitest'
import { claudeImporter } from '@importer/claude'

// 构造一条 Claude 对话（content 数组形式）
function makeConversation(overrides: Record<string, unknown> = {}): string {
  const conv = {
    uuid: 'conv-001',
    name: 'Claude 对话',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:01:00.000Z',
    chat_messages: [
      {
        uuid: 'm1',
        sender: 'human',
        created_at: '2026-01-01T00:00:00.000Z',
        content: [{ type: 'text', text: '你好' }]
      },
      {
        uuid: 'm2',
        sender: 'assistant',
        created_at: '2026-01-01T00:00:30.000Z',
        content: [{ type: 'text', text: '你好！有什么可以帮你？' }]
      }
    ],
    ...overrides
  }
  return JSON.stringify([conv])
}

describe('claudeImporter', () => {
  describe('detect', () => {
    it('识别 conversations.json 文件名含 chat_messages', () => {
      expect(claudeImporter.detect('conversations.json', '{"chat_messages":[]}')).toBe(true)
    })

    it('识别文件名含 claude 且含 chat_messages 的 json', () => {
      const content = makeConversation()
      expect(claudeImporter.detect('claude-export.json', content)).toBe(true)
    })

    it('识别含 sender human/assistant 的 json', () => {
      const content = makeConversation()
      expect(claudeImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(claudeImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 chat_messages 的 json', () => {
      expect(claudeImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })
  })

  describe('parse', () => {
    it('解析 content 数组消息', () => {
      const sessions = claudeImporter.parse(makeConversation())
      expect(sessions.length).toBe(1)
      const s = sessions[0]
      expect(s.sourceId).toBe('conv-001')
      expect(s.title).toBe('Claude 对话')
      expect(s.provider).toBe('Claude')
      expect(s.messages.length).toBe(2)
      expect(s.messages[0].role).toBe('user')
      expect(s.messages[0].content).toBe('你好')
      expect(s.messages[1].role).toBe('assistant')
    })

    it('解析 content 字符串形式消息', () => {
      const conv = {
        uuid: 'conv-002',
        name: '字符串消息',
        chat_messages: [
          { sender: 'human', content: 'hi' },
          { sender: 'assistant', content: 'hello' }
        ]
      }
      const sessions = claudeImporter.parse(JSON.stringify([conv]))
      expect(sessions[0].messages.map((m) => m.content)).toEqual(['hi', 'hello'])
    })

    it('tool_use 与 image 块转占位文本', () => {
      const conv = {
        uuid: 'conv-003',
        name: '工具调用',
        chat_messages: [
          {
            sender: 'assistant',
            content: [
              { type: 'tool_use', text: 'search' },
              { type: 'image' },
              { type: 'text', text: '结果如下' }
            ]
          }
        ]
      }
      const sessions = claudeImporter.parse(JSON.stringify([conv]))
      expect(sessions[0].messages[0].content).toContain('[工具调用: search]')
      expect(sessions[0].messages[0].content).toContain('[图片]')
      expect(sessions[0].messages[0].content).toContain('结果如下')
    })

    it('空消息被跳过，空 title 回退首条消息', () => {
      const conv = {
        uuid: 'conv-004',
        name: '',
        chat_messages: [
          { sender: 'human', content: '使用 Rust 写解析器' }
        ]
      }
      const sessions = claudeImporter.parse(JSON.stringify([conv]))
      expect(sessions[0].title).toBe('使用 Rust 写解析器')
    })

    it('非法 JSON 返回空数组', () => {
      expect(claudeImporter.parse('not json')).toEqual([])
    })
  })
})