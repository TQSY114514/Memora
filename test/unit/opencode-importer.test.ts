import { describe, it, expect } from 'vitest'
import { opencodeImporter } from '@importer/opencode'

// 构造一条含 parts + time.created 的 OpenCode 会话（sessions 包裹形式）
function sessionJson(overrides: Record<string, unknown> = {}): string {
  const data = {
    sessions: [
      {
        id: 'ses_001',
        title: 'OpenCode 会话',
        time: { created: 1786526909000, updated: 1786526909999 },
        messages: [
          { id: 'msg_1', role: 'user', time: { created: 1786526909000 }, parts: [{ type: 'text', text: '你好' }] },
          {
            id: 'msg_2',
            role: 'assistant',
            time: { created: 1786526909500 },
            parts: [{ type: 'text', text: '回答' }]
          }
        ]
      }
    ],
    ...overrides
  }
  return JSON.stringify(data)
}

describe('opencodeImporter', () => {
  describe('detect', () => {
    it('识别含 parts + time 的 OpenCode 会话 JSON', () => {
      expect(opencodeImporter.detect('opencode-export.json', sessionJson())).toBe(true)
    })

    it('识别裸消息数组（带 parts）', () => {
      const content = JSON.stringify([{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }])
      expect(opencodeImporter.detect('export.json', content)).toBe(true)
    })

    it('识别含 callID 工具调用的 JSON', () => {
      const content = JSON.stringify({
        sessions: [
          {
            id: 'ses_x',
            messages: [
              {
                id: 'msg_1',
                role: 'assistant',
                parts: [
                  { type: 'tool', tool: 'webfetch', callID: 'call_1', state: { status: 'completed' } }
                ]
              }
            ]
          }
        ]
      })
      expect(opencodeImporter.detect('export.json', content)).toBe(true)
    })

    it('拒绝通用 {title, messages:[{role,content}]} JSON（交给 jsonImporter）', () => {
      const content = JSON.stringify({ title: '通用', messages: [{ role: 'user', content: 'hi' }] })
      expect(opencodeImporter.detect('export.json', content)).toBe(false)
    })

    it('拒绝消息无 parts 且 id 非 msg_ 前缀的 json', () => {
      const content = JSON.stringify({
        sessions: [{ id: 's1', messages: [{ id: 'abc', role: 'user' }] }]
      })
      expect(opencodeImporter.detect('export.json', content)).toBe(false)
    })

    it('拒绝非 json 文件', () => {
      expect(opencodeImporter.detect('export.txt', 'hello')).toBe(false)
    })
  })

  describe('parse', () => {
    it('组装 text + reasoning + tool + file 各部分', () => {
      const content = JSON.stringify({
        sessions: [
          {
            id: 'ses_001',
            title: '会话A',
            time: { created: 1786526909000, updated: 1786526909999 },
            messages: [
              { id: 'msg_1', role: 'user', time: { created: 1786526909000 }, parts: [{ type: 'text', text: '你好' }] },
              {
                id: 'msg_2',
                role: 'assistant',
                modelID: 'deepseek-v4',
                time: { created: 1786526909500 },
                parts: [
                  { type: 'reasoning', text: '先思考' },
                  { type: 'text', text: '这是回答' },
                  { type: 'text', text: '被忽略', ignored: true },
                  {
                    type: 'tool',
                    tool: 'webfetch',
                    callID: 'call_1',
                    state: { status: 'completed', input: { url: 'http://x' }, output: '抓取结果' }
                  },
                  { type: 'file', filename: 'a.pdf' },
                  { type: 'step-start' }
                ]
              },
              { id: 'msg_3', role: 'user', time: { created: 1786526909600 }, parts: [] }
            ]
          }
        ]
      })
      const sessions = opencodeImporter.parse(content)
      expect(sessions.length).toBe(1)
      const s = sessions[0]
      expect(s.sourceId).toBe('ses_001')
      expect(s.title).toBe('会话A')
      expect(s.provider).toBe('OpenCode')
      expect(s.messages.length).toBe(2) // 空 parts 消息被跳过

      const user = s.messages[0]
      expect(user.role).toBe('user')
      expect(user.content).toBe('你好')
      expect(user.createdAt).toBe(new Date(1786526909000).toISOString())

      const assistant = s.messages[1]
      expect(assistant.role).toBe('assistant')
      expect(assistant.model).toBe('deepseek-v4')
      expect(assistant.content).toContain('[推理] 先思考')
      expect(assistant.content).toContain('这是回答')
      expect(assistant.content).toContain('[工具调用: webfetch]')
      expect(assistant.content).toContain('抓取结果')
      expect(assistant.content).toContain('[附件: a.pdf]')
      expect(assistant.content).not.toContain('被忽略')
      expect(assistant.content).not.toContain('step-start')
      // 顺序：推理段在主文本之前
      expect(assistant.content.indexOf('[推理]')).toBeLessThan(assistant.content.indexOf('这是回答'))
    })

    it('无标题时回退首条 user 消息', () => {
      const content = JSON.stringify({
        sessions: [
          {
            id: 'ses_002',
            messages: [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: '使用 Rust 写解析器' }] }]
          }
        ]
      })
      const sessions = opencodeImporter.parse(content)
      expect(sessions.length).toBe(1)
      expect(sessions[0].title).toBe('使用 Rust 写解析器')
    })

    it('裸消息数组包装为一个会话', () => {
      const content = JSON.stringify([
        { id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'a' }] },
        { id: 'msg_2', role: 'assistant', parts: [{ type: 'text', text: 'b' }] }
      ])
      const sessions = opencodeImporter.parse(content)
      expect(sessions.length).toBe(1)
      expect(sessions[0].messages.length).toBe(2)
      expect(sessions[0].messages[0].role).toBe('user')
      expect(sessions[0].messages[1].role).toBe('assistant')
      expect(sessions[0].title).toBe('a')
    })

    it('非法 JSON 返回空数组', () => {
      expect(opencodeImporter.parse('not json')).toEqual([])
    })
  })
})
