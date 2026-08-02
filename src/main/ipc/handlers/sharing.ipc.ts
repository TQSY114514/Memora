import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import { getSession } from '@db/repositories'
import { renderSessionToHtml, renderSessionToMd, renderSessionToClaudeCode, renderSessionToJson } from '@sharing'
import type { ChatSession } from '@shared/types'

export function registerSharingHandlers(): void {
  // ===== Sharing =====
  safeHandle(
    IPC.SHARE_EXPORT_HTML,
    (_e, sessionId: string, options?: { customTitle?: string; customDescription?: string }) => {
      const session = getSession(sessionId, true) as ChatSession | null
      if (!session) return null
      return renderSessionToHtml(session, options)
    }
  )

  // ===== 导出 Markdown =====
  safeHandle(
    IPC.SHARE_EXPORT_MD,
    (_e, sessionId: string, options?: { customTitle?: string; customDescription?: string }) => {
      const session = getSession(sessionId, true) as ChatSession | null
      if (!session) return null
      return renderSessionToMd(session, options)
    }
  )

  // ===== 导出 Claude Code jsonl（跨平台迁移：放进 ~/.claude/projects/ 即可被识别） =====
  safeHandle(
    IPC.SHARE_EXPORT_CLAUDE_CODE,
    (_e, sessionId: string, options?: { customTitle?: string; customDescription?: string }) => {
      const session = getSession(sessionId, true) as ChatSession | null
      if (!session) return null
      return renderSessionToClaudeCode(session, options)
    }
  )

  // ===== 导出通用 JSON（可导入其他 AI 工具 / OpenCode / 备份） =====
  safeHandle(
    IPC.SHARE_EXPORT_JSON,
    (_e, sessionId: string, options?: { customTitle?: string; customDescription?: string }) => {
      const session = getSession(sessionId, true) as ChatSession | null
      if (!session) return null
      return renderSessionToJson(session, options)
    }
  )
}
