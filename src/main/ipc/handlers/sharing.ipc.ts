import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/constants'
import { getSession } from '@db/repositories'
import { renderSessionToHtml, renderSessionToMd, renderSessionToClaudeCode } from '@sharing'
import type { ChatSession } from '@shared/types'

function safeHandle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      console.error(`[IPC] ${channel} failed:`, err)
      throw err  // Electron 会传给 renderer 的 reject
    }
  })
}

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
}
