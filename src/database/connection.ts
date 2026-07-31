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

/** 初始化数据库（建表 + 开启外键 + WAL + 版本化迁移） */
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
