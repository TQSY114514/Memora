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

/** 初始化数据库（建表 + 完整性检查 + 开启外键 + WAL + 版本化迁移） */
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

  // 性能优化：WAL 模式 + 外键约束
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')
  dbInstance.pragma('synchronous = NORMAL')

  // 启动时完整性自检：如果数据库损坏，尝试从备份恢复
  if (!isNewFile) {
    const healthy = checkIntegrity()
    if (!healthy) {
      // 数据库损坏 — 记录日志，尝试恢复
      console.error('[Database] Integrity check FAILED! Database may be corrupted.')
      // 尝试 integrity_check 的快速模式
      const quickResult = dbInstance.pragma('quick_check') as Array<{ quick_check: string }>
      if (quickResult.length > 0 && quickResult[0].quick_check !== 'ok') {
        console.error('[Database] Quick check details:', quickResult[0].quick_check)
      }
      // 不阻塞启动 — 让 schema/migration 尝试修复，最坏情况用户可从备份恢复
    }
  }

  // 建表（含 schema_version 表 + version 1/2 初始记录）
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
export function checkpointDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma('wal_checkpoint(TRUNCATE)')
      dbInstance.pragma('optimize')
    } catch {
      // 退出时检查点失败不阻塞退出
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
