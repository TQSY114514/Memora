import { describe, it, expect } from 'vitest'
import { jsonImporter } from '@importer/json'

describe('jsonImporter', () => {
  describe('detect', () => {
    it('识别含 messages 数组的 json', () => {
      const content = JSON.stringify({ title: '对话', messages: [{ role: 'user', content: 'hi' }] })
      expect(jsonImporter.detect('export.json', content)).toBe(true)
    })

    it('识别数组形式', () => {
      const content = JSON.stringify([{ title: 'a', messages: [] }])
      expect(jsonImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(jsonImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 messages 的 json', () => {
      expect(jsonImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })
  })

  describe('parse', () => {
    it('解析单条对话', () => {
      const content = JSON.stringify({
        sourceId: 's-1',
        provider: 'ChatGPT',
        model: 'gpt-4',
        title: '测试',
        description: 'desc',
        messages: [
          { role: 'user', content: '你好', model: 'gpt-4' },
          { role: 'assistant', content: '你好！' }
        ]
      })
      const sessions = jsonImporter.parse(content)
      expect(sessions.length).toBe(1)
      const s = sessions[0]
      expect(s.sourceId).toBe('s-1')
      expect(s.provider).toBe('ChatGPT')
      expect(s.model).toBe('gpt-4')
      expect(s.title).toBe('测试')
      expect(s.description).toBe('desc')
      expect(s.messages.length).toBe(2)
      expect(s.messages[0].role).toBe('user')
      expect(s.messages[0].model).toBe('gpt-4')
    })

    it('解析数组并保留 provider 默认 JSON', () => {
      const content = JSON.stringify([
        { title: 'a', messages: [{ role: 'user', content: 'x' }] },
        { title: 'b', messages: [{ role: 'user', content: 'y' }] }
      ])
      const sessions = jsonImporter.parse(content)
      expect(sessions.length).toBe(2)
      expect(sessions[0].provider).toBe('JSON')
    })

    it('过滤无内容消息，空 title 回退首条消息', () => {
      const content = JSON.stringify({
        messages: [{ role: 'user', content: '' }, { role: 'user', content: '标题来源' }]
      })
      const sessions = jsonImporter.parse(content)
      expect(sessions[0].messages).toHaveLength(1)
      expect(sessions[0].title).toBe('标题来源')
    })

    it('无消息对话被跳过，非法 JSON 返回空数组', () => {
      expect(jsonImporter.parse(JSON.stringify({ title: '空', messages: [] }))).toEqual([])
      expect(jsonImporter.parse('not json')).toEqual([])
    })
  })
})