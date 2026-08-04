import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  createSharedWorkspace,
  generateInviteCode,
  createComment,
  checkVisibility,
  threadComments,
  getReplies,
  type SharedWorkspace,
  type WorkspaceMember,
  type MemoryVisibility,
  type MemoryComment
} from '../../../team/teamWorkspace'
import {
  encryptSharedWorkspace,
  importSharedWorkspace,
  type EncryptedSharedWorkspace
} from '../../../sharing/encryptedWorkspace'
import {
  getWorkspace,
  listPreferences,
  getConstitution,
  listEntries,
  listAuditLogs
} from '@db/repositories'

const teamDir = join(app.getPath('userData'), 'team')
const storePath = join(teamDir, 'workspaces.json')

interface TeamStore {
  workspaces: SharedWorkspace[]
  comments: MemoryComment[]
  visibilities: MemoryVisibility[]
}

/** 原子写入持久化文件：先写 .tmp，全部完成后 rename 覆盖，避免中途崩溃留下损坏数据 */
function persistStore(store: TeamStore): void {
  if (!existsSync(teamDir)) mkdirSync(teamDir, { recursive: true })
  const tmpPath = storePath + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8')
  renameSync(tmpPath, storePath)
}

function loadStore(): TeamStore {
  try {
    if (!existsSync(storePath)) return { workspaces: [], comments: [], visibilities: [] }
    const raw = readFileSync(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<TeamStore>
    return {
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      visibilities: Array.isArray(parsed.visibilities) ? parsed.visibilities : []
    }
  } catch {
    return { workspaces: [], comments: [], visibilities: [] }
  }
}

const store: TeamStore = loadStore()

export function registerTeamHandlers(): void {
  // 创建工作区
  safeHandle(IPC.TEAM_CREATE_WORKSPACE, (_e, name: string, description: string, createdBy: string) => {
    const ws = createSharedWorkspace(name, description, createdBy)
    store.workspaces.push(ws)
    persistStore(store)
    return ws
  })

  // 列出工作区
  safeHandle(IPC.TEAM_LIST_WORKSPACES, () => {
    return store.workspaces
  })

  // 生成邀请码
  safeHandle(IPC.TEAM_GENERATE_INVITE, () => {
    return generateInviteCode()
  })

  // 加入工作区
  safeHandle(IPC.TEAM_JOIN_WORKSPACE, (_e, workspaceId: string, member: WorkspaceMember) => {
    const ws = store.workspaces.find(w => w.id === workspaceId)
    if (!ws) return { success: false, error: '工作区不存在' }
    ws.members.push(member)
    persistStore(store)
    return { success: true }
  })

  // 设置可见性
  safeHandle(IPC.TEAM_SET_VISIBILITY, (_e, visibility: MemoryVisibility) => {
    const idx = store.visibilities.findIndex(v => v.entryId === visibility.entryId)
    if (idx === -1) {
      store.visibilities.push(visibility)
    } else {
      store.visibilities[idx] = visibility
    }
    persistStore(store)
    return visibility
  })

  // 获取可见性
  safeHandle(IPC.TEAM_GET_VISIBILITY, (_e, entryId: string) => {
    return store.visibilities.find(v => v.entryId === entryId) ?? null
  })

  // 检查可见性
  safeHandle(IPC.TEAM_CHECK_VISIBILITY, (_e, entryId: string, memberId: string) => {
    const v = store.visibilities.find(v => v.entryId === entryId)
    if (!v) return true // 默认可见
    return checkVisibility(v, memberId)
  })

  // 添加评论
  safeHandle(IPC.TEAM_ADD_COMMENT, (_e, entryId: string, entityType: 'knowledge' | 'preference', author: string, content: string, replyTo?: string) => {
    const comment = createComment(entryId, entityType, author, content, replyTo ?? null)
    store.comments.push(comment)
    persistStore(store)
    return comment
  })

  // 列出评论
  safeHandle(IPC.TEAM_LIST_COMMENTS, (_e, entryId: string) => {
    const entryComments = store.comments.filter(c => c.entryId === entryId)
    return threadComments(entryComments)
  })

  // 获取回复
  safeHandle(IPC.TEAM_GET_REPLIES, (_e, parentId: string) => {
    return getReplies(store.comments, parentId)
  })

  // 解决评论
  safeHandle(IPC.TEAM_RESOLVE_COMMENT, (_e, commentId: string) => {
    const comment = store.comments.find(c => c.id === commentId)
    if (!comment) return false
    comment.resolved = true
    persistStore(store)
    return true
  })

  // ===== 加密导出工作区记忆（多 Agent / 团队安全共享） =====
  safeHandle(IPC.TEAM_EXPORT_ENCRYPTED, (_e, workspaceId: string, password: string) => {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      throw new Error('[IPC] 导出失败：工作区 ID 为空')
    }
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('[IPC] 导出失败：密码不能为空')
    }
    const workspace = getWorkspace(workspaceId)
    const preferences = listPreferences({ workspaceId, limit: 100000 })
    const constitution = getConstitution(workspaceId)
    const knowledge = listEntries({ workspaceId, limit: 100000 })
    const auditLogs = listAuditLogs({ workspaceId, limit: 100000 })
    return encryptSharedWorkspace({
      workspace: { id: workspaceId, name: workspace?.name || 'unknown' },
      preferences,
      constitution,
      knowledge,
      auditLogs
    }, password)
  })

  // ===== 加密导入共享工作区 =====
  safeHandle(IPC.TEAM_IMPORT_ENCRYPTED, (_e, payload: EncryptedSharedWorkspace, password: string, targetWorkspaceId: string) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('[IPC] 导入失败：载荷格式错误')
    }
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('[IPC] 导入失败：密码不能为空')
    }
    if (typeof targetWorkspaceId !== 'string' || targetWorkspaceId.length === 0) {
      throw new Error('[IPC] 导入失败：目标工作区 ID 为空')
    }
    return importSharedWorkspace(payload, password, targetWorkspaceId)
  })
}