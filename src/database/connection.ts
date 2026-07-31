import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { SCHEMA_SQL } from './schema'

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

/** 初始化数据库（建表 + 开启外键 + WAL） */
export function initDatabase(dbPath?: string): Database.Database {
  if (dbInstance) return dbInstance

  const path = dbPath ?? getDbPath()
  dbInstance = new Database(path)

  // 性能优化：WAL 模式 + 外键约束
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')
  dbInstance.pragma('synchronous = NORMAL')

  // 建表
  dbInstance.exec(SCHEMA_SQL)

  // 迁移：为已有数据库加新字段（ALTER TABLE 不支持 IF NOT EXISTS，需手动检查）
  const addColumnIfMissing = (table: string, column: string, def: string) => {
    const cols = dbInstance!.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!cols.some(c => c.name === column)) {
      dbInstance!.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
    }
  }
  addColumnIfMissing('folders', 'rule', 'TEXT')


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
