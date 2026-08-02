/**
 * 团队记忆共享模块
 *
 * 支持协作工作区、记忆可见性控制和评论系统。
 * 采用本地优先架构，共享数据通过 E2E 加密同步。
 */

/** 可见性级别 */
export type Visibility = 'private' | 'shared_read' | 'shared_write' | 'shared_admin'

/** 共享工作区 */
export interface SharedWorkspace {
  id: string
  name: string
  description: string
  /** 邀请码 */
  inviteCode: string
  /** 创建者 */
  createdBy: string
  createdAt: string
  /** 成员列表 */
  members: WorkspaceMember[]
  /** 默认可见性 */
  defaultVisibility: Visibility
}

/** 工作区成员 */
export interface WorkspaceMember {
  id: string
  name: string
  role: 'admin' | 'editor' | 'viewer'
  joinedAt: string
}

/** 记忆条目可见性 */
export interface MemoryVisibility {
  entryId: string
  entityType: 'knowledge' | 'preference'
  visibility: Visibility
  /** 允许查看的成员 ID 列表 */
  allowedMembers: string[]
}

/** 评论 */
export interface MemoryComment {
  id: string
  entryId: string
  entityType: 'knowledge' | 'preference'
  author: string
  content: string
  createdAt: string
  /** 回复的评论 ID */
  replyTo: string | null
  /** 是否已解决 */
  resolved: boolean
}

/** 生成邀请码 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** 创建共享工作区 */
export function createSharedWorkspace(
  name: string,
  description: string,
  createdBy: string
): SharedWorkspace {
  return {
    id: `team_${Date.now()}`,
    name,
    description,
    inviteCode: generateInviteCode(),
    createdBy,
    createdAt: new Date().toISOString(),
    members: [{
      id: createdBy,
      name: '创建者',
      role: 'admin',
      joinedAt: new Date().toISOString()
    }],
    defaultVisibility: 'shared_read'
  }
}

/** 检查成员对条目的可见性 */
export function checkVisibility(
  visibility: MemoryVisibility,
  memberId: string
): boolean {
  if (visibility.visibility === 'private') return false
  if (visibility.visibility === 'shared_admin') {
    return visibility.allowedMembers.includes(memberId)
  }
  // shared_read 和 shared_write 对所有成员可见
  return true
}

/** 检查成员是否有写入权限 */
export function canWrite(
  member: WorkspaceMember,
  visibility: MemoryVisibility
): boolean {
  if (member.role === 'admin') return true
  if (member.role === 'editor' && visibility.visibility !== 'shared_read') return true
  return visibility.visibility === 'shared_write' &&
    visibility.allowedMembers.includes(member.id)
}

/** 创建评论 */
export function createComment(
  entryId: string,
  entityType: 'knowledge' | 'preference',
  author: string,
  content: string,
  replyTo: string | null = null
): MemoryComment {
  return {
    id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    entryId,
    entityType,
    author,
    content,
    createdAt: new Date().toISOString(),
    replyTo,
    resolved: false
  }
}

/** 格式化评论列表为线程 */
export function threadComments(comments: MemoryComment[]): MemoryComment[] {
  return comments
    .filter(c => !c.replyTo)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

/** 获取评论的回复 */
export function getReplies(
  comments: MemoryComment[],
  parentId: string
): MemoryComment[] {
  return comments
    .filter(c => c.replyTo === parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}