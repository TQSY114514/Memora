import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/database/migrations'

/**
 * v14 迁移测试：message_embeddings.message_id 唯一索引
 *
 * 用真实 better-sqlite3 in-memory 库构造 v13 状态库（message_embeddings 含重复
 * message_id 行、旧非唯一索引 idx_embeddings_message 仍在、schema_version 记录到 v13），
 * 跑 runMigrations 验证：重复行被清理、唯一索引建立、旧索引删除、v14 已记录、幂等、唯一约束生效。
 *
 * 与 test/unit/opencode-extractor.test.ts 相同的处理：postinstall 默认装的是 Electron
 * ABI 的二进制，系统 node（vitest）下 new Database() 会因 NODE_MODULE_VERSION 不匹配抛错，
 * 此时跳过真实 DB 测试（CI/开发环境装有匹配 ABI 时才会真正执行）。
 */
let nativeAvailable = false
try {
  const probe = new Database(':memory:')
  probe.close()
  nativeAvailable = true
} catch {
  nativeAvailable = false
}

/** 构造 v13 状态库：message_embeddings 含同 message_id 重复行 + 旧非唯一索引 */
function createV13Db(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_version (version, applied_at) VALUES (13, '2026-01-01T00:00:00.000Z');

    CREATE TABLE chat_sessions (
      id           TEXT PRIMARY KEY,
      provider     TEXT NOT NULL,
      title        TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      imported_at  TEXT NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'persistent'
    );

    CREATE TABLE messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      msg_order   INTEGER NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE message_embeddings (
      id           TEXT PRIMARY KEY,
      message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      session_id   TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      embedding    BLOB NOT NULL,
      model        TEXT NOT NULL,
      dim          INTEGER NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX idx_embeddings_message ON message_embeddings(message_id);
  `)

  db.prepare(
    `INSERT INTO chat_sessions (id, provider, title, created_at, updated_at, imported_at)
     VALUES ('s1', 'ChatGPT', '会话', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  ).run()
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, msg_order, created_at)
     VALUES ('m1', 's1', 'user', 'hi', 0, '2026-01-01T00:00:00.000Z')`
  ).run()

  // 同一 message_id=m1 的两条重复向量（created_at 不同，迁移应保留最新一条）
  const ins = db.prepare(
    `INSERT INTO message_embeddings (id, message_id, session_id, embedding, model, dim, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const buf = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer)
  ins.run('e-old', 'm1', 's1', buf, 'model-x', 3, '2026-01-01T00:00:00.000Z')
  ins.run('e-new', 'm1', 's1', buf, 'model-x', 3, '2026-02-01T00:00:00.000Z')
  return db
}

/** 从 index_list 读出索引名 → 是否唯一 */
function indexMap(db: Database.Database): Map<string, boolean> {
  const rows = db.prepare(`PRAGMA index_list('message_embeddings')`).all() as Array<{
    name: string
    unique: number
  }>
  return new Map(rows.map((r) => [r.name, r.unique === 1]))
}

describe.skipIf(!nativeAvailable)('migrations v14（message_embeddings 唯一索引）', () => {
  it('重复 message_id 行被清理为每条一行，且保留 created_at 最新的一条', () => {
    const db = createV13Db()
    runMigrations(db)

    const rows = db
      .prepare('SELECT id, message_id, created_at FROM message_embeddings ORDER BY created_at DESC')
      .all() as Array<{ id: string; message_id: string; created_at: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('e-new') // 保留 created_at 较新的重复行
    expect(rows[0].message_id).toBe('m1')
    db.close()
  })

  it('建立唯一索引 idx_embeddings_message_unique，删除旧非唯一索引 idx_embeddings_message', () => {
    const db = createV13Db()
    runMigrations(db)

    const idx = indexMap(db)
    expect(idx.get('idx_embeddings_message_unique')).toBe(true)
    expect(idx.has('idx_embeddings_message')).toBe(false) // 旧索引已被 DROP
    db.close()
  })

  it('schema_version 记录到 v14', () => {
    const db = createV13Db()
    runMigrations(db)

    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number }
    expect(row.v).toBe(14)
    db.close()
  })

  it('幂等：迁移完成后再次调用 runMigrations 不报错', () => {
    const db = createV13Db()
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()

    const idx = indexMap(db)
    expect(idx.get('idx_embeddings_message_unique')).toBe(true)
    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number }
    expect(row.v).toBe(14)
    db.close()
  })

  it('唯一约束生效：对同一 message_id 插入第二行抛出 UNIQUE 错误', () => {
    const db = createV13Db()
    runMigrations(db)

    const buf = Buffer.from(new Float32Array([0.9, 0.9, 0.9]).buffer)
    const insert = db.prepare(
      `INSERT INTO message_embeddings (id, message_id, session_id, embedding, model, dim, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    expect(() =>
      insert.run('e-dup', 'm1', 's1', buf, 'model-x', 3, '2026-03-01T00:00:00.000Z')
    ).toThrow(/UNIQUE/)
    db.close()
  })
})
