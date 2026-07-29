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
  imported_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_folder ON chat_sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON chat_sessions(provider);
CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON chat_sessions(is_favorite);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON chat_sessions(source_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON chat_sessions(created_at);

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
-- 存为 JSON 数组（简化 MVP，后续可换 sqlite-vss 原生扩展）
CREATE TABLE IF NOT EXISTS message_embeddings (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  embedding    TEXT NOT NULL,       -- JSON 数组，如 [0.1, 0.2, ...]
  model        TEXT NOT NULL,       -- 嵌入模型名
  dim          INTEGER NOT NULL,    -- 向量维度
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embeddings_message ON message_embeddings(message_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_session ON message_embeddings(session_id);

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (2, datetime('now'));
`
