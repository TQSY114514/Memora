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

/** 文件夹（支持嵌套） */
export interface Folder {
  id: string
  workspaceId: string
  parentId?: string
  name: string
  sortOrder: number
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
  model?: string            // 生成所用模型
  createdAt: string
  updatedAt: string
}

/** AI 配置（Phase 2） */
export interface AiConfig {
  provider: 'openai' | 'deepseek' | 'custom'
  baseUrl: string           // API 基地址
  apiKey: string            // 密钥
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
