import type { Provider } from './types'

/** 应用元信息 */
export const APP_NAME = 'Memora'
export const APP_VERSION = '1.0.0'

/** IPC 通道命名空间 */
export const IPC = {
  // 数据库
  DB_INIT: 'db:init',
  DB_QUERY: 'db:query',
  DB_EXECUTE: 'db:execute',

  // Workspace
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_TREE: 'workspace:tree',

  // Folder
  FOLDER_LIST: 'folder:list',
  FOLDER_CREATE: 'folder:create',
  FOLDER_UPDATE: 'folder:update',
  FOLDER_DELETE: 'folder:delete',
  SESSION_LIST_BY_RULE: 'session:list-by-rule',

  // Session
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',
  SESSION_MOVE: 'session:move',
  SESSION_TOGGLE_FAVORITE: 'session:toggle-favorite',

  // Tag
  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_DELETE: 'tag:delete',
  TAG_ATTACH: 'tag:attach',
  TAG_DETACH: 'tag:detach',

  // Importer
  IMPORT_FILE: 'import:file',
  IMPORT_FILES: 'import:files',
  IMPORT_DIRECTORY: 'import:directory',
  IMPORT_CONTENT: 'import:content',

  // 扫描器（智能导入中心）
  SCANNER_GET_DEFAULT_DIRS: 'scanner:get-default-dirs',
  SCANNER_SCAN: 'scanner:scan',

  // AI 应用检测 + 本地扒取（智能导入中心 v2）
  DETECT_APPS: 'scanner:detect-apps',
  EXTRACT_APP: 'scanner:extract-app',
  IMPORT_EXTRACTED: 'import:extracted',

  // 后台静默导入（P3）
  IMPORT_BG_START: 'import:bg-start',
  IMPORT_BG_STOP: 'import:bg-stop',
  IMPORT_BG_RUN_ONCE: 'import:bg-run-once',
  IMPORT_BG_STATUS: 'import:bg-status',
  IMPORT_BG_CONFIG_GET: 'import:bg-config-get',
  IMPORT_BG_CONFIG_SET: 'import:bg-config-set',
  IMPORT_BG_PROGRESS: 'import:bg-progress',  // event: main -> renderer
  IMPORT_BG_DONE: 'import:bg-done',           // event: main -> renderer

  // 大文件流式导入进度（P3）
  IMPORT_PROGRESS: 'import:progress',          // event: main -> renderer

  // Search
  SEARCH_QUERY: 'search:query',

  // Sharing
  SHARE_EXPORT_HTML: 'share:export-html',
  SHARE_EXPORT_HTML_BATCH: 'share:export-html-batch',
  SHARE_EXPORT_MD: 'share:export-md',
  SHARE_EXPORT_CLAUDE_CODE: 'share:export-claude-code',
  DB_VACUUM: 'db:vacuum',
  DB_CLEAN_ORPHANS: 'db:clean-orphans',

  // 批量操作
  SESSION_BATCH_DELETE: 'session:batch-delete',
  SESSION_BATCH_MOVE: 'session:batch-move',

  // AI（Phase 2）
  AI_SUMMARY_GENERATE: 'ai:summary:generate',
  AI_SUMMARY_GET: 'ai:summary:get',
  AI_SUMMARY_UPDATE: 'ai:summary:update',
  AI_SUMMARY_DELETE: 'ai:summary:delete',
  AI_KNOWLEDGE_GENERATE: 'ai:knowledge:generate',
  AI_EMBED_SESSION: 'ai:embed:session',
  AI_EMBED_STATUS: 'ai:embed:status',

  // 语义搜索（Phase 2）
  SEARCH_SEMANTIC: 'search:semantic',

  // Project Memory（Phase 3）
  AI_MEMORY_ASK: 'ai:memory:ask',
  AI_RELATED_SESSIONS: 'ai:related-sessions',

  // AI 连接测试
  TEST_AI_CONNECTION: 'ai:test-connection',

  // API Key 安全存储（safeStorage 加密）
  SECRET_GET_ALL: 'secret:get-all',
  SECRET_SET: 'secret:set',
  SECRET_DELETE: 'secret:delete',

  // 系统
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_SAVE_FILE: 'dialog:save-file',
  STATS_GET: 'stats:get',
  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  APP_GET_DATA_DIR: 'app:get-data-dir'
} as const

/** Provider 显示元信息 */
export const PROVIDER_META: Record<Provider, { label: string; color: string; icon: string }> = {
  ChatGPT: { label: 'ChatGPT', color: '#10a37f', icon: 'GPT' },
  Claude: { label: 'Claude', color: '#d97757', icon: 'C' },
  Gemini: { label: 'Gemini', color: '#4285f4', icon: 'G' },
  DeepSeek: { label: 'DeepSeek', color: '#4d6bfe', icon: 'D' },
  Kimi: { label: 'Kimi', color: '#000000', icon: 'K' },
  Qwen: { label: '通义千问', color: '#615ced', icon: 'Q' },
  Grok: { label: 'Grok', color: '#000000', icon: 'X' },
  Cursor: { label: 'Cursor', color: '#000000', icon: 'CR' },
  ClaudeCode: { label: 'Claude Code', color: '#d97757', icon: 'CC' },
  Codex: { label: 'Codex', color: '#10a37f', icon: 'CX' },
  OpenCode: { label: 'OpenCode', color: '#000000', icon: 'OC' },
  TRAE: { label: 'TRAE', color: '#6d5dfc', icon: 'TR' },
  AIStudio: { label: 'AI Studio', color: '#4285f4', icon: 'AS' },
  Markdown: { label: 'Markdown', color: '#6b7280', icon: 'MD' },
  JSON: { label: 'JSON', color: '#6b7280', icon: '{}' },
  HTML: { label: 'HTML', color: '#6b7280', icon: '<>' },
  Unknown: { label: '未知', color: '#6b7280', icon: '?' }
}
