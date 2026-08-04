import { describe, it, expect } from 'vitest'
import { qwenImporter } from '@importer/qwen'

describe('qwenImporter', () => {
  describe('detect', () => {
    it('识别文件名含 qwen', () => {
      const content = JSON.stringify({ messages: [] })
      expect(qwenImporter.detect('qwen-export.json', content)).toBe(true)
    })

    it('识别文件名含 tongyi', () => {
      const content = JSON.stringify({ messages: [] })
      expect(qwenImporter.detect('tongyi.json', content)).toBe(true)
    })

    it('识别含 success + chat 的 API 响应', () => {
      const content = JSON.stringify({ success: true, data: { chat: { id: 'x' } } })
      expect(qwenImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(qwenImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 messages 的 json', () => {
      expect(qwenImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })
  })

  describe('parse', () => {
    it('解析简单对话结构', () => {
      const content = JSON.stringify({
        id: 'qw-1',
        title: 'Qwen 对话',
        messages: [
          { role: 'user', content: '你好', created_at: '2026-01-01T00:00:00.000Z' },
          { role: 'assistant', content: '你好！', created_at: '2026-01-01T00:00:30.000Z' }
        ]
      })
      const sessions = qwenImporter.parse(content)
      expect(sessions.length).toBe(1)
      const s = sessions[0]
      expect(s.sourceId).toBe('qw-1')
      expect(s.title).toBe('Qwen 对话')
      expect(s.provider).toBe('Qwen')
      expect(s.messages.length).toBe(2)
    })

    it('API 响应包裹（data.chat）', () => {
      const content = JSON.stringify({
        success: true,
        data: {
          chat: {
            id: 'api-qw',
            title: 'API 对话',
            messages: [{ role: 'user', content: 'hello' }]
          }
        }
      })
      const sessions = qwenImporter.parse(content)
      expect(sessions[0].sourceId).toBe('api-qw')
      expect(sessions[0].messages[0].content).toBe('hello')
    })

    it('data.messages 直接包裹', () => {
      const content = JSON.stringify({
        data: { messages: [{ role: 'user', content: 'hi' }] }
      })
      const sessions = qwenImporter.parse(content)
      expect(sessions[0].messages[0].content).toBe('hi')
    })

    it('thinking_content 合并到消息前', () => {
      const content = JSON.stringify({
        title: '思考',
        messages: [{ role: 'assistant', content: '答案', thinking_content: '思考过程' }]
      })
      const sessions = qwenImporter.parse(content)
      expect(sessions[0].messages[0].content).toContain('思考过程')
      expect(sessions[0].messages[0].content).toContain('答案')
    })

    it('空 title 回退首条消息，非法 JSON 返回空数组', () => {
      const content = JSON.stringify({ messages: [{ role: 'user', content: '用 React 写' }] })
      const sessions = qwenImporter.parse(content)
      expect(sessions[0].title).toBe('用 React 写')
      expect(qwenImporter.parse('not json')).toEqual([])
    })
  })
})