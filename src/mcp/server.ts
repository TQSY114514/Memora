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
import { initDatabase } from '../database/connection'
import { listSessions, getSession, createSession } from '../database/repositories/sessionRepo'
import { listWorkspaces } from '../database/repositories/workspaceRepo'
import { listTags } from '../database/repositories/tagRepo'
import { getSummary } from '../database/repositories/summaryRepo'
import { search } from '../search/query'
import { getDatabase } from '../database/connection'
import { v4 as uuidv4 } from 'uuid'

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
      const indexSessionForSearch = require('../database/repositories/sessionRepo').indexSessionForSearch

      const tx = db.transaction(() => {
        db.prepare(
          'INSERT INTO messages (id, session_id, role, content, model, tokens, msg_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(msgId, sessionId, role, content, args.model ? String(args.model) : null, null, order, now)
        db.prepare('UPDATE chat_sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?').run(now, sessionId)
      })
      tx()
      return { messageId: msgId, sessionId, order }
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
                version: '0.1.0'
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
