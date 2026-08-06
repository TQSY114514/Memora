import type { Importer, ParsedSession } from '../types'

/**
 * 从 HTML 中提取纯文本（字符级扫描标签，兼容标签属性中的 < 与引号）。
 * - 先整块剔除 script/style/注释，避免其内容被误当作正文
 * - 然后按字符状态机逐个剥离 <...> 标签
 * - 最后解码常见 HTML 实体并压缩空白
 */
function extractText(html: string): string {
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  let out = ''
  let inTag = false
  let inQuote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inTag) {
      if (inQuote) {
        if (ch === inQuote) inQuote = null
      } else if (ch === '"' || ch === "'") {
        inQuote = ch
      } else if (ch === '>') {
        inTag = false
      }
    } else if (ch === '<') {
      inTag = true
    } else {
      out += ch
    }
  }

  return out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 通用 HTML 导入器
 * 解析 AI 对话导出/分享页面（HTML 格式）
 * 支持常见的对话 HTML 结构：message 块、对话块、pre 标签等
 */
export const htmlImporter: Importer = {
  provider: 'Unknown',
  detect(filename: string, _content: string): boolean {
    return filename.toLowerCase().endsWith('.html') || filename.toLowerCase().endsWith('.htm')
  },

  parse(content: string): ParsedSession[] {
    const sessions: ParsedSession[] = []

    // 尝试提取标题
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : '导入的对话'

    // 尝试提取消息块：多种模式匹配
    const messages: ParsedSession['messages'] = []

    // 模式1: 查找 user/assistant 消息块（常见于 AI 对话导出）
    const messageBlocks = content.match(/<div[^>]*class="[^"]*(?:message|chat|conversation)[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || []

    if (messageBlocks.length > 0) {
      for (const block of messageBlocks) {
        const role = block.match(/class="[^"]*(?:user|human|you)[^"]*"/i) ? 'user'
          : block.match(/class="[^"]*(?:assistant|ai|bot|model|gpt)[^"]*"/i) ? 'assistant'
          : undefined
        if (!role) continue

        // 提取文本内容（去除 HTML 标签）
        const text = extractText(block)
        if (text) {
          messages.push({
            role: role as 'user' | 'assistant',
            content: text,
            createdAt: new Date().toISOString()
          })
        }
      }
    }

    // 模式2: 查找 <p> <pre> 等文本块，按角色交替
    if (messages.length === 0) {
      const textBlocks = content.match(/<(?:p|pre|div)[^>]*>([\s\S]*?)<\/(?:p|pre|div)>/gi) || []
      let isUser = true
      for (const block of textBlocks) {
        const text = extractText(block)
        if (text.length > 20) {
          messages.push({
            role: isUser ? 'user' : 'assistant',
            content: text,
            createdAt: new Date().toISOString()
          })
          isUser = !isUser
        }
      }
    }

    // 模式3: 纯文本提取（最后兜底）
    if (messages.length === 0) {
      const bodyText = extractText(content)
      // 按对话分隔符或换行分段
      const segments = bodyText.split(/\n{2,}/).filter(s => s.trim().length > 20)
      let isUser = true
      for (const seg of segments) {
        messages.push({
          role: isUser ? 'user' : 'assistant',
          content: seg.trim(),
          createdAt: new Date().toISOString()
        })
        isUser = !isUser
      }
    }

    if (messages.length > 0) {
      const now = new Date().toISOString()
      sessions.push({
        title,
        provider: 'Unknown',
        createdAt: now,
        updatedAt: now,
        messages
      })
    }

    return sessions
  }
}