import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { logger } from '../logger'

/**
 * 共享 IPC 处理器包装：统一 try/catch + 日志
 *
 * 所有 ipcMain.handle 调用都应通过此函数注册，
 * 确保异常被捕获并记录，未处理异常不会导致进程崩溃。
 */
export function safeHandle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => any
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      logger.error(`[IPC] ${channel} failed`, { error: String(err) })
      throw err  // Electron 会传给 renderer 的 reject
    }
  })
}

/**
 * 安全 ID 校验（深度防御，防被攻破的渲染进程注入 SQL/路径字符）。
 * 仅允许字母、数字、连字符；长度 1-64。用于所有 delete/update/move 类 IPC 入参。
 * 抛出错误时会被 safeHandle 的 try/catch 捕获并记录。
 */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export function assertSafeId(id: unknown, field = 'id'): string {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`[IPC] 非法 ${field}: ${String(id).slice(0, 32)}`)
  }
  return id
}

/** 校验 ID 数组（批量操作） */
export function assertSafeIds(ids: unknown, field = 'ids'): string[] {
  if (!Array.isArray(ids)) {
    throw new Error(`[IPC] 非法 ${field}: 期望数组`)
  }
  if (ids.length > 1000) {
    throw new Error(`[IPC] ${field} 数量超限（>1000）`)
  }
  return ids.map((id) => assertSafeId(id, field))
}

/**
 * 安全文件名校验（防路径遍历，用于备份文件操作）。
 * 禁止路径分隔符、.. 与空字节，仅允许常见文件名字符。
 */
export function assertSafeFilename(name: unknown, field = 'filename'): string {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new Error(`[IPC] 非法 ${field}`)
  }
  if (/[\\/]/.test(name) || name.includes('\u0000') || name === '.' || name === '..' || name.includes('..')) {
    throw new Error(`[IPC] 非法 ${field}: 含路径分隔符`)
  }
  return name
}
