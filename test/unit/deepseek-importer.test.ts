import { describe, it, expect } from 'vitest'
import { deepseekImporter } from '@importer/deepseek'

describe('deepseekImporter', () => {
  describe('detect', () => {
    it('识别含 messages 的数组', () => {
      const content = JSON.stringify([{ title: '对话', messages: [{ role: 'user', content: 'hi' }] }])
      expect(deepseekImporter.detect('export.json', content)).toBe(true)
    })

    it('识别单对话对象含 messages', () => {
      const content = JSON.stringify({ title: '对话', messages: [{ role: 'user', content: 'hi' }] })
      expect(deepseekImporter.detect('export.json', content)).toBe(true)
    })

    it('识别含 share_id 的 json', () => {
      const content = JSON.stringify({ share_id: 'abc123', title: '对话', messages: [] })
      expect(deepseekImporter.detect('export.json', content)).toBe(true)
    })

    it('识别含 biz_data 的 API 响应', () => {
      const content = JSON.stringify({ data: { biz_code: 0, biz_data: { id: 'x', title: 't', messages: [] } } })
      expect(deepseekImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(deepseekImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 messages 的 json', () => {
      expect(deepseekImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })
  })

  describe('parse', () => {
    it('解析简单对话结构', () => {
      const content = JSON.stringify({
        id: 'ds-1',
        title: 'DeepSeek 对话',
        messages: [
          { role: 'user', content: '解释一下闭包', created_at: '2026-01-01T00:00:00.000Z' },
          { role: 'assistant', content: '闭包是...', created_at: '2026-01-01T00:00:30.000Z' }
        ]
      })
      const sessions = deepseekImporter.parse(content)
      expect(sessions.length).toBe(1)
      const s = sessions[0]
      expect(s.sourceId).toBe('ds-1')
      expect(s.title).toBe('DeepSeek 对话')
      expect(s.provider).toBe('DeepSeek')
      expect(s.messages.length).toBe(2)
      expect(s.messages[0].content).toBe('解释一下闭包')
    })

    it('API 响应包裹（data.biz_data）', () => {
      const content = JSON.stringify({
        data: {
          biz_code: 0,
          biz_data: {
            id: 'api-1',
            title: 'API 对话',
            messages: [{ role: 'user', content: 'hello' }]
          }
        }
      })
      const sessions = deepseekImporter.parse(content)
      expect(sessions[0].sourceId).toBe('api-1')
      expect(sessions[0].messages[0].content).toBe('hello')
    })

    it('reasoning_content 合并到消息前并标注思考过程', () => {
      const content = JSON.stringify({
        title: 'reasoning',
        messages: [
          { role: 'assistant', content: '最终答案', reasoning_content: '思考过程' }
        ]
      })
      const sessions = deepseekImporter.parse(content)
      expect(sessions[0].messages[0].content).toContain('思考过程')
      expect(sessions[0].messages[0].content).toContain('最终答案')
      expect(sessions[0].messages[0].content).toContain('💭')
    })

    it('占位标题回退到首条消息', () => {
      const content = JSON.stringify({
        title: 'Shared Conversation',
        messages: [{ role: 'user', content: '如何优化 Vite 构建' }]
      })
      const sessions = deepseekImporter.parse(content)
      expect(sessions[0].title).toBe('如何优化 Vite 构建')
    })

    it('空消息对话被跳过，非法 JSON 返回空数组', () => {
      expect(deepseekImporter.parse(JSON.stringify({ title: '空', messages: [] }))).toEqual([])
      expect(deepseekImporter.parse('not json')).toEqual([])
    })
  })
})