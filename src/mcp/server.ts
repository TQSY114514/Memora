/**
 * MCP Server — 把 Memora 的对话数据暴露给外部 AI 工具
 *
 * 实现 Model Context Protocol (MCP) 的子集：
 * - JSON-RPC 2.0 over stdio
 * - initialize 握手
 * - tools/list 列出可用工具
 * - tools/call 调用工具
 *
 * 暴露的工具：
 * 1. search_sessions      — 全文搜索对话
 * 2. get_session          — 获取指定对话完整内容
 * 3. list_sessions        — 列出对话（支持分页/筛选）
 * 4. list_workspaces      — 列出工作区
 * 5. list_tags            — 列出标签
 * 6. get_session_summary  — 获取 AI 总结
 *
 * 使用方式：
 *   在 Claude Desktop 的 config 中添加：
 *   {
 *     "mcpServers": {
 *       "Memora": {
 *         "command": "node",
 *         "args": ["<Memora-path>/out/mcp/index.js"]
 *       }
 *     }
 *   }
 */

import { createInterface } from 'readline'
import { app } from 'electron'
import { initDatabase } from '../database/connection'
import { listSessions, getSession, createSession } from '../database/repositories/sessionRepo'
import { indexSessionForSearch } from '../search/indexer'
import { listWorkspaces } from '../database/repositories/workspaceRepo'
import { listTags } from '../database/repositories/tagRepo'
import { getSummary } from '../database/repositories/summaryRepo'
import {
  searchEntries,
  listEntries,
  countEntries,
  createEntry
} from '../database/repositories/knowledgeRepo'
import {
  getUserProfile,
  createPreference,
  archivePreference,
  searchPreferences,
  decayConfidence
} from '../database/repositories/preferencesRepo'
import { search } from '../search/query'
import { semanticSearch } from '../search/semantic'
import { loadAiConfigFile } from '../main/aiConfigFile'
import { getAllApiKeys } from '../main/secretStore'
import { getDatabase } from '../database/connection'
import { v4 as uuidv4 } from 'uuid'
import type { AiConfig } from '@shared/types'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string; [k: string]: unknown }>
    required?: string[]
  }
}

const TOOLS: McpTool[] = [
  {
    name: 'search_sessions',
    description: '全文搜索 Memora 中的 AI 对话。支持搜索对话标题和消息内容。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '返回结果数量上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_session',
    description: '获取指定对话的完整内容（含所有消息）。需要提供 sessionId。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '对话 ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'list_sessions',
    description: '列出 Memora 中的对话。可按工作区/文件夹筛选，支持分页。',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: '按文件夹筛选（可选）' },
        limit: { type: 'number', description: '返回数量上限，默认 20' },
        offset: { type: 'number', description: '偏移量，默认 0' }
      }
    }
  },
  {
    name: 'list_workspaces',
    description: '列出所有工作区及其文件夹结构。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_tags',
    description: '列出所有标签。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_session_summary',
    description: '获取指定对话的 AI 总结（摘要、关键要点、待办事项）。如果未生成过总结则返回 null。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '对话 ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'add_session',
    description: '在 Memora 中创建新对话。返回新对话的 ID。可指定 provider（如 ChatGPT/Claude/Gemini 等）和 folderId。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '对话标题' },
        provider: { type: 'string', description: 'AI 平台标识，如 Claude/ChatGPT/Gemini/DeepSeek 等' },
        folderId: { type: 'string', description: '目标文件夹 ID（可选）' },
        messages: { type: 'array', description: '消息列表', items: { type: 'object' } }
      },
      required: ['title', 'provider']
    }
  },
  {
    name: 'add_message',
    description: '向指定对话追加一条消息。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标对话 ID' },
        role: { type: 'string', description: '消息角色：user/assistant/system/tool' },
        content: { type: 'string', description: '消息内容' },
        model: { type: 'string', description: '使用的模型（可选）' }
      },
      required: ['sessionId', 'role', 'content']
    }
  },
  {
    name: 'memory_recall',
    description:
      '语义召回：基于向量相似度从全库对话中检索与问题最相关的片段。适合「我以前有没有讨论过 X」「之前那个决定是怎么做的」这类模糊召回。需要先在 Memora UI 配置 AI 并建立向量索引。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '自然语言问题或要召回的主题' },
        limit: { type: 'number', description: '返回结果数量上限，默认 5' },
        threshold: { type: 'number', description: '相似度阈值（0-1），默认 0.25' }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_write',
    description:
      '知识沉淀：把一条重要信息（架构决定、Bug 解决方案、经验教训等）写入 Memora 知识库，便于以后召回复用。默认写入 knowledge_entries 表（type=knowledge），可指定 type=decision/task 写入决策或待办。若提供 folderId 则同时创建一条对话记录。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '知识条目标题（如「Electron 项目改用 SQLite 的决定」）' },
        content: { type: 'string', description: '要沉淀的知识内容（支持多段文本）' },
        provider: {
          type: 'string',
          description: '来源标识，默认为 Unknown。可设为具体 AI 平台名或 Manual'
        },
        folderId: { type: 'string', description: '目标文件夹 ID（可选，提供时同时创建对话记录）' },
        type: {
          type: 'string',
          description: '知识条目类型：knowledge（默认）/ decision / task',
          enum: ['knowledge', 'decision', 'task']
        },
        workspaceId: { type: 'string', description: '目标工作区 ID（写入 knowledge_entries 时必填）' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'knowledge_search',
    description:
      '搜索 Memora 知识库中的知识/决策/任务条目（FTS 全文，支持中文）。适合查找提炼后的结构化知识，而非原始对话片段。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        type: {
          type: 'string',
          description: '筛选类型（可选）：knowledge / decision / task',
          enum: ['knowledge', 'decision', 'task']
        },
        limit: { type: 'number', description: '返回数量上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'decision_search',
    description:
      '专搜架构决策（type=decision）。「之前为什么这么定？」「以前做过什么架构决定？」用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '返回数量上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'project_context',
    description:
      '组装某个工作区的项目上下文：近期决策 + 未完成任务 + 核心知识条目。让 AI 快速恢复项目状态，无需翻阅原始对话。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID' }
      },
      required: ['workspaceId']
    }
  },
  {
    name: 'memory_profile',
    description:
      '用户画像：返回当前用户的全部偏好（preferences），按类别分组。包括用户喜欢什么、用什么、偏好什么。让 AI 快速了解用户。「用户喜欢什么？」「用户用什么编辑器？」「用户偏好什么框架？」用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID' }
      },
      required: ['workspaceId']
    }
  },
  {
    name: 'memory_save_preference',
    description:
      '保存用户偏好：把一条用户偏好（如「喜欢初音未来」「用 VSCode」「偏好 Python」）写入记忆。自动检测冲突——如果同类别已有不同偏好，旧记忆自动标记为 superseded。「用户说他换安卓了」「用户提到喜欢 Python」时用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID' },
        subject: { type: 'string', description: '偏好类别，如 music / phone / language / editor / framework' },
        value: { type: 'string', description: '偏好值，如 初音未来 / android / Python' },
        sessionId: { type: 'string', description: '来源对话 ID（可选）' },
        confidence: { type: 'number', description: '置信度 0-1，默认 0.5' }
      },
      required: ['workspaceId', 'subject', 'value']
    }
  },
  {
    name: 'memory_forget',
    description:
      '遗忘：将一条偏好标记为 archived（软删除，保留审计痕迹）。用户说「忘掉我之前说的」「那条信息过时了」时用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        preferenceId: { type: 'string', description: '要遗忘的偏好 ID' }
      },
      required: ['preferenceId']
    }
  },
  {
    name: 'preference_search',
    description:
      '搜索用户偏好：FTS 全文搜索偏好记忆。「用户有没有提到过喜欢什么音乐？」「用户用什么手机？」用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        workspaceId: { type: 'string', description: '限定工作区（可选）' },
        limit: { type: 'number', description: '返回数量上限，默认 10' }
      },
      required: ['query']
    }
  }]

/** 调用工具 */
async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_sessions': {
      const query = String(args.query ?? '')
      const limit = Number(args.limit ?? 10)
      if (!query) throw new Error('query 不能为空')
      const results = search(query, { limit })
      return results.map((r) => ({
        sessionId: r.session.id,
        title: r.session.title,
        provider: r.session.provider,
        snippets: r.snippets.map((s) => s.snippet),
        rank: r.rank
      }))
    }

    case 'get_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const session = getSession(sessionId, true)
      if (!session) throw new Error('对话不存在')
      return {
        id: session.id,
        title: session.title,
        provider: session.provider,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages?.length ?? 0,
        messages: (session.messages ?? []).map((m) => ({
          role: m.role,
          content: m.content,
          model: m.model,
          createdAt: m.createdAt
        }))
      }
    }

    case 'list_sessions': {
      const folderId = args.folderId ? String(args.folderId) : undefined
      const limit = Number(args.limit ?? 20)
      const offset = Number(args.offset ?? 0)
      const sessions = listSessions({ folderId })
        .slice(offset, offset + limit)
        .map((s) => ({
          id: s.id,
          title: s.title,
          provider: s.provider,
          model: s.model,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
          isFavorite: s.isFavorite,
          tags: s.tags.map((t) => t.name)
        }))
      return { sessions, count: sessions.length }
    }

    case 'list_workspaces': {
      return listWorkspaces().map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description
      }))
    }

    case 'list_tags': {
      return listTags()
    }

    case 'get_session_summary': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      return getSummary(sessionId)
    }

    case 'add_session': {
      const title = String(args.title ?? '')
      const provider = String(args.provider ?? 'Unknown')
      if (!title) throw new Error('title 不能为空')
      const folderId = args.folderId ? String(args.folderId) : undefined
      const rawMessages = (args.messages ?? []) as Array<Record<string, unknown>>
      const messages = rawMessages.map((m, idx) => ({
        id: uuidv4(),
        sessionId: '',
        role: String(m.role ?? 'user') as any,
        content: String(m.content ?? ''),
        model: m.model ? String(m.model) : undefined,
        order: idx,
        createdAt: m.createdAt ? String(m.createdAt) : new Date().toISOString()
      }))
      const session = createSession({
        provider: provider as any,
        title,
        folderId,
        isFavorite: false,
        messageCount: messages.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: []
      }, messages)
      return { sessionId: session.id, title: session.title }
    }

    case 'add_message': {
      const sessionId = String(args.sessionId ?? '')
      const role = String(args.role ?? 'user')
      const content = String(args.content ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      if (!content) throw new Error('content 不能为空')
      const session = getSession(sessionId, false)
      if (!session) throw new Error('对话不存在')
      const db = getDatabase()
      const msgId = uuidv4()
      const now = new Date().toISOString()
      const order = (db.prepare('SELECT COUNT(*) as n FROM messages WHERE session_id = ?').get(sessionId) as { n: number }).n

      const tx = db.transaction(() => {
        db.prepare(
          'INSERT INTO messages (id, session_id, role, content, model, tokens, msg_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(msgId, sessionId, role, content, args.model ? String(args.model) : null, null, order, now)
        db.prepare('UPDATE chat_sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?').run(now, sessionId)
      })
      tx()
      // 更新 FTS 索引（事务外，与 createSession 保持一致：FTS 失败不应阻塞消息写入）
      try {
        indexSessionForSearch(sessionId, session.title, [{ content }], session.provider)
      } catch (e) {
        console.warn('[MCP] add_message: 重建 FTS 索引失败（不影响消息写入）:', e)
      }
      return { messageId: msgId, sessionId, order }
    }

    case 'memory_recall': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 5)
      const threshold = Number(args.threshold ?? 0.25)

      // 从主进程文件 + secretStore 组装 AiConfig
      const configFile = loadAiConfigFile()
      const activeProvider = configFile.activeProvider ?? 'openai'
      const stored = configFile.configs[activeProvider]
      if (!stored || !stored.hasApiKey) {
        throw new Error(
          '未配置 AI 供应商或未设置 API Key。请在 Memora UI 的「设置 → AI 配置」中配置供应商和密钥后再使用 memory_recall。'
        )
      }
      const apiKeys = getAllApiKeys()
      const apiKey = apiKeys[activeProvider]
      if (!apiKey) {
        throw new Error('API Key 未在加密存储中找到，请在 Memora UI 重新配置 API Key。')
      }
      const config: AiConfig = {
        provider: activeProvider as AiConfig['provider'],
        baseUrl: stored.baseUrl,
        apiKey,
        chatModel: stored.chatModel,
        embeddingModel: stored.embeddingModel,
        embeddingDim: stored.embeddingDim
      }

      const results = await semanticSearch(query, config, { limit, threshold })
      return results.map((r) => ({
        sessionId: r.session.id,
        title: r.session.title,
        provider: r.session.provider,
        snippet: r.snippet,
        score: r.score
      }))
    }

    case 'memory_write': {
      const title = String(args.title ?? '')
      const content = String(args.content ?? '')
      if (!title) throw new Error('title 不能为空')
      if (!content) throw new Error('content 不能为空')
      const provider = String(args.provider ?? 'Unknown')
      const folderId = args.folderId ? String(args.folderId) : undefined
      const type = (String(args.type ?? 'knowledge') as 'knowledge' | 'decision' | 'task')
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined

      // 优先写入 knowledge_entries（结构化知识条目）
      let entryId: string | undefined
      if (workspaceId) {
        const entry = createEntry({
          workspaceId,
          type,
          title,
          content,
          source: 'mcp',
          status: type === 'task' ? 'open' : 'active'
        })
        entryId = entry.id
      }

      // 若提供 folderId，同时创建一条对话记录（保留旧行为）
      let sessionId: string | undefined
      if (folderId) {
        const messages = [
          {
            id: uuidv4(),
            sessionId: '',
            role: 'user' as const,
            content: title,
            order: 0,
            createdAt: new Date().toISOString()
          },
          {
            id: uuidv4(),
            sessionId: '',
            role: 'assistant' as const,
            content,
            order: 1,
            createdAt: new Date().toISOString()
          }
        ]
        const session = createSession(
          {
            provider: provider as any,
            title,
            folderId,
            isFavorite: false,
            messageCount: messages.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: []
          },
          messages
        )
        sessionId = session.id
      }

      return {
        entryId,
        sessionId,
        title,
        type,
        written: true,
        note: workspaceId
          ? `已写入 knowledge_entries（type=${type}）`
          : folderId
            ? '已写入对话记录（未提供 workspaceId，跳过 knowledge_entries）'
            : '未提供 workspaceId 或 folderId，未持久化（请至少提供一个）'
      }
    }

    case 'knowledge_search': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 10)
      const type = args.type ? (String(args.type) as 'knowledge' | 'decision' | 'task') : undefined
      const results = searchEntries(query, { type, limit })
      return results.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        content: e.content,
        status: e.status,
        source: e.source,
        sessionId: e.sessionId,
        createdAt: e.createdAt
      }))
    }

    case 'decision_search': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 10)
      const results = searchEntries(query, { type: 'decision', limit })
      return results.map((e) => ({
        id: e.id,
        title: e.title,
        content: e.content,
        status: e.status,
        sessionId: e.sessionId,
        createdAt: e.createdAt
      }))
    }

    case 'project_context': {
      const workspaceId = String(args.workspaceId ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')

      const counts = countEntries(workspaceId)
      const decisions = listEntries({ workspaceId, type: 'decision', limit: 20 })
      const openTasks = listEntries({ workspaceId, type: 'task', status: 'open', limit: 30 })
      const knowledge = listEntries({ workspaceId, type: 'knowledge', limit: 20 })

      return {
        workspaceId,
        summary: {
          totalEntries: counts.total,
          decisions: counts.decision,
          openTasks: counts.openTask,
          knowledge: counts.knowledge
        },
        recentDecisions: decisions.map((e) => ({ id: e.id, title: e.title, content: e.content, status: e.status, sessionId: e.sessionId, createdAt: e.createdAt })),
        openTasks: openTasks.map((e) => ({ id: e.id, title: e.title, content: e.content, sessionId: e.sessionId, createdAt: e.createdAt })),
        coreKnowledge: knowledge.map((e) => ({ id: e.id, title: e.title, content: e.content, sessionId: e.sessionId, createdAt: e.createdAt }))
      }
    }

    case 'memory_profile': {
      const workspaceId = String(args.workspaceId ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      return getUserProfile(workspaceId)
    }

    case 'memory_save_preference': {
      const workspaceId = String(args.workspaceId ?? '')
      const subject = String(args.subject ?? '')
      const value = String(args.value ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      if (!subject) throw new Error('subject 不能为空')
      if (!value) throw new Error('value 不能为空')
      const sessionId = args.sessionId ? String(args.sessionId) : undefined
      const confidence = args.confidence ? Number(args.confidence) : undefined
      const pref = createPreference({
        workspaceId,
        sessionId,
        subject,
        value,
        confidence,
        source: 'mcp'
      })
      return {
        preferenceId: pref.id,
        subject: pref.subject,
        value: pref.value,
        confidence: pref.confidence,
        status: pref.status,
        note: pref.status === 'active' ? '新偏好已保存' : '已更新已有偏好（复现增强）'
      }
    }

    case 'memory_forget': {
      const preferenceId = String(args.preferenceId ?? '')
      if (!preferenceId) throw new Error('preferenceId 不能为空')
      const pref = archivePreference(preferenceId)
      if (!pref) throw new Error('偏好不存在')
      return { preferenceId, status: 'archived', note: '偏好已遗忘（archived）' }
    }

    case 'preference_search': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 10)
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const results = searchPreferences(query, { workspaceId, limit })
      return results.map((p) => ({
        id: p.id,
        subject: p.subject,
        value: p.value,
        confidence: p.confidence,
        status: p.status,
        source: p.source,
        createdAt: p.createdAt,
        lastAccessedAt: p.lastAccessedAt,
        accessCount: p.accessCount
      }))
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}

/** 启动 MCP Server（stdio 传输） */
export async function startMcpServer(): Promise<void> {
  // 初始化数据库
  initDatabase()

  const rl = createInterface({ input: process.stdin, terminal: false })

  const send = (response: JsonRpcResponse) => {
    process.stdout.write(JSON.stringify(response) + '\n')
  }

  rl.on('line', (line: string) => {
    if (!line.trim()) return

    let request: JsonRpcRequest
    try {
      request = JSON.parse(line)
    } catch {
      return // 忽略无效 JSON
    }

    const { id, method, params } = request
    if (id === undefined) return // 通知，无需响应

    try {
      switch (method) {
        case 'initialize':
          send({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: {
                name: 'Memora',
                version: '1.4.0'
              }
            }
          })
          break

        case 'initialized':
          // 通知，无需响应
          break

        case 'tools/list':
          send({
            jsonrpc: '2.0',
            id,
            result: { tools: TOOLS }
          })
          break

        case 'tools/call': {
          const toolName = String(params?.name ?? '')
          const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>
          callTool(toolName, toolArgs)
            .then((result) => {
              send({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(result, null, 2)
                    }
                  ]
                }
              })
            })
            .catch((err) => {
              send({
                jsonrpc: '2.0',
                id,
                result: {
                  isError: true,
                  content: [
                    {
                      type: 'text',
                      text: `工具调用失败: ${err instanceof Error ? err.message : String(err)}`
                    }
                  ]
                }
              })
            })
          break
        }

        default:
          send({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `未知方法: ${method}` }
          })
      }
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err)
        }
      })
    }
  })

  rl.on('close', () => {
    process.exit(0)
  })
}
