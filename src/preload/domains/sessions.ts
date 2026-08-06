import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type { ChatSession, Message, Tag, FolderRule } from '@shared/types'

// ===== Session =====
export const session = {
  get: (id: string, withMessages = true): Promise<ChatSession | null> =>
    ipcRenderer.invoke(IPC.SESSION_GET, id, withMessages),
  /** Paginated session messages (msg_order ASC); huge sessions avoid one-shot full transfer. */
  listMessages: (
    id: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]> => ipcRenderer.invoke(IPC.SESSION_LIST_MESSAGES, id, options),
  list: (options?: {
    folderId?: string
    provider?: string
    favorite?: boolean
    limit?: number
    offset?: number
  }): Promise<ChatSession[]> => ipcRenderer.invoke(IPC.SESSION_LIST, options),
  update: (
    id: string,
    patch: Partial<Pick<ChatSession, 'title' | 'description' | 'folderId' | 'isFavorite'>>
  ): Promise<void> => ipcRenderer.invoke(IPC.SESSION_UPDATE, id, patch),
  delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SESSION_DELETE, id),
  move: (id: string, folderId: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.SESSION_MOVE, id, folderId),
  toggleFavorite: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SESSION_TOGGLE_FAVORITE, id),
  /** 按智能文件夹规则列出会话 */
  listByRule: (workspaceId: string, rule: FolderRule): Promise<ChatSession[]> =>
    ipcRenderer.invoke(IPC.SESSION_LIST_BY_RULE, workspaceId, rule),
  /** 标记/取消临时会话（v1.15）：temporary 时设置过期时间 */
  setTemporary: (
    id: string,
    type: 'temporary' | 'persistent',
    days?: number
  ): Promise<void> => ipcRenderer.invoke(IPC.SESSION_SET_TEMPORARY, id, type, days),
  /** 清理已过期临时会话，返回清理数量 */
  cleanupExpired: (): Promise<number> => ipcRenderer.invoke(IPC.SESSION_CLEANUP_EXPIRED)
}

// ===== Tag =====
export const tag = {
  list: (): Promise<Tag[]> => ipcRenderer.invoke(IPC.TAG_LIST),
  create: (input: { name: string; color?: string }): Promise<Tag> =>
    ipcRenderer.invoke(IPC.TAG_CREATE, input),
  delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAG_DELETE, id),
  attach: (sessionId: string, tagId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TAG_ATTACH, sessionId, tagId),
  detach: (sessionId: string, tagId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TAG_DETACH, sessionId, tagId)
}

// ===== 批量操作 =====
export const batch = {
  deleteSessions: (ids: string[]): Promise<{ deleted: number; total: number }> =>
    ipcRenderer.invoke(IPC.SESSION_BATCH_DELETE, ids),
  moveSessions: (
    ids: string[],
    folderId: string | null
  ): Promise<{ moved: number; total: number }> =>
    ipcRenderer.invoke(IPC.SESSION_BATCH_MOVE, ids, folderId)
}