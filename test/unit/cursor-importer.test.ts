import { describe, it, expect } from 'vitest'
import { cursorImporter } from '@importer/cursor'

/**
 * Cursor 导入器 fixture 测试（报告 #7）
 *
 * 覆盖三种结构：单对话、chats/conversations 多对话、顶层数组。
 * human/model 角色归一化、占位 title 回退、时间戳转换。
 */
function makeConv(overrides: Record<string, unknown> = {}): string {
  const conv = {
    id: 'cursor-001',
    title: 'Cursor 代码问答',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:01:00.000Z',
    messages: [
      { role: 'user', content: '这段代码什么意思', created_at: '2024-01-01T00:00:00.000Z' },
      { role: 'assistant', content: '这是一个排序算法', model: 'gpt-4', created_at: '2024-01-01T00:00:30.000Z' }
    ],
    ...overrides
  }
  return JSON.stringify([conv])
}

describe('cursorImporter', () => {
  describe('detect', () => {
    it('文件名含 cursor 即识别', () => {
      expect(cursorImporter.detect('cursor_export.json', '[]')).toBe(true)
    })

    it('识别含 human/model 角色的 json', () => {
      const content = JSON.stringify([{
        title: 'x',
        messages: [{ role: 'human', content: 'hi' }, { role: 'model', content: 'hello' }]
      }])
      expect(cursorImporter.detect('export.json', content)).toBe(true)
    })

    it('识别 chats 数组结构', () => {
      const content = JSON.stringify({
        chats: [{ title: 'x', messages: [{ role: 'user', content: 'hi' }] }]
      })
      expect(cursorImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(cursorImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 messages 的 json', () => {
      expect(cursorImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })
  })

  describe('parse', () => {
    it('正确解析消息结构与字段', () => {
      const sessions = cursorImporter.parse(makeConv())
      expect(sessions.length).toBe(1)

      const s = sessions[0]
      expect(s.provider).toBe('Cursor')
      expect(s.sourceId).toBe('cursor-001')
      expect(s.title).toBe('Cursor 代码问答')
      expect(s.messages.length).toBe(2)

      expect(s.messages[0].role).toBe('user')
      expect(s.messages[1].role).toBe('assistant')
      expect(s.messages[1].model).toBe('gpt-4')
    })

    it('human 角色归一化为 user', () => {
      const content = makeConv({
        messages: [{ role: 'human', content: 'hi', created_at: '2024-01-01T00:00:00.000Z' }]
      })
      const sessions = cursorImporter.parse(content)
      expect(sessions[0].messages[0].role).toBe('user')
    })

    it('model 角色归一化为 assistant', () => {
      const content = makeConv({
        messages: [{ role: 'model', content: 'hello', created_at: '2024-01-01T00:00:00.000Z' }]
      })
      const sessions = cursorImporter.parse(content)
      expect(sessions[0].messages[0].role).toBe('assistant')
    })

    it('占位 title（New Chat / Untitled）回退到首条 user 消息', () => {
      for (const placeholder of ['New Chat', 'Untitled', '']) {
        const sessions = cursorImporter.parse(makeConv({ title: placeholder }))
        expect(sessions[0].title, `placeholder="${placeholder}"`).toBe('这段代码什么意思')
      }
    })

    it('chats 数组结构解析', () => {
      const content = JSON.stringify({
        chats: [
          { id: 'c1', title: 'A', messages: [{ role: 'user', content: 'a', created_at: '2024-01-01T00:00:00.000Z' }] },
          { id: 'c2', title: 'B', messages: [{ role: 'user', content: 'b', created_at: '2024-01-01T00:00:00.000Z' }] }
        ]
      })
      const sessions = cursorImporter.parse(content)
      expect(sessions.length).toBe(2)
      expect(sessions[0].title).toBe('A')
      expect(sessions[1].title).toBe('B')
    })

    it('Unix 秒级时间戳转 ISO', () => {
      const content = makeConv({
        created_at: 1704067200,
        messages: [{ role: 'user', content: 'hi', timestamp: 1704067200 }]
      })
      const sessions = cursorImporter.parse(content)
      expect(sessions[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
      expect(sessions[0].messages[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
    })
  })

  describe('parse - 边界', () => {
    it('非法 JSON 返回空数组', () => {
      expect(cursorImporter.parse('not json')).toEqual([])
    })

    it('空消息对话被跳过', () => {
      const content = JSON.stringify([{ title: '空', messages: [] }])
      expect(cursorImporter.parse(content)).toEqual([])
    })

    it('顶层数组视为单对话消息列表', () => {
      // 顶层数组但元素无 messages 字段 → 视为消息列表
      const content = JSON.stringify([
        { role: 'user', content: 'hi', created_at: '2024-01-01T00:00:00.000Z' }
      ])
      const sessions = cursorImporter.parse(content)
      expect(sessions.length).toBe(1)
      expect(sessions[0].messages[0].content).toBe('hi')
    })
  })
})
