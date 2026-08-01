/**
 * MCP Server — 把 Memora 的对话数据暴露给外部 AI 工具
 *
 * 实现 Model Context Protocol (MCP) 的子集：
 * - JSON-RPC 2.0 over stdio
 * - initialize 握手
 * - tools/list 列出可用工具
 * - tools/call 调用工具
 *
 * 暴露 25 个工具（v1.8），按域：
 *   会话: search_sessions / get_session / list_sessions / add_session / add_message / update_session / delete_session
 *   工作区/文件夹/标签: list_workspaces / list_folders / create_folder / list_tags
 *   知识库: knowledge_search / knowledge_list / knowledge_entry_create / knowledge_entry_update / knowledge_entry_delete
 *   偏好/画像: memory_search / memory_write / memory_save_preference / memory_forget / get_user_profile
 *   总结/语义: get_session_summary / semantic_search
 *
 * 访问控制（v1.8，默认只读）：
 *   默认只读；MEMORA_WRITE=true / --write 开启普通写；MEMORA_DESTRUCTIVE=true / --destructive 开启删除类。
 *   所有写/破坏性调用均写入审计日志。
 *
 * 使用方式：
 *   在 Claude Desktop 的 config 中添加：
 *   {
 *     "mcpServers": {
 *       "Memora": {
 *         "command": "node",
 *         "args": ["<Memora-path>/out/main/index.js", "--mcp"]
 *       }
 *     }
 *   }
 */

import { createInterface } from 'readline'
import { app } from 'electron'
import { initDatabase } from '../database/connection'
import { listSessions, getSession, createSession, updateSession, deleteSession } from '../database/repositories/sessionRepo'
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
import { listFolders, createFolder } from '../database/repositories/folderRepo'
import { updateEntry, deleteEntry } from '../database/repositories/knowledgeRepo'
import { generateSummary } from '../ai/summarizer'
import { search } from '../search/query'
import { semanticSearch } from '../search/semantic'
import { loadAiConfigFile } from '../main/aiConfigFile'
import { getAllApiKeys } from '../main/secretStore'
import { getDatabase } from '../database/connection'
import { v4 as uuidv4 } from 'uuid'
import type { AiConfig } from '@shared/types'
import { logger } from '../main/logger'
import { TOOLS } from './schemas'
import {
  isReadOnly,
  isWriteEnabled,
  isDestructiveEnabled,
  WRITE_TOOLS,
  DESTRUCTIVE_TOOLS,
  auditToolCall
} from './accessControl'

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

/** 调用工具 */
async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // 破坏性工具检查（最高优先级，默认拒绝）
  if (DESTRUCTIVE_TOOLS.has(name)) {
    if (!isDestructiveEnabled) {
      auditToolCall(name, args, false, 'destructive not enabled')
      throw new Error(
        '[DESTRUCTIVE] 破坏性操作（delete/forget）默认禁止。' +
        '如需启用，请设置 MEMORA_DESTRUCTIVE=true 或传入 --destructive 参数（同时需 --write）。' +
        '建议优先在 Memora GUI 中执行删除以便回收站找回。'
      )
    }
    auditToolCall(name, args, true, 'destructive')
  } else if (WRITE_TOOLS.has(name)) {
    // 普通写工具检查（默认只读，需 opt-in）
    if (!isWriteEnabled) {
      auditToolCall(name, args, false, 'write not enabled')
      throw new Error(
        '[READONLY] MCP 默认只读，不允许执行写入操作。' +
        '如需写入，请设置 MEMORA_WRITE=true 或传入 --write 参数。'
      )
    }
    auditToolCall(name, args, true, 'write')
  }

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

    case 'update_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = String(args.title)
      if (args.description !== undefined) patch.description = String(args.description)
      if (args.folderId !== undefined) patch.folderId = args.folderId === '' ? null : String(args.folderId)
      if (args.isFavorite !== undefined) patch.isFavorite = Boolean(args.isFavorite)
      updateSession(sessionId, patch as any)
      const updated = getSession(sessionId, false)
      return { sessionId, updated: !!updated }
    }

    case 'delete_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const session = getSession(sessionId, false)
      if (!session) throw new Error('对话不存在')
      deleteSession(sessionId)
      return { sessionId, deleted: true }
    }

    case 'create_folder': {
      const workspaceId = String(args.workspaceId ?? '')
      const name = String(args.name ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      if (!name) throw new Error('name 不能为空')
      const parentId = args.parentId ? String(args.parentId) : undefined
      const folder = createFolder({ workspaceId, name, parentId })
      return { folderId: folder.id, name: folder.name, workspaceId }
    }

    case 'list_folders': {
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const folders = listFolders(workspaceId)
      return folders.map((f) => ({
        id: f.id,
        name: f.name,
        workspaceId: f.workspaceId,
        parentId: f.parentId,
        sortOrder: f.sortOrder,
        isSmart: !!f.rule
      }))
    }

    case 'export_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const format = String(args.format ?? 'markdown')
      const session = getSession(sessionId, true)
      if (!session) throw new Error('对话不存在')
      const messages = session.messages || []
      // html 导出不受支持，使用 markdown 导出
      if (format !== 'markdown') {
        // 只支持 markdown 格式
      }
      let md = `# ${session.title}\n\n`
      md += `> 来源: ${session.provider} | ${new Date(session.createdAt).toLocaleString('zh-CN')}\n\n`
      md += `---\n\n`
      for (const m of messages) {
        const role = m.role === 'user' ? '**👤 用户**' : m.role === 'assistant' ? '**🤖 AI**' : `**${m.role}**`
        md += `${role}:\n\n${m.content}\n\n---\n\n`
      }
      md += `*导出时间: ${new Date().toLocaleString('zh-CN')}*\n`
      return { format: 'markdown', content: md, sessionId, title: session.title }
    }

    case 'summarize_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const configFile = loadAiConfigFile()
      const activeProvider = configFile.activeProvider ?? 'openai'
      const stored = configFile.configs[activeProvider]
      if (!stored || !stored.hasApiKey) {
        throw new Error('未配置 AI 供应商。请在 Memora UI 的「设置 → AI 配置」中配置供应商后再使用 summarize_session。')
      }
      const apiKeys = getAllApiKeys()
      const apiKey = apiKeys[activeProvider]
      if (!apiKey) throw new Error('API Key 未在加密存储中找到')
      const config: AiConfig = {
        provider: activeProvider as AiConfig['provider'],
        baseUrl: stored.baseUrl,
        apiKey,
        chatModel: stored.chatModel,
        embeddingModel: stored.embeddingModel,
        embeddingDim: stored.embeddingDim
      }
      const summary = await generateSummary(sessionId, config)
      return {
        sessionId,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        todos: summary.todos,
        knowledge: summary.knowledge,
        suggestedTags: summary.suggestedTags,
        model: summary.model
      }
    }

    case 'knowledge_entry_update': {
      const entryId = String(args.entryId ?? '')
      if (!entryId) throw new Error('entryId 不能为空')
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = String(args.title)
      if (args.content !== undefined) patch.content = String(args.content)
      if (args.type !== undefined) patch.type = String(args.type)
      if (args.status !== undefined) patch.status = String(args.status)
      const updated = updateEntry(entryId, patch as any)
      if (!updated) throw new Error('知识条目不存在')
      return { entryId, updated: true }
    }

    case 'knowledge_entry_delete': {
      const entryId = String(args.entryId ?? '')
      if (!entryId) throw new Error('entryId 不能为空')
      deleteEntry(entryId)
      return { entryId, deleted: true }
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}

/** 启动 MCP Server（stdio 传输） */
export async function startMcpServer(): Promise<void> {
  // 初始化数据库
  initDatabase()

  // 记录访问控制状态（便于审计与排障）
  logger.info('MCP server starting', {
    readOnly: isReadOnly,
    writeEnabled: isWriteEnabled,
    destructiveEnabled: isDestructiveEnabled
  })

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
                version: '1.7.1'
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
            result: {
              tools: TOOLS,
              _note: isReadOnly
                ? '当前为只读模式，写入类工具（add_session, add_message, memory_write 等）不可用。'
                : undefined
            }
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
