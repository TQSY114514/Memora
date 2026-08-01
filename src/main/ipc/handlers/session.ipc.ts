import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  getSession,
  listSessions,
  updateSession,
  deleteSession,
  moveSession,
  toggleFavorite,
  listTags,
  createTag,
  deleteTag,
  attachTag,
  detachTag,
  listSessionsByRule
} from '@db/repositories'

export function registerSessionHandlers(): void {
  // ===== Session =====
  safeHandle(IPC.SESSION_GET, (_e, id: string, withMessages = true) =>
    getSession(id, withMessages)
  )
  safeHandle(
    IPC.SESSION_LIST,
    (_e, options?: Parameters<typeof listSessions>[0]) => listSessions(options)
  )
  safeHandle(IPC.SESSION_UPDATE, (_e, id: string, patch: Parameters<typeof updateSession>[1]) =>
    updateSession(id, patch)
  )
  safeHandle(IPC.SESSION_DELETE, (_e, id: string) => deleteSession(id))
  safeHandle(IPC.SESSION_MOVE, (_e, id: string, folderId: string | null) =>
    moveSession(id, folderId)
  )
  safeHandle(IPC.SESSION_TOGGLE_FAVORITE, (_e, id: string) => toggleFavorite(id))

  // ===== Tag =====
  safeHandle(IPC.TAG_LIST, () => listTags())
  safeHandle(IPC.TAG_CREATE, (_e, input: Parameters<typeof createTag>[0]) => createTag(input))
  safeHandle(IPC.TAG_DELETE, (_e, id: string) => deleteTag(id))
  safeHandle(IPC.TAG_ATTACH, (_e, sessionId: string, tagId: string) =>
    attachTag(sessionId, tagId)
  )
  safeHandle(IPC.TAG_DETACH, (_e, sessionId: string, tagId: string) =>
    detachTag(sessionId, tagId)
  )

  // ===== 批量操作 =====
  safeHandle(IPC.SESSION_BATCH_DELETE, (_e, ids: string[]) => {
    let deleted = 0
    for (const id of ids) {
      try {
        deleteSession(id)
        deleted++
      } catch {
        // 单条失败跳过
      }
    }
    return { deleted, total: ids.length }
  })

  safeHandle(IPC.SESSION_BATCH_MOVE, (_e, ids: string[], folderId: string | null) => {
    let moved = 0
    for (const id of ids) {
      try {
        moveSession(id, folderId)
        moved++
      } catch {
        // 单条失败跳过
      }
    }
    return { moved, total: ids.length }
  })

  // ===== 智能文件夹：按规则列出会话 =====
  safeHandle(IPC.SESSION_LIST_BY_RULE, (_e, workspaceId: string, rule: any) => {
    return listSessionsByRule(workspaceId, rule)
  })
}
