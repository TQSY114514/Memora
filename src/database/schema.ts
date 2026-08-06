/**
 * SQLite Schema 建表语句
 * 所有 DDL 集中在此，便于版本管理和迁移
 */
export const SCHEMA_SQL = `
-- 工作区
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 文件夹（支持嵌套）
CREATE TABLE IF NOT EXISTS folders (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER DEFAULT 0,
  rule          TEXT,              -- 智能文件夹规则（JSON，null=普通文件夹）
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

-- 对话会话
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            TEXT PRIMARY KEY,
  source_id     TEXT,
  provider      TEXT NOT NULL,
  model         TEXT,
  title         TEXT NOT NULL,
  description   TEXT,
  folder_id     TEXT REFERENCES folders(id) ON DELETE SET NULL,
  is_favorite   INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  imported_at   TEXT NOT NULL,
  session_type  TEXT NOT NULL DEFAULT 'persistent',  -- persistent（常驻）/ temporary（临时会话，到期自动清理）
  expires_at    TEXT                                 -- 临时会话过期时间（temporary 时有效）
);
CREATE INDEX IF NOT EXISTS idx_sessions_folder ON chat_sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON chat_sessions(provider);
CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON chat_sessions(is_favorite);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON chat_sessions(source_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON chat_sessions(created_at);
-- 幂等导入兜底：同来源同 provider 只允许一条会话（partial index：NULL source_id 不冲突，手动新建可重复）
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source_provider_unique
  ON chat_sessions(source_id, provider) WHERE source_id IS NOT NULL;

-- 消息
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  model       TEXT,
  tokens      INTEGER,
  msg_order   INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- 标签
CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  color      TEXT,
  created_at TEXT NOT NULL
);

-- 对话-标签 关联
CREATE TABLE IF NOT EXISTS session_tags (
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_session_tags_tag ON session_tags(tag_id);

-- FTS5 全文索引（标题 + 内容）
CREATE VIRTUAL TABLE IF NOT EXISTS chat_fts USING fts5(
  session_id UNINDEXED,
  title,
  content,
  provider UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Schema 版本记录
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, datetime('now'));

-- AI 总结（Phase 2）
-- 每个会话最多一条 summary（更新时覆盖）
CREATE TABLE IF NOT EXISTS session_summaries (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL UNIQUE REFERENCES chat_sessions(id) ON DELETE CASCADE,
  summary      TEXT NOT NULL,       -- 整体摘要
  key_points   TEXT,                -- JSON 数组：关键决定/要点
  todos        TEXT,                -- JSON 数组：待办事项
  model        TEXT,                -- 生成总结所用模型
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(session_id);

-- 向量嵌入（Phase 2：语义搜索）
-- 每条消息一个向量，维度由模型决定（OpenAI text-embedding-3-small = 1536）
-- 存为 BLOB（Float32Array 的二进制 buffer），读取零解析，性能远优于 JSON TEXT
CREATE TABLE IF NOT EXISTS message_embeddings (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  embedding    BLOB NOT NULL,       -- Float32Array 二进制 buffer
  model        TEXT NOT NULL,       -- 嵌入模型名
  dim          INTEGER NOT NULL,    -- 向量维度
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embeddings_message ON message_embeddings(message_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_session ON message_embeddings(session_id);

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (2, datetime('now'));

-- 智能文件夹：兼容已有数据库加 rule 字段
-- ALTER TABLE ADD COLUMN 不会因列已存在而报错（SQLite 不支持 IF NOT EXISTS，用 try-catch 在应用层处理）

-- 知识条目（Knowledge Vault v1.1）
-- 决策/待办/知识三类一等公民实体，可独立于对话存在
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
);
CREATE INDEX IF NOT EXISTS idx_ke_workspace ON knowledge_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entries(type);
CREATE INDEX IF NOT EXISTS idx_ke_session ON knowledge_entries(session_id);

-- 知识全文索引（标题+内容，复用 Intl.Segmenter 中文分词）
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  entry_id UNINDEXED,
  title,
  content,
  type UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- 知识关系（Memory Graph 轻量关系）
CREATE TABLE IF NOT EXISTS knowledge_relations (
  from_id  TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  to_id    TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_kr_from ON knowledge_relations(from_id);
CREATE INDEX IF NOT EXISTS idx_kr_to ON knowledge_relations(to_id);

-- 用户偏好（Preference 实体，v1.4 Memory Lifecycle）
-- 结构化记忆：用户喜欢什么、用什么、偏好什么
-- 支持冲突检测（同 subject 不同 value → 旧记忆标记 superseded）和置信度衰减
CREATE TABLE IF NOT EXISTS preferences (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id      TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,           -- 偏好类别：music / phone / language / editor...
  value           TEXT NOT NULL,           -- 偏好值：初音未来 / android / Python...
  context         TEXT,                    -- 偏好上下文（v1.8 #9）：区分"写脚本用 Python"和"系统编程用 Rust"，同 subject 不同 context 可并存
  confidence      REAL DEFAULT 0.5,        -- 置信度 0.0-1.0
  source          TEXT DEFAULT 'manual',   -- conversation / manual / mcp / inferred
  status          TEXT DEFAULT 'active',   -- active / superseded / archived
  superseded_by   TEXT REFERENCES preferences(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  last_accessed_at TEXT,
  access_count    INTEGER DEFAULT 0,
  valid_at        TEXT,          -- 时态记忆（v1.15）：生效时间（null=无限制）
  invalid_at      TEXT,          -- 失效时间（null=永不过期；过期偏好检索时自动过滤）
  temporal_type   TEXT DEFAULT 'permanent'  -- permanent / temporary / scheduled（时态类型，检索打分用）
);
CREATE INDEX IF NOT EXISTS idx_pref_workspace ON preferences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pref_subject ON preferences(subject);
CREATE INDEX IF NOT EXISTS idx_pref_status ON preferences(status);
CREATE INDEX IF NOT EXISTS idx_pref_session ON preferences(session_id);
-- idx_pref_workspace_subject_context 索引在 migration v9 中创建（需 context 列存在后）

-- 偏好全文索引（subject + value，中文分词）
CREATE VIRTUAL TABLE IF NOT EXISTS preferences_fts USING fts5(
  pref_id UNINDEXED,
  subject,
  value,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Memory Audit Log（v1.8）：追踪偏好/知识/会话的变更历史
-- 记录 before/after 值（JSON），支持审计与回溯
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,        -- 'preference' | 'knowledge' | 'session'
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,        -- 'create' | 'update' | 'delete' | 'archive' | 'supersede' | 'conflict_resolve'
  before_value TEXT,                  -- JSON of previous state (nullable for create)
  after_value  TEXT,                  -- JSON of new state (nullable for delete)
  workspace_id TEXT,                  -- workspace context
  session_id   TEXT,                  -- source session (nullable)
  reason       TEXT,                  -- human-readable reason
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- 蒸馏模板（v1.9 自定义蒸馏模板）
-- 用户可自定义记忆蒸馏的 system prompt（替代 summarizer.ts 中硬编码的 SYSTEM_PROMPT）
-- 内置模板 is_builtin=1，不可删除；用户模板 is_builtin=0
CREATE TABLE IF NOT EXISTS distillation_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  system_prompt TEXT NOT NULL,
  output_format TEXT DEFAULT 'json',  -- 'json' | 'markdown' | 'text'
  is_builtin    INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_distill_builtin ON distillation_templates(is_builtin);

-- 结构化记忆块（v1.15 行动项 2：Letta 式 memory blocks）
-- 比偏好更自由的键值记忆：label 唯一（human / persona / project_context / custom:xxx）
-- read_only=1 的块为系统保护块（如 MMF 导入的宪法），AI/MCP 不可覆盖，仅用户可改
CREATE TABLE IF NOT EXISTS memory_blocks (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,             -- 块标签（UNIQUE 于 workspace 内）
  value        TEXT NOT NULL,             -- 块内容（markdown 文本）
  read_only    INTEGER DEFAULT 0,         -- 1=只读（系统/导入保护）
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_blocks_workspace ON memory_blocks(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_blocks_label ON memory_blocks(workspace_id, label);

-- 记忆块变更历史（v1.15）：每次 save 生成一条记录，支持版本回滚
CREATE TABLE IF NOT EXISTS memory_block_history (
  id         TEXT PRIMARY KEY,
  block_id   TEXT NOT NULL REFERENCES memory_blocks(id) ON DELETE CASCADE,
  old_value  TEXT,                         -- 变更前内容（首次创建为 NULL）
  new_value  TEXT NOT NULL,                -- 变更后内容
  changed_by TEXT DEFAULT 'user',          -- user / mcp / ai / import / system
  reason     TEXT,                         -- 变更原因（可选）
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_block_history_block ON memory_block_history(block_id);
`
