/**
 * MCP Server — 把 Memora 的对话数据暴露给外部 AI 工具
 *
 * 实现 Model Context Protocol (MCP) 的子集：
 * - JSON-RPC 2.0 over stdio
 * - initialize 握手
 * - tools/list 列出可用工具
 * - tools/call 调用工具
 *
 * 暴露 30 个工具（v1.12），按域：
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
  auditToolCall,
  isToolAllowed,
  ALLOWED_TOOLS,
  checkClientPermission
} from './accessControl'
import { handleSessionsTool } from './tools/sessions'
import { handleKnowledgeTool } from './tools/knowledge'
import { handleMemoryTool } from './tools/memory'
import { handleWorkspaceTool } from './tools/workspace'
import { handleAdvancedMCPTool } from './tools/advanced'
import { validateToolArgs } from './validation'

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
 *
 * @param name - 工具名称
 * @param args - 工具参数
 * @param clientId - 可选，MCP 客户端标识（用于数据库权限检查）
 */
export async function callTool(name: string, args: Record<string, unknown>, clientId?: string): Promise<unknown> {
  // 数据库权限检查（v1.10）：如果提供了 clientId，优先使用数据库模式
  if (clientId) {
    const perm = checkClientPermission(clientId, name)
    if (!perm.allowed) {
      auditToolCall(name, args, false, `client ${clientId}: ${perm.reason}`)
      throw new Error(
        `[PERMISSION] 客户端 "${clientId}" 无权访问工具 ${name}。` +
        `原因: ${perm.reason}。请在 Memora GUI 中配置 MCP 权限。`
      )
    }
  } else {
    // 回退到环境变量模式（向后兼容）
    // 工具白名单检查（管理员可通过 MEMORA_ALLOWED_TOOLS 限制可用工具）
    if (!isToolAllowed(name)) {
      auditToolCall(name, args, false, 'tool not in whitelist')
      throw new Error(
        `[WHITELIST] 工具 ${name} 不在允许列表中。` +
        '管理员已通过 MEMORA_ALLOWED_TOOLS 环境变量限制了可用工具。'
      )
    }
  }

  // 参数校验（Zod schema 校验，防止恶意/畸形数据注入）
  const validatedArgs = validateToolArgs(name, args)

  // 破坏性工具检查（最高优先级，默认拒绝）
  if (DESTRUCTIVE_TOOLS.has(name)) {
    if (!isDestructiveEnabled && !clientId) {
      auditToolCall(name, validatedArgs, false, 'destructive not enabled')
      throw new Error(
        '[DESTRUCTIVE] 破坏性操作（delete/forget）默认禁止。' +
        '如需启用，请设置 MEMORA_DESTRUCTIVE=true 或传入 --destructive 参数（同时需 --write）。' +
        '建议优先在 Memora GUI 中执行删除以便回收站找回。'
      )
    }
    auditToolCall(name, validatedArgs, true, 'destructive')
  } else if (WRITE_TOOLS.has(name)) {
    // 普通写工具检查（默认只读，需 opt-in）
    if (!isWriteEnabled && !clientId) {
      auditToolCall(name, validatedArgs, false, 'write not enabled')
      throw new Error(
        '[READONLY] MCP 默认只读，不允许执行写入操作。' +
        '如需写入，请设置 MEMORA_WRITE=true 或传入 --write 参数。'
      )
    }
    auditToolCall(name, validatedArgs, true, 'write')
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
      return handleSessionsTool(name, validatedArgs)

    // knowledge 域
    case 'knowledge_search':
    case 'decision_search':
    case 'project_context':
    case 'knowledge_entry_update':
    case 'knowledge_entry_delete':
      return handleKnowledgeTool(name, validatedArgs)

    // memory 域
    case 'memory_recall':
    case 'memory_write':
    case 'memory_save_preference':
    case 'memory_profile':
    case 'memory_get_constitution':
    case 'memory_forget':
    case 'preference_search':
    case 'memory_audit_log':
      return handleMemoryTool(name, validatedArgs)

    // workspace 域
    case 'list_workspaces':
    case 'list_tags':
    case 'create_folder':
    case 'list_folders':
      return handleWorkspaceTool(name, validatedArgs)

    // advanced 域（v2.0）：memory_explain / memory_timeline / memory_diff / memory_consolidate
    case 'memory_explain':
    case 'memory_timeline':
    case 'memory_diff':
    case 'memory_consolidate':
      return handleAdvancedMCPTool(name, validatedArgs)

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
    destructiveEnabled: isDestructiveEnabled,
    whitelist: ALLOWED_TOOLS ? `${ALLOWED_TOOLS.size} tools` : 'all tools'
  })

  const rl = createInterface({ input: process.stdin, terminal: false })
  let clientId: string | undefined

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
        case 'initialize': {
          // 提取客户端信息用于权限检查
          const clientInfo = params?.clientInfo as { name?: string; version?: string } | undefined
          if (clientInfo?.name) {
            clientId = clientInfo.name.toLowerCase().replace(/\s+/g, '-')
            logger.info(`[MCP] client connected: ${clientId}`, clientInfo)
          }
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
        }

        case 'initialized':
          // 通知，无需响应
          break

        case 'tools/list': {
          const whitelist = ALLOWED_TOOLS
          const visibleTools = whitelist
            ? TOOLS.filter((t) => whitelist.has(t.name))
            : TOOLS
          send({
            jsonrpc: '2.0',
            id,
            result: {
              tools: visibleTools,
              _note: isReadOnly
                ? '当前为只读模式，写入类工具（add_session, add_message, memory_write 等）不可用。'
                : undefined
            }
          })
          break
        }

        case 'tools/call': {
          const toolName = String(params?.name ?? '')
          const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>
          callTool(toolName, toolArgs, clientId)
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
