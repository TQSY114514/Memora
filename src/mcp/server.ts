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
import { handleSessionsTool } from './tools/sessions'
import { handleKnowledgeTool } from './tools/knowledge'
import { handleMemoryTool } from './tools/memory'
import { handleWorkspaceTool } from './tools/workspace'

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

/**
 * 调用工具（导出供单测：路由 + 访问控制集成验证）
 * @internal 仅供 server.ts 与测试使用，外部不应直接调用
 */
export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
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
    // sessions 域
    case 'search_sessions':
    case 'get_session':
    case 'list_sessions':
    case 'get_session_summary':
    case 'add_session':
    case 'add_message':
    case 'update_session':
    case 'delete_session':
    case 'export_session':
    case 'summarize_session':
      return handleSessionsTool(name, args)

    // knowledge 域
    case 'knowledge_search':
    case 'decision_search':
    case 'project_context':
    case 'knowledge_entry_update':
    case 'knowledge_entry_delete':
      return handleKnowledgeTool(name, args)

    // memory 域
    case 'memory_recall':
    case 'memory_write':
    case 'memory_save_preference':
    case 'memory_profile':
    case 'memory_forget':
    case 'preference_search':
      return handleMemoryTool(name, args)

    // workspace 域
    case 'list_workspaces':
    case 'list_tags':
    case 'create_folder':
    case 'list_folders':
      return handleWorkspaceTool(name, args)

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
                version: app.getVersion()
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
