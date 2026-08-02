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

const workspaces: SharedWorkspace[] = []
const comments: MemoryComment[] = []
const visibilities: MemoryVisibility[] = []

export function registerTeamHandlers(): void {
  // 创建工作区
  safeHandle(IPC.TEAM_CREATE_WORKSPACE, (_e, name: string, description: string, createdBy: string) => {
    const ws = createSharedWorkspace(name, description, createdBy)
    workspaces.push(ws)
    return ws
  })

  // 列出工作区
  safeHandle(IPC.TEAM_LIST_WORKSPACES, () => {
    return workspaces
  })

  // 生成邀请码
  safeHandle(IPC.TEAM_GENERATE_INVITE, () => {
    return generateInviteCode()
  })

  // 加入工作区
  safeHandle(IPC.TEAM_JOIN_WORKSPACE, (_e, workspaceId: string, member: WorkspaceMember) => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws) return { success: false, error: '工作区不存在' }
    ws.members.push(member)
    return { success: true }
  })

  // 设置可见性
  safeHandle(IPC.TEAM_SET_VISIBILITY, (_e, visibility: MemoryVisibility) => {
    const idx = visibilities.findIndex(v => v.entryId === visibility.entryId)
    if (idx === -1) {
      visibilities.push(visibility)
    } else {
      visibilities[idx] = visibility
    }
    return visibility
  })

  // 获取可见性
  safeHandle(IPC.TEAM_GET_VISIBILITY, (_e, entryId: string) => {
    return visibilities.find(v => v.entryId === entryId) ?? null
  })

  // 检查可见性
  safeHandle(IPC.TEAM_CHECK_VISIBILITY, (_e, entryId: string, memberId: string) => {
    const v = visibilities.find(v => v.entryId === entryId)
    if (!v) return true // 默认可见
    return checkVisibility(v, memberId)
  })

  // 添加评论
  safeHandle(IPC.TEAM_ADD_COMMENT, (_e, entryId: string, entityType: 'knowledge' | 'preference', author: string, content: string, replyTo?: string) => {
    const comment = createComment(entryId, entityType, author, content, replyTo ?? null)
    comments.push(comment)
    return comment
  })

  // 列出评论
  safeHandle(IPC.TEAM_LIST_COMMENTS, (_e, entryId: string) => {
    const entryComments = comments.filter(c => c.entryId === entryId)
    return threadComments(entryComments)
  })

  // 获取回复
  safeHandle(IPC.TEAM_GET_REPLIES, (_e, parentId: string) => {
    return getReplies(comments, parentId)
  })

  // 解决评论
  safeHandle(IPC.TEAM_RESOLVE_COMMENT, (_e, commentId: string) => {
    const comment = comments.find(c => c.id === commentId)
    if (!comment) return false
    comment.resolved = true
    return true
  })
}