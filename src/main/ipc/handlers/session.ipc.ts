import { safeHandle, assertSafeId, assertSafeIds } from '../safeHandle'
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
  safeHandle(IPC.SESSION_DELETE, (_e, id: string) => deleteSession(assertSafeId(id)))
  safeHandle(IPC.SESSION_MOVE, (_e, id: string, folderId: string | null) =>
    moveSession(assertSafeId(id), folderId)
  )
  safeHandle(IPC.SESSION_TOGGLE_FAVORITE, (_e, id: string) => toggleFavorite(assertSafeId(id)))

  // ===== Tag =====
  safeHandle(IPC.TAG_LIST, () => listTags())
  safeHandle(IPC.TAG_CREATE, (_e, input: Parameters<typeof createTag>[0]) => createTag(input))
  safeHandle(IPC.TAG_DELETE, (_e, id: string) => deleteTag(assertSafeId(id)))
  safeHandle(IPC.TAG_ATTACH, (_e, sessionId: string, tagId: string) =>
    attachTag(assertSafeId(sessionId, 'sessionId'), assertSafeId(tagId, 'tagId'))
  )
  safeHandle(IPC.TAG_DETACH, (_e, sessionId: string, tagId: string) =>
    detachTag(assertSafeId(sessionId, 'sessionId'), assertSafeId(tagId, 'tagId'))
  )

  // ===== 批量操作 =====
  safeHandle(IPC.SESSION_BATCH_DELETE, (_e, ids: string[]) => {
    const safeIds = assertSafeIds(ids)
    let deleted = 0
    for (const id of safeIds) {
      try {
        deleteSession(id)
        deleted++
      } catch {
        // 单条失败跳过
      }
    }
    return { deleted, total: safeIds.length }
  })

  safeHandle(IPC.SESSION_BATCH_MOVE, (_e, ids: string[], folderId: string | null) => {
    const safeIds = assertSafeIds(ids)
    let moved = 0
    for (const id of safeIds) {
      try {
        moveSession(id, folderId)
        moved++
      } catch {
        // 单条失败跳过
      }
    }
    return { moved, total: safeIds.length }
  })

  // ===== 智能文件夹：按规则列出会话 =====
  safeHandle(IPC.SESSION_LIST_BY_RULE, (_e, workspaceId: string, rule: any) => {
    return listSessionsByRule(workspaceId, rule)
  })
}
