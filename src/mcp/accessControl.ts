/**
 * MCP 访问控制（v1.8）
 *
 * 安全默认：默认只读。需显式 opt-in 才能写入或执行破坏性操作。
 * handler 逻辑见 server.ts 的 callTool。
 */

import { logger } from '../main/logger'

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
  'summarize_session'
])

/** 破坏性工具列表（需 --destructive 额外开启，默认拒绝） */
export const DESTRUCTIVE_TOOLS = new Set([
  'delete_session',
  'knowledge_entry_delete',
  'memory_forget'
])

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
