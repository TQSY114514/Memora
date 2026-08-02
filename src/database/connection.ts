import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, chmodSync } from 'fs'
import { SCHEMA_SQL } from './schema'
import { runMigrations } from './migrations'

let dbInstance: Database.Database | null = null

/** 获取数据库文件路径（用户数据目录下） */
export function getDbPath(): string {
  const userDataDir = app.getPath('userData')
  const dataDir = join(userDataDir, 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return join(dataDir, 'Memora.db')
}

/** 检查数据库完整性，返回 true 表示健康 */
export function checkIntegrity(): boolean {
  if (!dbInstance) return false
  try {
    const result = dbInstance.pragma('integrity_check') as Array<{ integrity_check: string }>
    return result.length > 0 && result[0].integrity_check === 'ok'
  } catch {
    return false
  }
}

/** 初始化数据库（建表 + 完整性检查 + 开启外键 + WAL + busy_timeout + 版本化迁移） */
/** Fast integrity check (quick_check), used at startup. Much cheaper than full integrity_check. */
export function quickCheckIntegrity(): boolean {
  if (!dbInstance) return false
  try {
    const result = dbInstance.pragma('quick_check') as Array<{ quick_check: string }>
    return result.length > 0 && result[0].quick_check === 'ok'
  } catch {
    return false
  }
}

/** Full integrity check (slow on large DBs). Call after the window is shown. */
export function runFullIntegrityCheck(): { ok: boolean; detail?: string } {
  if (!dbInstance) return { ok: false, detail: 'database not initialized' }
  try {
    const result = dbInstance.pragma('integrity_check') as Array<{ integrity_check: string }>
    const ok = result.length > 0 && result[0].integrity_check === 'ok'
    return { ok, detail: ok ? undefined : result[0]?.integrity_check }
  } catch (e) {
    return { ok: false, detail: String(e) }
  }
}

export function initDatabase(dbPath?: string): Database.Database {
  if (dbInstance) return dbInstance

  const path = dbPath ?? getDbPath()
  const isNewFile = !existsSync(path)
  dbInstance = new Database(path)

  // 新建数据库时设置文件权限为 0600（仅当前用户可读写），保护对话隐私
  // Windows 上 chmod 效果有限（NTFS ACL 不受 0600 影响），但 Linux/macOS 生效
  if (isNewFile) {
    try {
      chmodSync(path, 0o600)
    } catch {
      // 权限设置失败不阻塞启动
    }
  }

  // 性能优化：WAL 模式 + 外键约束 + 写冲突重试
  // busy_timeout：MCP Server 是独立进程，与主进程共享同一 DB 文件，
  // WAL 允许并发读但写互斥，busy_timeout 让写冲突时等待而非立即抛 SQLITE_BUSY
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')
  dbInstance.pragma('synchronous = NORMAL')
  dbInstance.pragma('busy_timeout = 5000')

  // 启动时完整性自检：如果数据库损坏，尝试从备份恢复
  // Startup self-check: use quick_check first (fast), escalate to full integrity_check only on failure.
  // The full integrity_check on a large DB can take seconds, so it is deferred to runFullIntegrityCheck()
  // after the window is shown (see src/main/index.ts).
  if (!isNewFile) {
    const quickOk = quickCheckIntegrity()
    if (!quickOk) {
      const full = runFullIntegrityCheck()
      if (!full.ok) {
        console.error('[Database] Integrity check FAILED! Database may be corrupted.', full.detail ?? '')
      }
    }
  }

  dbInstance.exec(SCHEMA_SQL)

  // 版本化迁移（version 3+ 的增量变更）
  runMigrations(dbInstance)

  // 启动时优化查询计划（轻量：SQLite 自动判断是否需要 ANALYZE，首次启动几乎无开销）
  try {
    dbInstance.pragma('optimize')
  } catch {
    // 优化失败不阻塞启动
  }

  return dbInstance
}

/** 退出前检查点：将 WAL 日志写回主库文件，避免 WAL 文件膨胀导致下次启动变慢 */
export function checkpointDatabase(mode: 'PASSIVE' | 'TRUNCATE' = 'PASSIVE'): void {
  if (dbInstance) {
    try {
      // PASSIVE does not block other connections; TRUNCATE forces a full reset of the WAL.
      dbInstance.pragma(`wal_checkpoint(${mode})`)
      dbInstance.pragma('optimize')
    } catch {
      // checkpoint failure should not block other flows
    }
  }
}
/** 获取数据库实例（必须先 initDatabase） */
export function getDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return dbInstance
}

/** 关闭数据库 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
