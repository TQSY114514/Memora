/**
 * Memora 统一数据模型
 * 跨平台 AI 对话的抽象层，所有 importer 输出、database 存储、UI 展示都基于此模型
 */

/** AI 平台来源标识 */
export type Provider =
  | 'ChatGPT'
  | 'Claude'
  | 'Gemini'
  | 'DeepSeek'
  | 'Kimi'
  | 'Qwen'
  | 'Grok'
  | 'Cursor'
  | 'ClaudeCode'
  | 'Codex'
  | 'OpenCode'
  | 'TRAE'
  | 'AIStudio'
  | 'Markdown'
  | 'JSON'
  | 'HTML'
  | 'Unknown'

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** 附件类型 */
export type AttachmentType = 'image' | 'file'

/** 附件 */
export interface Attachment {
  id: string
  messageId: string
  type: AttachmentType
  filename: string
  mimeType: string
  /** 本地存储路径（相对于附件目录）或 base64 */
  filePath?: string
}

/** 消息 */
export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  /** 该消息使用的模型（支持对话中切换模型） */
  model?: string
  tokens?: number
  /** 在对话中的顺序 */
  order: number
  createdAt: string
  attachments?: Attachment[]
}

/** 标签 */
export interface Tag {
  id: string
  name: string
  color?: string
  createdAt: string
}

/** 对话会话（核心实体） */
export interface ChatSession {
  id: string
  /** 原平台的对话 ID（用于幂等导入） */
  sourceId?: string
  provider: Provider
  model?: string
  title: string
  description?: string
  folderId?: string
  isFavorite: boolean
  messageCount: number
  createdAt: string
  updatedAt: string
  importedAt: string
  tags: Tag[]
  messages?: Message[]
}

/** 工作区 */
export interface Workspace {
  id: string
  name: string
  description?: string
  color?: string
  icon?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  /** 文件夹数量（用于展示） */
  folderCount?: number
  /** 对话数量（用于展示） */
  sessionCount?: number
}


/** 智能文件夹规则 */
export interface FolderRule {
  /** 匹配关键词（标题或内容包含任一即命中） */
  keywords?: string[]
  /** 匹配平台（任一即命中） */
  providers?: string[]
  /** 匹配标签（任一即命中） */
  tags?: string[]
  /** 是否只匹配收藏 */
  favoriteOnly?: boolean
}

/** 文件夹（支持嵌套） */
export interface Folder {
  id: string
  workspaceId: string
  parentId?: string
  name: string
  sortOrder: number
  /** 智能文件夹规则（null=普通文件夹） */
  rule?: FolderRule | null
  createdAt: string
  updatedAt: string
  /** 子文件夹数量 */
  childCount?: number
  /** 对话数量 */
  sessionCount?: number
}

/** 文件夹树节点（用于 UI 展示） */
export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[]
  sessions: ChatSession[]
}

/** 工作区树（用于左侧导航） */
export interface WorkspaceTree extends Workspace {
  folders: FolderTreeNode[]
  /** 未分组的对话 */
  looseSessions: ChatSession[]
}

/** 搜索结果高亮片段 */
export interface SearchSnippet {
  /** 匹配的消息内容片段（含高亮标记） */
  snippet: string
  /** 所属消息 ID */
  messageId: string
  /** 所属会话 ID */
  sessionId: string
}

/** 搜索结果 */
export interface SearchResult {
  session: ChatSession
  /** 匹配片段列表 */
  snippets: SearchSnippet[]
  /** 相关度评分（FTS5 rank） */
  rank: number
}

/** Dashboard 统计数据 */
export interface DashboardStats {
  sessionCount: number
  messageCount: number
  providerCount: number
  indexedCount: number
  favoriteCount: number
  preferenceCount: number   // 偏好数（全局）
  decisionCount: number     // 决策数（全局）
  taskCount: number          // 任务数（全局）
  providerBreakdown: Array<{ provider: string; count: number }>
  recentSessions: ChatSession[]
}

/** 备份数据（完整数据库导出） */
export interface BackupData {
  version: number
  exportedAt: string
  workspaces: any[]
  folders: any[]
  sessions: any[]
  messages: any[]
  tags: any[]
  sessionTags: any[]
  summaries: any[]
  knowledgeEntries?: any[]   // v1.1 新增
  knowledgeRelations?: any[] // v1.1 新增
}



/** 导入结果 */
export interface ImportResult {
  /** 导入的对话数 */
  imported: number
  /** 跳过的对话数（重复） */
  skipped: number
  /** 失败的对话数 */
  failed: number
  /** 错误信息列表 */
  errors: string[]
  /** 导入的对话 ID 列表 */
  sessionIds: string[]
}

/** 检测到的 AI 应用（仅检测安装状态，不读取内容） */
export interface DetectedApp {
  provider: Provider
  name: string
  installed: boolean
  installPath?: string
  /** 本地数据路径（可扒取时提供，如 Cursor 的 state.vscdb） */
  dataPath?: string
  /** 是否支持本地直接扒取 */
  canExtract: boolean
  /** 不可扒取时的引导提示（如"请从网页端导出"） */
  hint?: string
}

/** 已扒取的对话（可编辑标题/来源后再导入） */
export interface ExtractedSession {
  id: string              // 临时 ID（仅扒取阶段使用）
  provider: Provider
  title: string           // 可编辑
  source: string          // 来源标注（可编辑，如 "Cursor 本地扒取" / "Claude Code · projectA"）
  messageCount: number
  createdAt: string
  updatedAt: string
  /** 完整消息列表（导入时使用） */
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
    model?: string
    createdAt: string
  }>
}

/** 导入来源类型 */
export type ImportSource = 'file' | 'directory' | 'clipboard' | 'share-link'

/** 扫描预览：单个候选文件的信息（不读取完整内容，保护隐私） */
export interface ScanPreview {
  filePath: string
  fileName: string
  sizeBytes: number
  ext: string
  /** 识别出的 AI 平台；'Unknown' 表示未识别 */
  provider: Provider | 'Unknown'
  /** 预估对话数；null 表示文件过大未做完整解析 */
  estimatedSessions: number | null
  mtime: string
}

/** 扫描结果：单个根目录的扫描汇总 */
export interface ScanResult {
  root: string
  files: ScanPreview[]
  /** 已扫描的文件总数 */
  scanned: number
  /** 已跳过的文件数（不匹配类型/未识别） */
  skipped: number
  /** 是否因达到 maxFiles 上限而截断 */
  truncated: boolean
}

/** AI 总结（Phase 2） */
export interface SessionSummary {
  id: string
  sessionId: string
  summary: string           // 整体摘要
  keyPoints: string[]       // 关键决定/要点
  todos: string[]           // 待办事项
  knowledge?: string[]      // 蒸馏出的可复用知识要点（v1.1 新增，可选）
  suggestedTags?: string[]  // AI 建议标签（不自动应用，UI 让用户确认；可选）
  model?: string            // 生成所用模型
  createdAt: string
  updatedAt: string
}

/** 知识条目类型（Knowledge Vault 核心） */
export type KnowledgeType = 'knowledge' | 'decision' | 'task'

/** 知识条目来源 */
export type KnowledgeSource = 'manual' | 'ai-extract' | 'mcp'

/** 任务状态 */
export type TaskStatus = 'open' | 'done'

/** 决策状态 */
export type DecisionStatus = 'active' | 'superseded'

/** 知识条目（一等公民实体，可独立于对话存在） */
export interface KnowledgeEntry {
  id: string
  workspaceId: string
  /** 来源对话 ID（可空：手动创建或 MCP 写入） */
  sessionId?: string
  type: KnowledgeType
  title: string
  content?: string
  /** task: open/done；decision: active/superseded；knowledge: 忽略 */
  status: string
  source: KnowledgeSource
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 知识关系类型（Memory Graph 轻量关系） */
export type KnowledgeRelation = 'supports' | 'contradicts' | 'derived-from' | 'relates-to' | 'decision-from-session'

/** 知识关系 */
export interface KnowledgeRelationRow {
  fromId: string
  toId: string
  relation: KnowledgeRelation
}

/** 知识图谱边（含显式关系和隐式关联） */
export interface GraphEdge {
  from: string
  to: string
  relation: string
  implicit: boolean
}

/** 知识图谱数据（节点 + 边） */
export interface KnowledgeGraphData {
  nodes: KnowledgeEntry[]
  edges: GraphEdge[]
}

/**
 * AI API 协议风格（v1.2）
 * - openai:    OpenAI 兼容（/chat/completions + /embeddings + Bearer）— 默认
 * - anthropic: Anthropic 原生（/v1/messages + x-api-key + anthropic-version）
 * - ollama:    Ollama 本地（/api/chat + /api/embeddings，无 auth）
 * - gemini:    Google Gemini（/v1beta/models/{model}:generateContent?key=）
 */
export type AiApiStyle = 'openai' | 'anthropic' | 'ollama' | 'gemini'

/** AI 配置（Phase 2，v1.2 扩展为无限供应商 + 多协议） */
export interface AiConfig {
  provider: string          // 供应商唯一标识（v1.2 起为 string，可任意命名）
  label?: string            // 显示名（v1.2 新增，UI 展示用）
  apiStyle?: AiApiStyle     // API 协议风格（v1.2 新增，默认 openai）
  baseUrl: string           // API 基地址
  apiKey: string            // 密钥（ollama 可空）
  chatModel: string         // 对话模型（用于总结）
  embeddingModel: string    // 嵌入模型（用于语义搜索）
  embeddingDim: number      // 嵌入维度
}

/** 语义搜索结果（Phase 2） */
export interface SemanticSearchResult {
  session: ChatSession
  messageId: string
  snippet: string
  score: number             // 相似度 0~1
}

/** Project Memory 问答引用来源（Phase 3） */
export interface MemoryCitation {
  sessionId: string
  sessionTitle: string
  provider: Provider
  messageId: string
  snippet: string           // 引用的消息片段
  score: number             // 相关度
}

/** Project Memory 问答结果（Phase 3） */
export interface ProjectMemoryAnswer {
  question: string
  answer: string            // LLM 生成的答案（Markdown）
  citations: MemoryCitation[]
  model: string
  createdAt: string
}

/** 相关讨论推荐结果（Phase 3） */
export interface RelatedSession {
  session: ChatSession
  score: number
  reason: string            // 为什么相关（命中消息摘要）
}

/** 偏好状态 */
export type PreferenceStatus = 'active' | 'superseded' | 'archived'

/** 偏好来源 */
export type PreferenceSource = 'conversation' | 'manual' | 'mcp' | 'inferred'

/**
 * 用户偏好（Preference 实体）
 * 结构化记忆：用户喜欢什么、用什么、偏好什么
 * 支持冲突检测（新旧矛盾时自动标记旧记忆为 superseded）和置信度衰减
 */
export interface Preference {
  id: string
  workspaceId: string
  /** 来源对话 ID（可空） */
  sessionId?: string
  /** 偏好类别：如 'music' / 'phone' / 'language' / 'editor' / 'framework' */
  subject: string
  /** 偏好值：如 '初音未来' / 'android' / 'Python' */
  value: string
  /** 置信度 0.0-1.0，初始 0.5，每次复现增加，长期未访问衰减 */
  confidence: number
  /** 来源 */
  source: PreferenceSource
  /** 状态：active / superseded / archived */
  status: PreferenceStatus
  /** 被哪条新偏好取代（superseded 时非空） */
  supersededBy?: string
  createdAt: string
  updatedAt: string
  /** 最后访问时间（用于衰减计算） */
  lastAccessedAt?: string
  /** 访问次数 */
  accessCount: number
}

/** 用户画像（聚合偏好，用于 MCP memory_profile） */
export interface UserProfile {
  workspaceId: string
  totalPreferences: number
  activePreferences: number
  /** 按类别分组的偏好 */
  bySubject: Array<{ subject: string; preferences: Preference[] }>
}

/** 冲突报告（v1.6） */
export interface ConflictReport {
  subject: string
  conflicts: Array<{
    preferenceA: Preference
    preferenceB: Preference
    reason: string
  }>
}

/** 热备份配置（v1.6） */
export interface BackupConfig {
  intervalMinutes: number
  maxBackups: number
  enabled: boolean
  /** 加密密码（可选，v1.6.1） */
  encryptionKey?: string
}

/** 备份条目（v1.6） */
export interface BackupEntry {
  filename: string
  size: number
  createdAt: string
  /** 是否加密（v1.6.1） */
  encrypted: boolean
}

/** 后台静默导入配置 */
export interface BackgroundImportConfig {
  enabled: boolean
  /** 导入目标文件夹 ID（必须选择，null=未配置） */
  targetFolderId: string | null
  /** 要扒取的 provider 列表（默认空=所有可扒取的） */
  providers: Provider[]
  /** 轮询间隔分钟数（默认 30） */
  intervalMinutes: number
  /** 启动时立即执行一次 */
  runOnStartup: boolean
}

/** 后台导入进度（实时推送） */
export interface BackgroundImportProgress {
  phase: 'detecting' | 'extracting' | 'importing' | 'idle'
  provider: string | null
  current: number
  total: number
  message: string
}

/** 后台导入单次执行结果 */
export interface BackgroundImportRunResult {
  detected: number
  extracted: number
  imported: number
  skipped: number
  failed: number
  errors: string[]
  durationMs: number
}

/** 后台导入完整状态 */
export interface BackgroundImportStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: BackgroundImportRunResult | null
  nextRunAt: string | null
  currentProgress: BackgroundImportProgress | null
}
