import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { app } from 'electron'
import { resolve, normalize } from 'path'
import { logger } from '../logger'

/**
 * IPC 频率限制器（防滥用/暴力调用）
 *
 * 按通道分級限流：
 * - 读操作（list/get/search/scan）：120 次/10 秒
 * - 写操作（create/update/delete/import/extract）：30 次/10 秒
 * - 敏感操作（backup/secret/ai）：10 次/10 秒
 * - 默认：60 次/10 秒
 */
const RATE_LIMIT_WINDOW_MS = 10_000

type RateLimitTier = 'read' | 'write' | 'sensitive' | 'default'
const TIER_LIMITS: Record<RateLimitTier, number> = {
  read: 120,
  write: 30,
  sensitive: 10,
  default: 60
}

/** 通道名 → 限流层级映射（按前缀匹配） */
function getRateLimitTier(channel: string): RateLimitTier {
  // 敏感操作：备份、密钥、AI 调用
  if (/^(backup:|secret:|ai:|db:vacuum|db:clean|system:import|system:export)/.test(channel)) {
    return 'sensitive'
  }
  // 写操作：创建/更新/删除/导入/导出/提取
  if (/^(import:|scanner:scan|scanner:extract|folder:create|folder:update|folder:delete|session:update|session:delete|session:move|session:batch|tag:create|tag:delete|tag:attach|tag:detach|workspace:create|workspace:update|workspace:delete|knowledge:create|knowledge:update|knowledge:delete|knowledge:toggle|knowledge:relation|knowledge:extract|pref:create|pref:update|pref:delete|pref:archive|pref:decay|memory:lifecycle|share:export|import:bg-start|import:bg-stop|import:bg-run-once|import:bg-config-set)/.test(channel)) {
    return 'write'
  }
  // 读操作：列表/获取/搜索
  if (/^(workspace:list|workspace:tree|folder:list|session:get|session:list|session:list-by-rule|tag:list|knowledge:list|knowledge:get|knowledge:search|knowledge:count|knowledge:related|knowledge:graph|pref:list|pref:get|pref:search|pref:count|pref:profile|pref:conflicts|memory:tiered|memory:health|memory:profile-summary|search:|scanner:get|scanner:detect|stats:get|backup:list|backup:config-get|log:|app:get|ai:embed:status|ai:embed:local|ai:summary:get|ai:related|ai:test|ai:config-file-load|ai:config-file-set-active|import:bg-status|import:bg-config-get|secret:encryption)/.test(channel)) {
    return 'read'
  }
  return 'default'
}

const rateLimitMap = new Map<string, number[]>()

function checkRateLimit(channel: string): void {
  const tier = getRateLimitTier(channel)
  const maxCalls = TIER_LIMITS[tier]
  const now = Date.now()
  const timestamps = rateLimitMap.get(channel) ?? []
  // 清除窗口外的记录
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= maxCalls) {
    throw new Error(`[IPC] ${channel} 调用频率超限（${maxCalls}次/${RATE_LIMIT_WINDOW_MS / 1000}秒）`)
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
