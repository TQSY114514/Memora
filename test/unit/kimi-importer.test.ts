import { describe, it, expect } from 'vitest'
import { kimiImporter } from '@importer/kimi'

/**
 * Kimi 导入器 fixture 测试（报告 #7）
 *
 * 覆盖两种来源：HYDRATION_INIT_STATE（HTML）、直接 JSON。
 * toolCalls 渲染、objectId、title 回退。
 */
function makeJsonConv(overrides: Record<string, unknown> = {}): string {
  const conv = {
    objectId: 'kimi-001',
    title: 'Kimi 对话',
    createdAt: '2024-01-01T00:00:00.000Z',
    messages: [
      { id: 'm1', role: 'user', content: '帮我写首诗', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'm2', role: 'assistant', content: '春风拂面...', createdAt: '2024-01-01T00:00:30.000Z' }
    ],
    ...overrides
  }
  return JSON.stringify([conv])
}

function makeHydrationHtml(conv: Record<string, unknown>): string {
  return `<html><script>window.HYDRATION_INIT_STATE = ${JSON.stringify(conv)};</script></html>`
}

describe('kimiImporter', () => {
  describe('detect', () => {
    it('识别含 HYDRATION_INIT_STATE 的 html', () => {
      const html = makeHydrationHtml({ title: 'x', messages: [{ role: 'user', content: 'hi' }] })
      expect(kimiImporter.detect('export.html', html)).toBe(true)
    })

    it('识别含 objectId 的 json', () => {
      expect(kimiImporter.detect('export.json', makeJsonConv())).toBe(true)
    })

    it('识别含 toolCalls 的 json', () => {
      const content = JSON.stringify([{
        title: 'x',
        messages: [{ role: 'assistant', content: 'r', toolCalls: [{ name: 'search', output: 'ok' }] }]
      }])
      expect(kimiImporter.detect('export.json', content)).toBe(true)
    })

    it('文件名含 kimi 且内容含 objectId 即识别', () => {
      // 注：kimi detect 对 .json 先校验内容含 objectId 或 toolCalls；
      // 文件名特征是辅助判定，内容无特征时不会仅凭文件名命中。
      expect(kimiImporter.detect('kimi_export.json', makeJsonConv())).toBe(true)
    })

    it('拒绝无 Kimi 特征的 json', () => {
      expect(kimiImporter.detect('export.json', '[{"foo":1}]')).toBe(false)
    })

    it('拒绝非 html/json 文件', () => {
      expect(kimiImporter.detect('export.txt', 'hello')).toBe(false)
    })
  })

  describe('parse - JSON 结构', () => {
    it('正确解析消息结构与字段', () => {
      const sessions = kimiImporter.parse(makeJsonConv())
      expect(sessions.length).toBe(1)

      const s = sessions[0]
      expect(s.provider).toBe('Kimi')
      expect(s.sourceId).toBe('kimi-001')
      expect(s.title).toBe('Kimi 对话')
      expect(s.messages.length).toBe(2)

      expect(s.messages[0].role).toBe('user')
      expect(s.messages[0].content).toBe('帮我写首诗')

      expect(s.messages[1].role).toBe('assistant')
      expect(s.messages[1].content).toBe('春风拂面...')
    })

    it('空 title 用首条 user 消息回退', () => {
      const sessions = kimiImporter.parse(makeJsonConv({ title: '' }))
      expect(sessions[0].title).toBe('帮我写首诗')
    })

    it('toolCalls 渲染为引用块前缀', () => {
      const content = makeJsonConv({
        messages: [{
          id: 'm1',
          role: 'assistant',
          content: '结果如下',
          createdAt: '2024-01-01T00:00:00.000Z',
          toolCalls: [{ name: 'web_search', input: '天气', output: '晴' }]
        }]
      })
      const sessions = kimiImporter.parse(content)
      const msg = sessions[0].messages[0]
      expect(msg.content).toContain('🔧 **web_search**')
      expect(msg.content).toContain('输入: 天气')
      expect(msg.content).toContain('输出: 晴')
      expect(msg.content).toContain('结果如下')
    })
  })

  describe('parse - HYDRATION_INIT_STATE (HTML)', () => {
    it('从 HTML 中提取并解析对话', () => {
      const html = makeHydrationHtml({
        objectId: 'hyd-001',
        title: 'HTML 来源对话',
        messages: [
          { role: 'user', content: '从网页来', createdAt: '2024-01-01T00:00:00.000Z' }
        ]
      })
      const sessions = kimiImporter.parse(html)
      expect(sessions.length).toBe(1)
      expect(sessions[0].sourceId).toBe('hyd-001')
      expect(sessions[0].title).toBe('HTML 来源对话')
      expect(sessions[0].messages[0].content).toBe('从网页来')
    })

    it('conversation 子对象包裹的 hydration', () => {
      const html = makeHydrationHtml({
        conversation: {
          objectId: 'wrapped-1',
          title: '包裹',
          messages: [{ role: 'user', content: 'hi', createdAt: '2024-01-01T00:00:00.000Z' }]
        }
      })
      const sessions = kimiImporter.parse(html)
      expect(sessions.length).toBe(1)
      expect(sessions[0].sourceId).toBe('wrapped-1')
    })
  })

  describe('parse - 边界', () => {
    it('非法 JSON 返回空数组', () => {
      expect(kimiImporter.parse('not json')).toEqual([])
    })

    it('空消息对话被跳过', () => {
      const content = JSON.stringify([{ title: '空', messages: [] }])
      expect(kimiImporter.parse(content)).toEqual([])
    })
  })
})
