import { describe, it, expect } from 'vitest'
import { renderSessionToHtml } from '../../src/sharing/htmlExporter'
import type { ChatSession, Message } from '../../src/shared/types'

/**
 * htmlExporter 安全单测（报告 #2 / 任务 1）
 *
 * 重点验证 XSS 防御：
 * - javascript: / data: / file: / vbscript: 协议链接被剥离 href
 * - 用户输入的 HTML 特殊字符被转义（< > " ' &）
 * - 标题/描述/标签均经 escapeHtml
 * - <script> 标签注入失败（被转义为文本）
 */

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 's1',
    provider: 'ChatGPT',
    title: '测试对话',
    isFavorite: false,
    messageCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    importedAt: '2026-08-01T00:00:00.000Z',
    tags: [],
    messages: [],
    ...overrides
  }
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'user',
    content: '',
    order: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  }
}

describe('htmlExporter — XSS 防御', () => {
  describe('链接协议白名单', () => {
    it('允许 http/https/mailto 链接', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [
            makeMessage({
              role: 'assistant',
              content: '[官网](https://example.com) [邮件](mailto:a@b.com) [http](http://x.com)'
            })
          ]
        })
      )
      expect(html).toContain('href="https://example.com"')
      expect(html).toContain('href="mailto:a@b.com"')
      expect(html).toContain('href="http://x.com"')
      expect(html).toContain('rel="noopener"')
    })

    it('剥离 javascript: 协议链接（保留文本，无 href）', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [
            makeMessage({
              role: 'assistant',
              content: '[点我](javascript:alert(document.cookie))'
            })
          ]
        })
      )
      // 文本保留
      expect(html).toContain('点我')
      // 绝不出现 javascript: 或 href
      expect(html).not.toContain('javascript:')
      expect(html).not.toMatch(/href="[^"]*alert/)
    })

    it('剥离 data: 协议链接（防 data:text/html,<script>）', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [
            makeMessage({
              role: 'assistant',
              content: '[x](data:text/html,<script>alert(1)</script>)'
            })
          ]
        })
      )
      expect(html).not.toContain('data:text/html')
      expect(html).not.toContain('<script>alert(1)</script>')
    })

    it('剥离 file: / vbscript: 协议链接', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [
            makeMessage({
              role: 'assistant',
              content: '[a](file:///etc/passwd) [b](vbscript:msgbox(1))'
            })
          ]
        })
      )
      expect(html).not.toContain('file:')
      expect(html).not.toContain('vbscript:')
    })

    it('混合协议：仅保留安全链接', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [
            makeMessage({
              role: 'assistant',
              content: '[安全](https://ok.com) [恶意](javascript:alert(1)) [也安全](http://ok2.com)'
            })
          ]
        })
      )
      expect(html).toContain('href="https://ok.com"')
      expect(html).toContain('href="http://ok2.com"')
      expect(html).not.toContain('javascript:')
    })
  })

  describe('HTML 转义（escapeHtml）', () => {
    it('转义标题中的 < > " \' &', () => {
      const html = renderSessionToHtml(
        makeSession({ title: '<script>alert("x")</script>' })
      )
      expect(html).not.toContain('<script>alert("x")</script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('&quot;')
    })

    it('转义描述中的特殊字符', () => {
      const html = renderSessionToHtml(
        makeSession({ description: '<img src=x onerror=alert(1)>' })
      )
      expect(html).not.toContain('<img src=x onerror=')
      expect(html).toContain('&lt;img')
    })

    it('转义标签名中的特殊字符', () => {
      const html = renderSessionToHtml(
        makeSession({ tags: [{ id: 't1', name: '<b>evil</b>', createdAt: '2026-08-01' }] })
      )
      expect(html).toContain('&lt;b&gt;')
      expect(html).not.toContain('<b>evil</b>')
    })

    it('转义消息内容中的 HTML（先转义再渲染 markdown）', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [
            makeMessage({ role: 'user', content: '<script>alert("xss")</script>' })
          ]
        })
      )
      expect(html).not.toContain('<script>alert')
      expect(html).toContain('&lt;script&gt;')
    })

    it('转义行内代码内容中的 HTML', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [makeMessage({ role: 'user', content: '`<script>x</script>`' })]
        })
      )
      // 行内代码内的 <script> 也应被转义
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toMatch(/<code[^>]*><script>/)
    })
  })

  describe('代码块', () => {
    it('代码块内容转义，不执行其中的 <script>', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [
            makeMessage({
              role: 'assistant',
              content: '```html\n<script>alert(1)</script>\n```'
            })
          ]
        })
      )
      expect(html).not.toMatch(/<code><script>alert\(1\)<\/script><\/code>/)
      // 内部已被 escapeHtml 转义
      expect(html).toContain('&lt;script&gt;')
    })

    it('包含复制按钮', () => {
      const html = renderSessionToHtml(
        makeSession({
          messages: [makeMessage({ role: 'assistant', content: '```\ncode\n```' })]
        })
      )
      expect(html).toContain('MemoraCopyCode')
    })
  })
})

describe('htmlExporter — 结构正确性', () => {
  it('生成完整 HTML 文档结构', () => {
    const html = renderSessionToHtml(makeSession())
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
    expect(html).toContain('<style>')
  })

  it('包含水印（默认开启）', () => {
    const html = renderSessionToHtml(makeSession())
    expect(html).toContain('Memora')
    expect(html).toContain('Memora-footer')
  })

  it('可选关闭水印', () => {
    const html = renderSessionToHtml(makeSession(), { includeWatermark: false })
    // CSS 类定义仍在 <style> 中，但不应渲染 footer 元素
    expect(html).not.toMatch(/<footer[^>]*Memora-footer/)
  })

  it('自定义标题与描述覆盖 session 字段', () => {
    const html = renderSessionToHtml(makeSession({ title: '原标题' }), {
      customTitle: '自定义标题',
      customDescription: '自定义描述'
    })
    expect(html).toContain('自定义标题')
    expect(html).toContain('自定义描述')
    expect(html).not.toContain('原标题')
  })

  it('角色标签正确：user/assistant/system', () => {
    const html = renderSessionToHtml(
      makeSession({
        messages: [
          makeMessage({ role: 'user', content: 'hi' }),
          makeMessage({ role: 'assistant', content: 'hello' }),
          makeMessage({ role: 'system', content: 'sys' })
        ]
      })
    )
    expect(html).toContain('msg-user')
    expect(html).toContain('msg-assistant')
    expect(html).toContain('msg-system')
    expect(html).toContain('>你<')
    expect(html).toContain('>AI<')
    expect(html).toContain('>系统<')
  })

  it('空 messages 不报错', () => {
    expect(() => renderSessionToHtml(makeSession())).not.toThrow()
  })
})
