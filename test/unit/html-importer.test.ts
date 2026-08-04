import { describe, it, expect } from 'vitest'
import { htmlImporter } from '@importer/html'

describe('htmlImporter', () => {
  describe('detect', () => {
    it('识别 .html 文件', () => {
      expect(htmlImporter.detect('export.html', '')).toBe(true)
    })

    it('识别 .htm 文件', () => {
      expect(htmlImporter.detect('export.htm', '')).toBe(true)
    })

    it('拒绝非 html 文件', () => {
      expect(htmlImporter.detect('export.txt', '')).toBe(false)
    })
  })

  describe('parse', () => {
    it('从 title 标签提取标题，解析 message 块', () => {
      const html = `<html><head><title>对话记录</title></head><body>
        <div class="message user-block">你好，这是什么？</div>
        <div class="message assistant-block">这是测试。</div>
      </body></html>`
      const sessions = htmlImporter.parse(html)
      expect(sessions.length).toBe(1)
      expect(sessions[0].title).toBe('对话记录')
      expect(sessions[0].provider).toBe('Unknown')
      // user 块被识别为 user，assistant 块被识别为 assistant
      expect(sessions[0].messages[0].role).toBe('user')
      expect(sessions[0].messages[0].content).toContain('你好')
      expect(sessions[0].messages[1].role).toBe('assistant')
    })

    it('无 message 块时回退到 p/pre 文本块交替角色', () => {
      const html = `<html><body><p>这是一段较长的用户问题文本内容，用于测试解析器是否能够正确提取角色</p><pre>这是回复的代码块内容，包含一些示例代码片段用于测试</pre></body></html>`
      const sessions = htmlImporter.parse(html)
      expect(sessions.length).toBe(1)
      expect(sessions[0].messages[0].role).toBe('user')
      expect(sessions[0].messages[1].role).toBe('assistant')
    })

    it('无 title 时使用默认标题', () => {
      const html = `<div class="message user">你好</div>`
      const sessions = htmlImporter.parse(html)
      expect(sessions[0].title).toBe('导入的对话')
    })

    it('无消息时返回空数组', () => {
      expect(htmlImporter.parse('<html><body>empty</body></html>')).toEqual([])
    })
  })
})