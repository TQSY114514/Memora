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

  return dbInstance
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
