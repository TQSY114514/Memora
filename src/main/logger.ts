/**
 * 全局结构化日志系统（v1.6.1）
 *
 * 分级日志 + 文件轮转 + 敏感信息过滤 + 导出支持
 * - 级别：debug < info < warn < error
 * - 自动写入 {userData}/logs/memora.log，单文件最大 5MB，保留 3 个轮转文件
 * - 敏感字段（apiKey、token、password 等）自动替换为 [REDACTED]
 * - 支持导出日志文件
 */
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, statSync, renameSync, appendFileSync } from 'fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

/** 敏感字段名（大小写不敏感） */
const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'token', 'password', 'secret', 'credential',
  'accesskey', 'secretkey', 'authorization', 'x-api-key',
  'accesstoken', 'refresh_token', 'sessionid', 'session_id',
  'privatekey', 'private_key', 'client_secret', 'clientsecret'
])

/** 敏感值模式（在日志消息中检测并脱敏） */
const SENSITIVE_VALUE_PATTERNS = [
  /(?:sk-|sk_ant-|sk-or-|Bearer\s)[A-Za-z0-9_-]{10,}/g,  // OpenAI/Anthropic/OrBearer
  /[A-Za-z0-9_-]{32,}\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,  // JWT
]

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_ROTATIONS = 3

class Logger {
  private minLevel: LogLevel = 'debug'
  private logDir: string
  private logFile: string

  constructor() {
    this.logDir = join(app.getPath('userData'), 'logs')
    this.logFile = join(this.logDir, 'memora.log')
    this.ensureDir()
  }

  private ensureDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
  }

  /** 设置最低日志级别 */
  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  /** 获取日志目录 */
  getLogDir(): string {
    return this.logDir
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString()
    const ctx = context ? ' ' + JSON.stringify(this.sanitize(context)) : ''
    // 对消息文本中的敏感值模式进行脱敏
    const safeMessage = this.redactValues(message)
    return `[${timestamp}] [${level.toUpperCase()}] ${safeMessage}${ctx}`
  }

  /** 对字符串中的敏感值模式（API Key、JWT 等）进行脱敏 */
  private redactValues(text: string): string {
    let result = text
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]')
    }
    return result
  }

  /** 过滤敏感字段（递归处理嵌套对象和数组） */
  private sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '')
      if (SENSITIVE_KEYS.has(lowerKey) || this.isSensitiveKey(key)) {
        result[key] = '[REDACTED]'
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? this.sanitize(item as Record<string, unknown>)
            : item
        )
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitize(value as Record<string, unknown>)
      } else if (typeof value === 'string') {
        result[key] = this.redactValues(value)
      } else {
        result[key] = value
      }
    }
    return result
  }

  private isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase()
    return SENSITIVE_KEYS.has(lower)
  }

  /** 轮转日志文件 */
  private rotate(): void {
    if (!existsSync(this.logFile)) return
    const stat = statSync(this.logFile)
    if (stat.size < MAX_FILE_SIZE) return

    // 删除最旧的轮转文件
    const oldest = `${this.logFile}.${MAX_ROTATIONS}`
    if (existsSync(oldest)) {
      try { require('fs').unlinkSync(oldest) } catch { /* ignore */ }
    }

    // 向后轮转
    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const old = `${this.logFile}.${i}`
      const next = `${this.logFile}.${i + 1}`
      if (existsSync(old)) {
        try { renameSync(old, next) } catch { /* ignore */ }
      }
    }

    // 轮转当前文件
    try { renameSync(this.logFile, `${this.logFile}.1`) } catch { /* ignore */ }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return

    const formatted = this.formatMessage(level, message, context)

    // 控制台输出
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    consoleFn(formatted)

    // 文件写入
    try {
      this.rotate()
      appendFileSync(this.logFile, formatted + '\n', 'utf-8')
    } catch (err) {
      console.error('[logger] 写入日志文件失败:', err)
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  /** 导出日志文件路径列表 */
  listLogFiles(): string[] {
    if (!existsSync(this.logDir)) return []
    const { readdirSync } = require('fs')
    return readdirSync(this.logDir)
      .filter((f: string) => f.startsWith('memora.log'))
      .map((f: string) => join(this.logDir, f))
      .sort()
  }
}

export const logger = new Logger()