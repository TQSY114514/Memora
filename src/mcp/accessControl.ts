/**
 * MCP 访问控制（v1.8 → v2.0）
 *
 * 三级权限控制：
 * 1. 环境变量模式（默认）：通过 MEMORA_WRITE / MEMORA_DESTRUCTIVE 控制
 * 2. 数据库模式（v1.10）：通过 mcp_client_permissions 表按客户端粒度控制
 * 3. 字段级权限（v2.0）：通过 mcp_field_permissions 表按字段/主题控制
 *
 * 当数据库中配置了客户端权限时，优先使用数据库模式。
 * 否则回退到环境变量模式（向后兼容）。
 *
 * handler 逻辑见 server.ts 的 callTool。
 */

import { logger } from '../main/logger'
import { checkMcpPermission } from '../database/repositories/mcpPermissionsRepo'

// ===== MCP 访问控制（v1.8） =====
// 安全默认：默认只读。需显式 opt-in 才能写入或执行破坏性操作。
//   MEMORA_WRITE=true / --write         开启普通写操作（add/update/create）
//   MEMORA_DESTRUCTIVE=true / --destructive  额外开启删除类操作（delete/forget）
// 旧版 MEMORA_READONLY / --readonly 仍向后兼容（显式声明只读）。
export const isReadOnly =
  process.env['MEMORA_READONLY'] === 'true' ||
  process.argv.includes('--readonly')
export const isWriteEnabled =
  !isReadOnly &&
  (process.env['MEMORA_WRITE'] === 'true' ||
    process.argv.includes('--write'))
export const isDestructiveEnabled =
  isWriteEnabled &&
  (process.env['MEMORA_DESTRUCTIVE'] === 'true' ||
    process.argv.includes('--destructive'))

/** 写入工具列表（需 --write 开启） */
export const WRITE_TOOLS = new Set([
  'add_session',
  'add_message',
  'memory_write',
  'memory_save_preference',
  'update_session',
  'create_folder',
  'knowledge_entry_update',
  'summarize_session',
  'memory_consolidate',
  'memory_feedback'
])

/** 破坏性工具列表（需 --destructive 额外开启，默认拒绝） */
export const DESTRUCTIVE_TOOLS = new Set([
  'delete_session',
  'knowledge_entry_delete',
  'memory_forget'
])

// ===== 工具白名单模式 =====
// 管理员可通过 MEMORA_ALLOWED_TOOLS 环境变量限制 MCP 可用的工具子集。
// 格式：逗号分隔的工具名列表，如 "search_sessions,get_session,memory_recall"
// 未设置时允许所有工具（向后兼容）。
const allowedToolsEnv = process.env['MEMORA_ALLOWED_TOOLS']?.trim()
export const ALLOWED_TOOLS: Set<string> | null = allowedToolsEnv
  ? new Set(allowedToolsEnv.split(',').map((t) => t.trim()).filter(Boolean))
  : null

/** 检查工具是否在白名单中允许 */
export function isToolAllowed(name: string): boolean {
  if (ALLOWED_TOOLS === null) return true  // 未设置白名单，允许全部
  return ALLOWED_TOOLS.has(name)
}

/**
 * 检查客户端是否有权限执行指定工具（v1.10 数据库模式）。
 *
 * 优先使用数据库中的客户端权限配置，
 * 如果数据库中没有配置任何客户端权限，则回退到环境变量模式。
 *
 * @param clientId - MCP 客户端标识（如 'claude-desktop'）
 * @param toolName - 工具名称
 * @returns 权限检查结果
 */
export function checkClientPermission(clientId: string, toolName: string): {
  allowed: boolean
  reason: string
  level: string
  useDatabase: boolean
} {
  try {
    const result = checkMcpPermission(clientId, toolName)
    if (result.level === 'inherit') {
      // 数据库中没有配置，回退到环境变量
      return { allowed: result.allowed, reason: result.reason, level: 'env', useDatabase: false }
    }
    return { ...result, useDatabase: true }
  } catch {
    // 数据库检查失败，回退到环境变量
    return { allowed: true, reason: 'database check failed, falling back to env', level: 'env', useDatabase: false }
  }
}

/** 审计日志：记录写/破坏性工具的调用，便于追溯 */
export function auditToolCall(name: string, args: Record<string, unknown>, allowed: boolean, reason?: string): void {
  logger.info('[MCP audit] tool call', {
    tool: name,
    allowed,
    reason,
    args: sanitizeArgs(args)
  })
}

/** 脱敏参数（隐藏过长的 message 内容，只保留长度信息） */
export function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 200) {
      out[k] = `<string len=${v.length}>`
    } else {
      out[k] = v
    }
  }
  return out
}

// ===== 字段级权限（v2.0） =====

/**
 * 字段级权限类别
 *
 * 允许用户按主题类别控制 AI 客户端能访问哪些数据。
 * 例如：允许 Claude 读取技术偏好，但禁止读取个人聊天。
 */
export const FIELD_CATEGORIES = {
  tech: {
    name: '技术相关',
    keywords: ['技术栈', '编程', '开发', 'tech', 'stack', 'language', 'framework', 'TypeScript', 'Python', 'Rust', 'Go', 'React', 'Electron', 'SQLite', 'Vite', 'Tailwind', 'Node.js', 'Docker', 'Git', 'GitHub', 'VSCode', 'Cursor', '编辑器', 'IDE', '项目', 'project'],
    tools: ['memory_recall', 'memory_profile', 'memory_write', 'memory_save_preference', 'preference_search', 'knowledge_search', 'project_context']
  },
  personal: {
    name: '个人信息',
    keywords: ['地址', '邮箱', 'email', '电话', 'phone', '手机', '身份证', '生日', '年龄', '姓名', '住址', '位置', 'location', '家庭', 'family', '密码', 'password', '银行卡', '收入', '财务'],
    tools: ['memory_recall', 'memory_profile', 'preference_search']
  },
  communication: {
    name: '沟通偏好',
    keywords: ['风格', 'style', '简洁', '详细', '格式', 'format', 'Markdown', '语言', 'language', '回答方式', '避免', 'avoid'],
    tools: ['memory_recall', 'memory_profile', 'preference_search']
  },
  project: {
    name: '项目信息',
    keywords: ['项目', 'project', '开发', '应用', 'app', '系统', 'system', '架构', 'architecture', '部署', 'deploy', '发布', 'release'],
    tools: ['memory_recall', 'memory_profile', 'project_context', 'knowledge_search', 'decision_search']
  }
} as const

export type FieldCategory = keyof typeof FIELD_CATEGORIES

/**
 * 检查客户端是否有权访问指定的偏好/知识类别
 *
 * 通过环境变量 MEMORA_FIELD_RESTRICTIONS 配置字段级限制。
 * 格式：clientId:category1,category2（多个客户端用 ; 分隔，多个类别用 , 分隔）
 *
 * 示例：
 *   MEMORA_FIELD_RESTRICTIONS="claude:tech,project;cursor:tech,communication,project"
 *   表示 Claude 只能访问 tech + project，Cursor 可以访问 tech + communication + project
 */
const fieldRestrictionsEnv = process.env['MEMORA_FIELD_RESTRICTIONS']?.trim()

function parseFieldRestrictions(): Map<string, Set<FieldCategory>> {
  const map = new Map<string, Set<FieldCategory>>()
  if (!fieldRestrictionsEnv) return map

  const clientConfigs = fieldRestrictionsEnv.split(';')
  for (const config of clientConfigs) {
    const [clientId, categories] = config.split(':')
    if (!clientId || !categories) continue

    const allowedCategories = categories
      .split(',')
      .map((c) => c.trim())
      .filter((c): c is FieldCategory => c in FIELD_CATEGORIES)

    if (allowedCategories.length > 0) {
      map.set(clientId.trim(), new Set(allowedCategories))
    }
  }

  return map
}

const fieldRestrictions = parseFieldRestrictions()

/**
 * 检查客户端是否允许访问指定偏好条目
 *
 * @param clientId - MCP 客户端标识
 * @param preferenceSubject - 偏好主题
 * @param preferenceValue - 偏好值
 * @returns 是否允许访问
 */
export function checkFieldAccess(
  clientId: string,
  preferenceSubject: string,
  preferenceValue: string
): boolean {
  const restrictions = fieldRestrictions.get(clientId)
  if (!restrictions) return true // 客户端没有限制，允许全部

  const text = `${preferenceSubject} ${preferenceValue}`.toLowerCase()

  for (const category of restrictions) {
    const cat = FIELD_CATEGORIES[category]
    if (cat.keywords.some((k) => text.includes(k.toLowerCase()))) {
      return true
    }
  }

  return false
}

/**
 * 检查客户端对指定工具的字段级访问范围
 *
 * 返回该客户端可以访问的类别列表。
 * 如果返回 null，表示无限制（允许全部）。
 */
export function getClientFieldAccess(clientId: string): Set<FieldCategory> | null {
  const restrictions = fieldRestrictions.get(clientId)
  return restrictions ?? null
}

/**
 * 过滤偏好列表，只保留客户端有权访问的条目
 */
export function filterPreferencesByFieldAccess(
  clientId: string,
  prefs: Array<{ subject: string; value: string; [key: string]: unknown }>
): Array<{ subject: string; value: string; [key: string]: unknown }> {
  const restrictions = fieldRestrictions.get(clientId)
  if (!restrictions) return prefs

  return prefs.filter((p) => checkFieldAccess(clientId, p.subject, p.value))
}

/** 获取字段级权限配置状态（用于调试和 UI 展示） */
export function getFieldPermissionsStatus(): {
  configured: boolean
  clients: Array<{ clientId: string; categories: string[] }>
} {
  return {
    configured: fieldRestrictions.size > 0,
    clients: Array.from(fieldRestrictions.entries()).map(([clientId, categories]) => ({
      clientId,
      categories: Array.from(categories).map((c) => FIELD_CATEGORIES[c].name)
    }))
  }
}
