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
  },
  {
    version: 5,
    description: 'session_summaries 加 knowledge / suggested_tags 列；建 knowledge_entries/fts/relations 表',
    up: (db) => migrateToKnowledgeVault(db)
  },
  {
    version: 6,
    description: '回填：把旧 session_summaries 的 key_points/todos 转为 knowledge_entries',
    up: (db) => backfillKnowledgeEntries(db)
  },
  {
    version: 7,
    description: '建 preferences + preferences_fts 表（Memory Lifecycle：用户偏好 + 冲突检测 + 衰减）',
    up: (db) => migrateToPreferences(db)
  },
  {
    version: 8,
    description: '复合索引优化（高频查询：消息排序、会话列表、知识过滤、偏好过滤）',
    up: (db) => {
      // messages: 按 session_id 过滤 + msg_order 排序（加载会话消息）
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_session_order ON messages(session_id, msg_order)')
      // chat_sessions: 按 updated_at 排序（列表页 ORDER BY updated_at DESC）
      db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at)')
      // knowledge_entries: 按 workspace_id + type 过滤（知识库列表查询）
      db.exec('CREATE INDEX IF NOT EXISTS idx_ke_workspace_type ON knowledge_entries(workspace_id, type)')
      // preferences: 按 workspace_id + status 过滤（偏好列表查询）
      db.exec('CREATE INDEX IF NOT EXISTS idx_pref_workspace_status ON preferences(workspace_id, status)')
    }
  },
  {
    version: 9,
    description: 'preferences 加 context 列（偏好冲突检测细化：同 subject 不同 context 可并存）',
    up: (db) => {
      // ALTER TABLE ADD COLUMN IF NOT EXISTS 在 SQLite 中不支持，需先检查
      const cols = db.prepare('PRAGMA table_info(preferences)').all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'context')) {
        db.exec('ALTER TABLE preferences ADD COLUMN context TEXT')
      }
      // 复合索引：按 workspace + subject + context 过滤（冲突检测查询）
      db.exec('CREATE INDEX IF NOT EXISTS idx_pref_workspace_subject_context ON preferences(workspace_id, subject, context)')
    }
  },
  {
    version: 10,
    description: 'chat_sessions 加 (source_id, provider) 唯一约束（幂等导入 DB 兜底，防并发重复）',
    up: (db) => dedupSessionsAndAddUniqueIndex(db)
  },
  {
    version: 11,
    description: '建 audit_logs 表（Memory Audit Log：追踪偏好/知识/会话的变更历史，含 before/after 值）',
    up: (db) => createAuditLogsTable(db)
  },
  {
    version: 12,
    description: '建 distillation_templates 表（自定义蒸馏模板：用户可定制记忆蒸馏的 system prompt）',
    up: (db) => createDistillationTemplatesTable(db)
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
        // 损坏的 embedding JSON 跳过，避免单条坏数据阻塞整个迁移导致应用无法启动
        let vec: number[]
        try {
          vec = JSON.parse(r.embedding) as number[]
          if (!Array.isArray(vec) || vec.length === 0) continue
        } catch {
          continue
        }
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

/**
 * v5：Knowledge Vault 基础设施
 * - session_summaries 加 knowledge / suggested_tags 列（可选，老数据为 NULL）
 * - 建 knowledge_entries / knowledge_fts / knowledge_relations 表
 *
 * 注：新库由 schema.ts 直接建表；本迁移服务旧库（已存在 session_summaries）。
 */
function migrateToKnowledgeVault(db: Database.Database): void {
  // session_summaries 加列（SQLite 不支持 ADD COLUMN IF NOT EXISTS，需检测）
  const summaryCols = db.prepare('PRAGMA table_info(session_summaries)').all() as Array<{ name: string }>
  if (!summaryCols.some((c) => c.name === 'knowledge')) {
    db.exec('ALTER TABLE session_summaries ADD COLUMN knowledge TEXT')
  }
  if (!summaryCols.some((c) => c.name === 'suggested_tags')) {
    db.exec('ALTER TABLE session_summaries ADD COLUMN suggested_tags TEXT')
  }

  // knowledge_entries（schema.ts 的新库已建，旧库这里幂等建）
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      session_id   TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
      type         TEXT NOT NULL CHECK(type IN ('knowledge','decision','task')),
      title        TEXT NOT NULL,
      content      TEXT,
      status       TEXT DEFAULT 'open',
      source       TEXT DEFAULT 'manual',
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_ke_workspace ON knowledge_entries(workspace_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entries(type)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_ke_session ON knowledge_entries(session_id)')

  // knowledge_fts
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      entry_id UNINDEXED,
      title,
      content,
      type UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `)

  // knowledge_relations
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_relations (
      from_id  TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
      to_id    TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id, relation)
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_kr_from ON knowledge_relations(from_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_kr_to ON knowledge_relations(to_id)')
}

/**
 * v6：回填——把旧 session_summaries 的 key_points/todos 转为 knowledge_entries
 * - key_points → type='decision'
 * - todos → type='task' (status='open')
 * - 通过 session_id 关联回原对话；workspace_id 从对话所属 folder 推导
 * - 幂等：用 session_id + title + type 去重（避免重复回填）
 */
function backfillKnowledgeEntries(db: Database.Database): void {
  // 读取所有 summary（含 session_id）
  const summaries = db
    .prepare('SELECT session_id, key_points, todos FROM session_summaries')
    .all() as Array<{ session_id: string; key_points: string | null; todos: string | null }>

  if (summaries.length === 0) return

  // 查 session → workspace_id 映射（经 folder）
  const sessionWsMap = new Map<string, string>()
  const sessions = db
    .prepare(
      `SELECT cs.id as sid, f.workspace_id as wid
       FROM chat_sessions cs
       LEFT JOIN folders f ON cs.folder_id = f.id`
    )
    .all() as Array<{ sid: string; wid: string | null }>
  for (const s of sessions) {
    if (s.wid) sessionWsMap.set(s.sid, s.wid)
  }

  const now = new Date().toISOString()
  let count = 0
  const insertEntry = db.prepare(
    `INSERT OR IGNORE INTO knowledge_entries
     (id, workspace_id, session_id, type, title, content, status, source, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ai-extract', ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    for (const sum of summaries) {
      const wsId = sessionWsMap.get(sum.session_id)
      if (!wsId) continue // 无工作区的跳过（避免 NOT NULL 约束失败）

      // 损坏的 JSON 跳过该 summary，避免单条坏数据阻塞迁移
      let keyPoints: string[] = []
      let todos: string[] = []
      try {
        keyPoints = sum.key_points ? (JSON.parse(sum.key_points) as string[]) : []
        todos = sum.todos ? (JSON.parse(sum.todos) as string[]) : []
      } catch {
        continue
      }

      keyPoints.forEach((kp, idx) => {
        const title = kp.slice(0, 120)
        // 去重：同 session + title + type 不重复插入
        const exists = db
          .prepare(
            `SELECT 1 FROM knowledge_entries WHERE session_id = ? AND title = ? AND type = 'decision'`
          )
          .get(sum.session_id, title)
        if (!exists) {
          insertEntry.run(
            `${sum.session_id}-dec-${idx}`,
            wsId,
            sum.session_id,
            'decision',
            title,
            kp,
            'active',
            idx,
            now,
            now
          )
          count++
        }
      })

      todos.forEach((td, idx) => {
        const title = td.slice(0, 120)
        const exists = db
          .prepare(
            `SELECT 1 FROM knowledge_entries WHERE session_id = ? AND title = ? AND type = 'task'`
          )
          .get(sum.session_id, title)
        if (!exists) {
          insertEntry.run(
            `${sum.session_id}-task-${idx}`,
            wsId,
            sum.session_id,
            'task',
            title,
            td,
            'open',
            idx,
            now,
            now
          )
          count++
        }
      })
    }
  })
  tx()
  console.log(`[db] v6 回填 ${count} 条 knowledge_entries`)
}

/**
 * v7：用户偏好表（Memory Lifecycle）
 * - preferences：结构化记忆（subject + value + confidence + status）
 * - preferences_fts：FTS5 全文索引
 *
 * 注：新库由 schema.ts 直接建表；本迁移服务旧库（已存在但无 preferences 表）。
 */
function migrateToPreferences(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS preferences (
      id              TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      session_id      TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
      subject         TEXT NOT NULL,
      value           TEXT NOT NULL,
      confidence      REAL DEFAULT 0.5,
      source          TEXT DEFAULT 'manual',
      status          TEXT DEFAULT 'active',
      superseded_by   TEXT REFERENCES preferences(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      last_accessed_at TEXT,
      access_count    INTEGER DEFAULT 0
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_pref_workspace ON preferences(workspace_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_pref_subject ON preferences(subject)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_pref_status ON preferences(status)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_pref_session ON preferences(session_id)')

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS preferences_fts USING fts5(
      pref_id UNINDEXED,
      subject,
      value,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `)
}

/**
 * v10：chat_sessions 加 (source_id, provider) 唯一约束
 * - partial unique index：仅 source_id IS NOT NULL 生效（手动新建无 source_id，不冲突）
 * - 建索引前先去重：同 (source_id, provider) 保留 updated_at 最新的一条，其余删除
 *   （messages / session_tags 等通过 ON DELETE CASCADE 自动清理）
 * - 去重逻辑放在事务里，与索引创建一起原子提交
 */
function dedupSessionsAndAddUniqueIndex(db: Database.Database): void {
  // 找出所有重复组（source_id NOT NULL，按 source_id+provider 分组，count>1）
  const dupGroups = db
    .prepare(
      `SELECT source_id, provider, COUNT(*) as cnt
       FROM chat_sessions
       WHERE source_id IS NOT NULL
       GROUP BY source_id, provider
       HAVING cnt > 1`
    )
    .all() as Array<{ source_id: string; provider: string; cnt: number }>

  if (dupGroups.length > 0) {
    const findKeepId = db.prepare(
      `SELECT id FROM chat_sessions
       WHERE source_id = ? AND provider = ?
       ORDER BY updated_at DESC, imported_at DESC LIMIT 1`
    )
    const deleteDuplicates = db.prepare(
      `DELETE FROM chat_sessions
       WHERE source_id = ? AND provider = ? AND id != ?`
    )

    const tx = db.transaction(() => {
      for (const g of dupGroups) {
        const keep = findKeepId.get(g.source_id, g.provider) as { id: string } | undefined
        if (!keep) continue
        const info = deleteDuplicates.run(g.source_id, g.provider, keep.id)
        if (info.changes > 0) {
          console.log(`[db] v10 去重: (${g.source_id}, ${g.provider}) 删除 ${info.changes} 条重复会话`)
        }
      }
    })
    tx()
  }

  // 建 partial unique index（NULL source_id 不参与，手动新建可重复）
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source_provider_unique
     ON chat_sessions(source_id, provider) WHERE source_id IS NOT NULL`
  )
}

/**
 * v11：Memory Audit Log 表
 * - 追踪偏好/知识/会话的变更（create/update/delete/archive/supersede/conflict_resolve）
 * - 记录 before/after 值（JSON），支持审计与回溯
 *
 * 注：新库由本迁移幂等建表；旧库已存在 schema_version 记录则自动跳过。
 */
function createAuditLogsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id           TEXT PRIMARY KEY,
      entity_type  TEXT NOT NULL,
      entity_id    TEXT NOT NULL,
      action       TEXT NOT NULL,
      before_value TEXT,
      after_value  TEXT,
      workspace_id TEXT,
      session_id   TEXT,
      reason       TEXT,
      created_at   TEXT NOT NULL
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)')
}

/**
 * v12：蒸馏模板表（Custom Distillation Templates）
 * - 用户可自定义记忆蒸馏的 system prompt（替代 summarizer.ts 中硬编码的 SYSTEM_PROMPT）
 * - 内置 3 个模板：默认 / 技术决策 / 学习笔记（is_builtin=1，不可删除）
 *
 * 注：新库由 schema.ts 直接建表；本迁移服务旧库并幂等插入内置模板。
 */
function createDistillationTemplatesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS distillation_templates (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT,
      system_prompt TEXT NOT NULL,
      output_format TEXT DEFAULT 'json',
      is_builtin    INTEGER DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    )
  `)

  const now = new Date().toISOString()
  const insertBuiltin = db.prepare(
    `INSERT OR IGNORE INTO distillation_templates
     (id, name, description, system_prompt, output_format, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  )

  // 内置默认模板：与 summarizer.ts 的 SYSTEM_PROMPT 保持一致
  const defaultPrompt = `你是一个 AI 对话总结助手。用户会给你一段 AI 对话记录，请生成结构化总结。

输出格式（严格 JSON，不要 markdown 代码块包裹）：
{
  "summary": "2-3 段对话摘要，概括讨论的主题、过程和结论",
  "keyPoints": ["关键决定1", "关键要点2", "..."],
  "todos": ["待办事项1", "待办事项2", "..."],
  "knowledge": ["可复用知识要点1", "可复用知识要点2", "..."],
  "suggestedTags": ["建议标签1", "建议标签2", "..."],
  "preferences": [{"subject": "类别", "value": "值"}, ...]
}

要求：
- summary 用中文，简洁清晰，不超过 300 字
- keyPoints 提取对话中做出的关键决定、重要结论、核心要点（3-8 条）
- todos 提取对话中提到的待办事项、后续行动项（若没有则返回空数组）
- knowledge 提取对话中产生的、未来可复用的知识要点（如技术原理、最佳实践、踩坑经验；若没有则返回空数组）
- suggestedTags 提取 2-5 个能概括对话主题的简短标签（不带 # 号，每个 2-6 字）
- preferences 提取对话中反映的用户偏好（如用户提到喜欢/使用/选择某物）。subject 是类别（如 music/phone/language/editor/framework/food/hobby），value 是具体值。只提取明确表达的偏好，不要推断。若没有则返回空数组
- 如果对话内容很短或无实质内容，所有数组字段可以为空`

  const technicalDecisionPrompt = `你是技术决策记录专家。请分析对话并提取：
1. 背景：为什么需要这个决策
2. 方案：考虑了哪些方案
3. 决策：最终选择了什么
4. 理由：为什么这样选择

输出JSON: { "summary": "...", "keyPoints": [...], "knowledge": [...], "preferences": [...], "decision": { "background": "...", "options": [...], "choice": "...", "rationale": "..." } }`

  const learningNotesPrompt = `你是学习笔记整理专家。请从对话中提取知识点，按以下结构整理：
1. 主题：讨论的核心主题
2. 关键概念：需要理解的重要概念
3. 知识要点：可复用的知识点
4. 实践建议：如何应用这些知识

输出JSON: { "summary": "...", "keyPoints": [...], "knowledge": [...], "preferences": [...], "learningNotes": { "topic": "...", "concepts": [...], "practices": [...] } }`

  const tx = db.transaction(() => {
    insertBuiltin.run(
      'builtin-default',
      '默认模板',
      '通用的 AI 对话总结模板，提取摘要、关键要点、待办、知识与偏好',
      defaultPrompt,
      'json',
      now,
      now
    )
    insertBuiltin.run(
      'builtin-technical-decision',
      '技术决策模板',
      '聚焦技术决策记录：背景、方案、决策与理由',
      technicalDecisionPrompt,
      'json',
      now,
      now
    )
    insertBuiltin.run(
      'builtin-learning-notes',
      '学习笔记模板',
      '从对话中提取知识点并整理为学习笔记结构',
      learningNotesPrompt,
      'json',
      now,
      now
    )
  })
  tx()
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
