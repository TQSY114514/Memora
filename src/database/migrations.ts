/**
 * 数据库迁移（版本化）
 *
 * 痛点：原 connection.ts 用硬编码 addColumnIfMissing，schema_version 表形同虚设。
 * 方案：每个迁移步骤带 version，runMigrations 按 version 顺序执行，
 * 已应用的（version <= 当前记录的 max version）自动跳过。
 *
 * 迁移记录写入 schema_version 表，每个 version 只应用一次。
 */
import type Database from 'better-sqlite3'

interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
}

/**
 * 迁移列表（按 version 升序）
 *
 * 新增迁移时，追加到数组末尾，version 递增。
 * 已发布的迁移不可修改（旧库可能已应用）。
 */
const migrations: Migration[] = [
  {
    version: 3,
    description: 'folders 表加 rule 列（智能文件夹）',
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(folders)').all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'rule')) {
        db.exec('ALTER TABLE folders ADD COLUMN rule TEXT')
      }
    }
  },
  {
    version: 4,
    description: 'embedding 列从 JSON TEXT → BLOB（Float32Array 二进制）',
    up: (db) => migrateEmbeddingsToBlob(db)
  }
]

/**
 * 把旧的 JSON TEXT 向量数据迁移为 BLOB（Float32Array buffer）
 * - 检测 embedding 列声明类型，TEXT 才迁移，BLOB 跳过
 * - 建新表 → 转换写入 → DROP 旧表 → RENAME
 */
function migrateEmbeddingsToBlob(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(message_embeddings)').all() as Array<{
    name: string
    type: string
  }>
  const embeddingCol = cols.find((c) => c.name === 'embedding')
  if (!embeddingCol) return // 表不存在（不应发生，建表已执行）

  // 已经是 BLOB 类型，无需迁移
  if (embeddingCol.type.toUpperCase() === 'BLOB') return

  // 列类型为 TEXT（旧库），需要迁移
  const countRow = db.prepare('SELECT COUNT(*) as n FROM message_embeddings').get() as { n: number }

  db.exec(`
    CREATE TABLE message_embeddings_new (
      id           TEXT PRIMARY KEY,
      message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      session_id   TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      embedding    BLOB NOT NULL,
      model        TEXT NOT NULL,
      dim          INTEGER NOT NULL,
      created_at   TEXT NOT NULL
    )
  `)

  if (countRow.n > 0) {
    const rows = db
      .prepare('SELECT id, message_id, session_id, embedding, model, dim, created_at FROM message_embeddings')
      .all() as Array<{
      id: string
      message_id: string
      session_id: string
      embedding: string
      model: string
      dim: number
      created_at: string
    }>
    const insert = db.prepare(
      'INSERT INTO message_embeddings_new (id, message_id, session_id, embedding, model, dim, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    const tx = db.transaction(() => {
      for (const r of rows) {
        const vec = JSON.parse(r.embedding) as number[]
        const buf = Buffer.from(new Float32Array(vec).buffer)
        insert.run(r.id, r.message_id, r.session_id, buf, r.model, r.dim, r.created_at)
      }
    })
    tx()
  }

  db.exec('DROP TABLE message_embeddings')
  db.exec('ALTER TABLE message_embeddings_new RENAME TO message_embeddings')
  db.exec('CREATE INDEX IF NOT EXISTS idx_embeddings_message ON message_embeddings(message_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_embeddings_session ON message_embeddings(session_id)')
  console.log(`[db] embedding 列已从 TEXT 迁移到 BLOB（${countRow.n} 条）`)
}

/** 读取当前已应用的最高版本（无记录返回 0） */
function getCurrentVersion(db: Database.Database): number {
  // schema_version 表由 schema.ts 创建（version 1/2 已 INSERT OR IGNORE）
  const row = db
    .prepare('SELECT MAX(version) as v FROM schema_version')
    .get() as { v: number | null } | undefined
  return row?.v ?? 0
}

/**
 * 执行所有待应用的迁移
 * - 按 version 升序应用
 * - 每个 migration 在独立事务中执行，失败则抛出（阻止启动）
 * - 应用成功后写入 schema_version 记录
 */
export function runMigrations(db: Database.Database): void {
  const current = getCurrentVersion(db)
  const pending = migrations.filter((m) => m.version > current)

  if (pending.length === 0) {
    return
  }

  for (const m of pending) {
    const applyMigration = db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        m.version,
        new Date().toISOString()
      )
    })
    applyMigration()
    console.log(`[db] 已应用迁移 v${m.version}: ${m.description}`)
  }
}
