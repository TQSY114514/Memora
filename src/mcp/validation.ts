/**
 * MCP 工具入参 Zod Schema 定义
 *
 * 为所有 25 个 MCP 工具提供运行时参数校验。
 * 在 callTool 分发前统一校验，防止恶意/畸形数据注入。
 */
import { z } from 'zod'

// ===== 通用基础类型 =====

/** 非空字符串（trim 后长度 > 0） */
const nonEmptyString = z.string().trim().min(1, '不能为空')

/** 安全 ID（与 safeHandle.assertSafeId 一致：字母/数字/下划线/连字符，1-64 字符） */
const safeId = nonEmptyString.regex(
  /^[A-Za-z0-9_-]{1,64}$/,
  'ID 格式无效（仅允许字母、数字、下划线、连字符，1-64 字符）'
)

/** 正整数（1-100） */
const limitSchema = z.number().int().min(1).max(100).default(10)

/** 非负整数 */
const offsetSchema = z.number().int().min(0).default(0)

/** 0-1 浮点数 */
const thresholdSchema = z.number().min(0).max(1).default(0.25)

/** 0-1 置信度 */
const confidenceSchema = z.number().min(0).max(1).optional()

/** 消息角色枚举 */
const roleSchema = z.enum(['user', 'assistant', 'system', 'tool'])

/** 知识类型枚举 */
const knowledgeTypeSchema = z.enum(['knowledge', 'decision', 'task'])

/** 知识状态枚举 */
const knowledgeStatusSchema = z.enum(['active', 'archived', 'open', 'done', 'superseded'])

/** 导出格式枚举 */
const exportFormatSchema = z.enum(['markdown', 'html']).default('markdown')

// ===== 工具 Schema 定义 =====

/** add_session 的消息条目 */
const messageItemSchema = z.object({
  role: roleSchema.default('user'),
  content: z.string().default(''),
  model: z.string().optional(),
  createdAt: z.string().optional()
})

// ===== 各工具 Schema 映射 =====

export const toolSchemas: Record<string, z.ZodType> = {
  // sessions 域
  search_sessions: z.object({
    query: nonEmptyString,
    limit: limitSchema
  }),
  get_session: z.object({
    sessionId: safeId
  }),
  list_sessions: z.object({
    folderId: safeId.optional(),
    limit: limitSchema,
    offset: offsetSchema
  }),
  get_session_summary: z.object({
    sessionId: safeId
  }),
  add_session: z.object({
    title: nonEmptyString,
    provider: nonEmptyString,
    folderId: safeId.optional(),
    messages: z.array(messageItemSchema).optional(),
    sessionType: z.enum(['persistent', 'temporary']).optional()
  }),
  add_message: z.object({
    sessionId: safeId,
    role: roleSchema,
    content: nonEmptyString,
    model: z.string().optional()
  }),
  update_session: z.object({
    sessionId: safeId,
    title: z.string().optional(),
    description: z.string().optional(),
    folderId: z.string().nullable().optional(),
    isFavorite: z.boolean().optional()
  }),
  delete_session: z.object({
    sessionId: safeId
  }),
  export_session: z.object({
    sessionId: safeId,
    format: exportFormatSchema
  }),
  summarize_session: z.object({
    sessionId: safeId
  }),

  // knowledge 域
  knowledge_search: z.object({
    query: nonEmptyString,
    type: knowledgeTypeSchema.optional(),
    limit: limitSchema
  }),
  decision_search: z.object({
    query: nonEmptyString,
    limit: limitSchema
  }),
  project_context: z.object({
    workspaceId: safeId
  }),
  knowledge_entry_update: z.object({
    entryId: safeId,
    title: z.string().optional(),
    content: z.string().optional(),
    type: knowledgeTypeSchema.optional(),
    status: knowledgeStatusSchema.optional()
  }),
  knowledge_entry_delete: z.object({
    entryId: safeId
  }),

  // memory 域
  memory_recall: z.object({
    query: nonEmptyString,
    limit: limitSchema,
    threshold: thresholdSchema,
    tiered: z.boolean().optional()
  }),
  memory_write: z.object({
    title: nonEmptyString,
    content: nonEmptyString,
    provider: z.string().default('Unknown'),
    folderId: safeId.optional(),
    type: knowledgeTypeSchema.default('knowledge'),
    workspaceId: safeId.optional()
  }),
  memory_save_preference: z.object({
    workspaceId: safeId,
    subject: nonEmptyString,
    value: nonEmptyString,
    sessionId: safeId.optional(),
    confidence: confidenceSchema
  }),
  memory_profile: z.object({
    workspaceId: safeId
  }),
  memory_get_constitution: z.object({
    workspaceId: safeId.optional()
  }),
  memory_forget: z.object({
    preferenceId: safeId
  }),
  memory_feedback: z.object({
    preferenceId: safeId,
    feedback: nonEmptyString,
    workspaceId: safeId
  }),
  preference_search: z.object({
    query: nonEmptyString,
    workspaceId: safeId.optional(),
    limit: limitSchema
  }),
  memory_audit_log: z.object({
    entityType: z.enum(['preference', 'knowledge', 'session']).optional(),
    entityId: safeId.optional(),
    workspaceId: safeId.optional(),
    limit: limitSchema,
    offset: offsetSchema
  }),

  // workspace 域
  list_workspaces: z.object({}),
  list_tags: z.object({}),
  create_folder: z.object({
    workspaceId: safeId,
    name: nonEmptyString,
    parentId: safeId.optional()
  }),
  list_folders: z.object({
    workspaceId: safeId.optional()
  }),

  // memory blocks 域（v1.15 结构化记忆块）
  memory_block_list: z.object({
    workspaceId: safeId.optional()
  }),
  memory_block_get: z.object({
    blockId: safeId
  }),
  memory_block_save: z.object({
    workspaceId: safeId,
    label: z.string().trim().min(1).max(120),
    value: z.string().min(1),
    readOnly: z.boolean().optional(),
    changedBy: z.enum(['user', 'mcp', 'ai', 'import', 'system']).default('mcp'),
    reason: z.string().optional()
  }),
  memory_block_delete: z.object({
    blockId: safeId,
    changedBy: z.enum(['user', 'mcp', 'ai', 'import', 'system']).default('mcp')
  }),
  memory_block_history: z.object({
    blockId: safeId,
    limit: limitSchema
  }),
  memory_block_rollback: z.object({
    blockId: safeId,
    historyId: safeId,
    changedBy: z.enum(['user', 'mcp', 'ai', 'import', 'system']).default('mcp')
  })
}

/**
 * 校验工具入参
 * @returns 校验后的参数（含默认值）
 * @throws Error 如果校验失败
 */
export function validateToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const schema = toolSchemas[toolName]
  if (!schema) {
    // 未定义 schema 的工具直接放行（向前兼容）
    return args
  }
  const result = schema.safeParse(args)
  if (!result.success) {
    const firstError = result.error.issues[0]
    const field = firstError.path.join('.')
    throw new Error(`参数校验失败${field ? `（${field}）` : ''}: ${firstError.message}`)
  }
  return result.data as Record<string, unknown>
}
