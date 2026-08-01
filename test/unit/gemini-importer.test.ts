import { describe, it, expect } from 'vitest'
import { geminiImporter } from '@importer/gemini'

/**
 * Gemini 导入器 fixture 测试（报告 #7）
 *
 * 覆盖三种结构：prompts 数组、contents（API 风格）、简单 messages。
 * 角色归一化（model→assistant）、title 回退、多对话解析。
 */
function makePromptsConv(overrides: Record<string, unknown> = {}): string {
  const conv = {
    title: '向量数据库问答',
    id: 'gem-001',
    createdAt: '2023-11-14T22:13:20.000Z',
    updatedAt: '2023-11-14T22:13:20.000Z',
    prompts: [
      {
        prompt: '什么是向量数据库',
        timestamp: 1700000000,
        model: 'gemini-1.5-pro',
        candidates: [{ content: { parts: [{ text: '向量数据库是存储和检索高维向量的系统' }] } }]
      }
    ],
    ...overrides
  }
  return JSON.stringify([conv])
}

describe('geminiImporter', () => {
  describe('detect', () => {
    it('文件名含 gemini 即识别', () => {
      expect(geminiImporter.detect('gemini_export.json', '[]')).toBe(true)
    })

    it('识别 prompts 结构', () => {
      expect(geminiImporter.detect('export.json', makePromptsConv())).toBe(true)
    })

    it('识别 contents 结构', () => {
      const content = JSON.stringify([
        { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }
      ])
      expect(geminiImporter.detect('export.json', content)).toBe(true)
    })

    it('识别含 model 角色的 messages 结构', () => {
      const content = JSON.stringify([
        { messages: [{ role: 'model', content: '回复' }] }
      ])
      expect(geminiImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝非 json 文件', () => {
      expect(geminiImporter.detect('export.txt', 'hello')).toBe(false)
    })

    it('拒绝无 Gemini 特征的 json', () => {
      expect(geminiImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })
  })

  describe('parse - prompts 结构', () => {
    it('正确解析 prompts 数组为 user/assistant 消息对', () => {
      const sessions = geminiImporter.parse(makePromptsConv())
      expect(sessions.length).toBe(1)

      const s = sessions[0]
      expect(s.provider).toBe('Gemini')
      expect(s.sourceId).toBe('gem-001')
      expect(s.title).toBe('向量数据库问答')
      expect(s.messages.length).toBe(2)

      expect(s.messages[0].role).toBe('user')
      expect(s.messages[0].content).toBe('什么是向量数据库')

      expect(s.messages[1].role).toBe('assistant')
      expect(s.messages[1].content).toBe('向量数据库是存储和检索高维向量的系统')
      expect(s.messages[1].model).toBe('gemini-1.5-pro')
    })

    it('空 title 时用首条 user 消息回退', () => {
      const sessions = geminiImporter.parse(makePromptsConv({ title: '' }))
      expect(sessions[0].title).toBe('什么是向量数据库')
    })

    it('timestamp 秒级转 ISO', () => {
      const sessions = geminiImporter.parse(makePromptsConv())
      expect(sessions[0].messages[0].createdAt).toBe('2023-11-14T22:13:20.000Z')
    })
  })

  describe('parse - contents 结构（API 风格）', () => {
    it('正确解析 contents，model 角色归一化为 assistant', () => {
      const content = JSON.stringify([
        {
          title: 'API 对话',
          contents: [
            { role: 'user', parts: [{ text: '你好' }] },
            { role: 'model', parts: [{ text: '你好！我是 Gemini' }] }
          ]
        }
      ])
      const sessions = geminiImporter.parse(content)
      expect(sessions.length).toBe(1)
      expect(sessions[0].messages[0].role).toBe('user')
      expect(sessions[0].messages[1].role).toBe('assistant')
      expect(sessions[0].messages[1].content).toBe('你好！我是 Gemini')
    })
  })

  describe('parse - 边界', () => {
    it('非法 JSON 返回空数组', () => {
      expect(geminiImporter.parse('not json')).toEqual([])
    })

    it('无消息的对话被跳过', () => {
      const content = JSON.stringify([{ title: '空', prompts: [] }])
      expect(geminiImporter.parse(content)).toEqual([])
    })

    it('多对话全部解析', () => {
      const content = JSON.stringify([
        { title: 'A', prompts: [{ prompt: 'a', candidates: [{ content: { parts: [{ text: 'b' }] } }] }] },
        { title: 'B', prompts: [{ prompt: 'c', candidates: [{ content: { parts: [{ text: 'd' }] } }] }] }
      ])
      const sessions = geminiImporter.parse(content)
      expect(sessions.length).toBe(2)
      expect(sessions[0].title).toBe('A')
      expect(sessions[1].title).toBe('B')
    })
  })
})
