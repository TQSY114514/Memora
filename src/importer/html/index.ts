import type { Importer, ParsedSession } from '../types'

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
        const text = block.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
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
        const text = block.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
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
      const bodyText = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
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