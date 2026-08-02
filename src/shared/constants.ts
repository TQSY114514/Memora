import type { Provider } from './types'

/** 应用元信息 */
export const APP_NAME = 'Memora'
export const APP_VERSION = '1.7.1'

/**
 * AI API 协议风格元信息（v1.2）
 * 用于 UI 下拉选择 + apiClient 路由
 */
export const API_STYLE_META: Record<
  import('./types').AiApiStyle,
  { label: string; description: string; needsApiKey: boolean; defaultBaseUrl: string }
> = {
  openai: {
    label: 'OpenAI 兼容',
    description: '/chat/completions + /embeddings，Bearer 鉴权。适用于 OpenAI / DeepSeek / SiliconFlow / Kimi / 通义千问等大多数第三方',
    needsApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1'
  },
  anthropic: {
    label: 'Anthropic 原生',
    description: '/v1/messages + x-api-key + anthropic-version。Claude 官方 API',
    needsApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com'
  },
  ollama: {
    label: 'Ollama 本地',
    description: '/api/chat + /api/embeddings，无需鉴权。本地部署的 Ollama',
    needsApiKey: false,
    defaultBaseUrl: 'http://localhost:11434'
  },
  gemini: {
    label: 'Google Gemini',
    description: '/v1beta/models/{model}:generateContent?key=。Google AI Studio',
    needsApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com'
  }
}

/** IPC 通道命名空间 */
export const IPC = {
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
  SESSION_LIST_MESSAGES: 'session:list-messages',
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
  SHARE_EXPORT_MD: 'share:export-md',
  SHARE_EXPORT_CLAUDE_CODE: 'share:export-claude-code',
  SHARE_EXPORT_JSON: 'share:export-json',
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
  AI_EMBED_LOCAL_STATUS: 'ai:embed:local:status',
  AI_EMBED_LOCAL_LOAD: 'ai:embed:local:load',
  AI_EMBED_LOCAL_MIRROR_GET: 'ai:embed:local:mirror:get',
  AI_EMBED_LOCAL_MIRROR_SET: 'ai:embed:local:mirror:set',
  AI_EMBED_LOCAL_DELETE_MODEL: 'ai:embed:local:delete-model',
  AI_EMBED_LOCAL_CACHE_INFO: 'ai:embed:local:cache-info',

  // 语义搜索（Phase 2）
  SEARCH_SEMANTIC: 'search:semantic',

  // Project Memory（Phase 3）
  AI_MEMORY_ASK: 'ai:memory:ask',
  AI_RELATED_SESSIONS: 'ai:related-sessions',

  // Knowledge Vault（v1.1）—— 知识/决策/任务一等公民实体
  KNOWLEDGE_LIST: 'knowledge:list',
  KNOWLEDGE_GET: 'knowledge:get',
  KNOWLEDGE_CREATE: 'knowledge:create',
  KNOWLEDGE_UPDATE: 'knowledge:update',
  KNOWLEDGE_DELETE: 'knowledge:delete',
  KNOWLEDGE_TOGGLE_TASK: 'knowledge:toggle-task',
  KNOWLEDGE_SEARCH: 'knowledge:search',
  KNOWLEDGE_COUNT: 'knowledge:count',
  KNOWLEDGE_RELATED: 'knowledge:related',
  KNOWLEDGE_EXTRACT_FROM_SESSION: 'knowledge:extract-from-session',
  KNOWLEDGE_RELATION_ADD: 'knowledge:relation-add',
  KNOWLEDGE_RELATION_REMOVE: 'knowledge:relation-remove',
  KNOWLEDGE_RELATION_LIST: 'knowledge:relation-list',
  KNOWLEDGE_GRAPH_DATA: 'knowledge:graph-data',

  // Preference（v1.4 Memory Lifecycle）—— 用户偏好 + 冲突检测 + 衰减
  PREF_LIST: 'pref:list',
  PREF_GET: 'pref:get',
  PREF_CREATE: 'pref:create',
  PREF_UPDATE: 'pref:update',
  PREF_DELETE: 'pref:delete',
  PREF_ARCHIVE: 'pref:archive',
  PREF_SEARCH: 'pref:search',
  PREF_COUNT: 'pref:count',
  PREF_PROFILE: 'pref:profile',
  PREF_DECAY: 'pref:decay',
  PREF_CONSTITUTION: 'pref:constitution',

  // AI 连接测试
  TEST_AI_CONNECTION: 'ai:test-connection',

  // 蒸馏模板（v1.9 自定义蒸馏模板）
  DISTILL_LIST: 'distill:list',
  DISTILL_GET: 'distill:get',
  DISTILL_CREATE: 'distill:create',
  DISTILL_UPDATE: 'distill:update',
  DISTILL_DELETE: 'distill:delete',

  // AI 配置文件持久化（主进程 userData/ai-config.json，供 MCP 进程读取）
  AI_CONFIG_FILE_SAVE: 'ai:config-file-save',
  AI_CONFIG_FILE_LOAD: 'ai:config-file-load',
  AI_CONFIG_FILE_SET_ACTIVE: 'ai:config-file-set-active',
  AI_CONFIG_FILE_DELETE: 'ai:config-file-delete',

  // API Key 安全存储（safeStorage 加密）
  SECRET_GET_ALL: 'secret:get-all',
  SECRET_SET: 'secret:set',
  SECRET_DELETE: 'secret:delete',
  SECRET_ENCRYPTION_AVAILABLE: 'secret:encryption-available',

  // 系统
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_SAVE_FILE: 'dialog:save-file',
  STATS_GET: 'stats:get',
  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  APP_GET_DATA_DIR: 'app:get-data-dir',

  // 自动热备份（v1.6）
  BACKUP_LIST: 'backup:list',
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_DELETE: 'backup:delete',
  BACKUP_CONFIG_GET: 'backup:config-get',
  BACKUP_CONFIG_SET: 'backup:config-set',

  // 冲突检测（v1.6）
  PREF_CONFLICTS: 'pref:conflicts',

  // Memory Audit Log（v1.8）：偏好/知识/会话变更审计日志
  PREF_AUDIT_LOGS: 'pref:audit-logs',

  // 搜索增强（v1.6）
  SEARCH_ADVANCED: 'search:advanced',

  // 日志系统（v1.6.1）
  LOG_LIST_FILES: 'log:list-files',
  LOG_GET_DIR: 'log:get-dir',

  // 记忆生命周期（v1.7.0）
  MEMORY_TIERED: 'memory:tiered',
  MEMORY_HEALTH: 'memory:health',
  MEMORY_PROFILE_SUMMARY: 'memory:profile-summary',
  MEMORY_LIFECYCLE_RUN: 'memory:lifecycle-run',

  // Memora Memory Format 导出/导入（v1.8 MMF）
  MEMORY_EXPORT_MMF: 'memory:export-mmf',
  MEMORY_IMPORT_MMF: 'memory:import-mmf',

  // 全量数据迁移（v1.7.1）—— 导出/导入整个工作区为归档文件
  SYSTEM_EXPORT_DATA: 'system:export-data',
  SYSTEM_IMPORT_DATA: 'system:import-data',

  // 记忆版本控制（v1.10）—— 版本历史浏览 + 回滚
  AUDIT_VERSION_HISTORY: 'audit:version-history',
  AUDIT_ROLLBACK: 'audit:rollback',

  // MCP 工具权限系统（v1.10）—— 按客户端粒度授权
  MCP_PERMISSIONS_LIST: 'mcp:permissions:list',
  MCP_PERMISSIONS_SAVE: 'mcp:permissions:save',
  MCP_PERMISSIONS_DELETE: 'mcp:permissions:delete',
  MCP_PERMISSIONS_CHECK: 'mcp:permissions:check',

  // 记忆智能体（v1.10）—— 定期扫描 + 知识缺口检测 + 间隔重复
  MEMORY_AGENT_SCAN: 'memory-agent:scan',
  MEMORY_AGENT_STATUS: 'memory-agent:status',
  MEMORY_AGENT_START: 'memory-agent:start',
  MEMORY_AGENT_STOP: 'memory-agent:stop',
  MEMORY_AGENT_GAPS: 'memory-agent:gaps',
  MEMORY_AGENT_REVIEW_QUEUE: 'memory-agent:review-queue',

  // ===== 云端同步（v1.11） =====
  SYNC_CONFIG_GET: 'sync:config:get',
  SYNC_CONFIG_SET: 'sync:config:set',
  SYNC_TEST_CONNECTION: 'sync:test-connection',
  SYNC_UPLOAD: 'sync:upload',
  SYNC_DOWNLOAD: 'sync:download',
  SYNC_LIST_FILES: 'sync:list-files',
  SYNC_DELETE_FILE: 'sync:delete-file',
  SYNC_PERFORM: 'sync:perform',

  // ===== 时间胶囊（v1.11） =====
  CAPSULE_CREATE: 'capsule:create',
  CAPSULE_LIST: 'capsule:list',
  CAPSULE_UNLOCK: 'capsule:unlock',
  CAPSULE_CHECK_DUE: 'capsule:check-due',
  CAPSULE_DELETE: 'capsule:delete',

  // ===== 团队协作（v1.11） =====
  TEAM_CREATE_WORKSPACE: 'team:create-workspace',
  TEAM_LIST_WORKSPACES: 'team:list-workspaces',
  TEAM_GENERATE_INVITE: 'team:generate-invite',
  TEAM_JOIN_WORKSPACE: 'team:join-workspace',
  TEAM_SET_VISIBILITY: 'team:set-visibility',
  TEAM_GET_VISIBILITY: 'team:get-visibility',
  TEAM_CHECK_VISIBILITY: 'team:check-visibility',
  TEAM_ADD_COMMENT: 'team:add-comment',
  TEAM_LIST_COMMENTS: 'team:list-comments',
  TEAM_GET_REPLIES: 'team:get-replies',
  TEAM_RESOLVE_COMMENT: 'team:resolve-comment',

  // ===== 模板市场（v1.11） =====
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_GET: 'template:get',
  TEMPLATE_EXPORT: 'template:export',
  TEMPLATE_IMPORT: 'template:import',
  TEMPLATE_FILTER: 'template:filter',
  TEMPLATE_SEARCH: 'template:search',

  // ===== 迁移向导（v1.11） =====
  MIGRATION_PLATFORMS: 'migration:platforms',
  MIGRATION_DEFAULT_CONFIG: 'migration:default-config',
  MIGRATION_STEP_LABEL: 'migration:step-label',
  MIGRATION_STEP_DESC: 'migration:step-desc',
  MIGRATION_FORMAT_DURATION: 'migration:format-duration'
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
