import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { app } from 'electron'
import { resolve, normalize } from 'path'
import { logger } from '../logger'

/**
 * IPC 频率限制器（防滥用/暴力调用）
 *
 * 每个通道维护一个滑动窗口，限制单位时间内的最大调用次数。
 * 超限时抛出错误，阻止执行。
 */
const RATE_LIMIT_WINDOW_MS = 10_000  // 10 秒窗口
const RATE_LIMIT_MAX_CALLS = 60      // 每窗口最大调用次数

const rateLimitMap = new Map<string, number[]>()

function checkRateLimit(channel: string): void {
  const now = Date.now()
  const timestamps = rateLimitMap.get(channel) ?? []
  // 清除窗口外的记录
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX_CALLS) {
    throw new Error(`[IPC] ${channel} 调用频率超限（${RATE_LIMIT_MAX_CALLS}次/${RATE_LIMIT_WINDOW_MS / 1000}秒）`)
  }
  recent.push(now)
  rateLimitMap.set(channel, recent)
}

/**
 * 共享 IPC 处理器包装：统一 try/catch + 日志 + 频率限制
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
      checkRateLimit(channel)
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

/**
 * 允许导入/扫描的根目录白名单（深度防御）。
 *
 * 渲染进程被 XSS 攻破后可能向 IMPORT_FILE / SCANNER_SCAN 等 IPC 通道
 * 传入任意路径读取主进程可达文件。本白名单把可访问范围限制在：
 * - userData 及其子目录（应用自身数据）
 * - Downloads / Documents / Desktop（用户主动导入的常见位置）
 *
 * 原则：白名单优先于黑名单，路径遍历（..）通过 normalize + startsWith 一并防御。
 *
 * @returns 通过校验的绝对路径（已 normalize）
 */
export function assertSafePath(path: unknown, field = 'path'): string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4096) {
    throw new Error(`[IPC] 非法 ${field}`)
  }
  if (path.includes('\u0000')) {
    throw new Error(`[IPC] 非法 ${field}: 含空字节`)
  }
  // 绝对路径化 + 规范化（消除 .. 和 .）
  const normalized = normalize(resolve(path))

  // 构建白名单根目录集合（resolve 保证绝对路径，与 path 的 resolve 一致）
  const allowedRoots: string[] = []
  for (const name of ['userData', 'downloads', 'documents', 'desktop'] as const) {
    try {
      allowedRoots.push(normalize(resolve(app.getPath(name))))
    } catch {
      // 某些系统目录可能不可用，跳过
    }
  }
  // 必须位于某个白名单根目录之下（startsWith 带 normalize 已防 ../ 绕过）
  const isAllowed = allowedRoots.some((root) => {
    // 精确匹配根目录本身，或 root + 分隔符开头（避免 /userDatattacker 绕过）
    return normalized === root || normalized.startsWith(root + '\\') || normalized.startsWith(root + '/')
  })
  if (!isAllowed) {
    throw new Error(`[IPC] 非法 ${field}: 路径不在允许范围内`)
  }
  return normalized
}

/** 校验路径数组（批量操作） */
export function assertSafePaths(paths: unknown, field = 'paths'): string[] {
  if (!Array.isArray(paths)) {
    throw new Error(`[IPC] 非法 ${field}: 期望数组`)
  }
  if (paths.length > 10000) {
    throw new Error(`[IPC] ${field} 数量超限（>10000）`)
  }
  return paths.map((p) => assertSafePath(p, field))
}
