/**
 * MCP Client Permissions Repository
 *
 * 按客户端粒度管理 MCP 工具权限，存储在 SQLite 中。
 * 替代环境变量方式，支持 UI 管理。
 */
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'

export interface McpClientPermission {
  id: string
  clientId: string
  clientName: string
  /** 权限级别：'readonly' | 'write' | 'full' */
  level: string
  /** 允许的工具白名单（逗号分隔，空=全部允许） */
  allowedTools: string | null
  /** 是否启用 */
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface McpPermissionRow {
  id: string
  client_id: string
  client_name: string
  level: string
  allowed_tools: string | null
  enabled: number
  created_at: string
  updated_at: string
}

function rowToPermission(row: McpPermissionRow): McpClientPermission {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    level: row.level,
    allowedTools: row.allowed_tools,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 确保 MCP 权限表存在（首次访问时创建） */
function ensureTable(): void {
  const db = getDatabase()
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_client_permissions (
      id            TEXT PRIMARY KEY,
      client_id     TEXT NOT NULL,
      client_name   TEXT NOT NULL,
      level         TEXT NOT NULL DEFAULT 'readonly',
      allowed_tools TEXT,
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_client_id ON mcp_client_permissions(client_id);
  `)
}

/** 列出所有 MCP 客户端权限 */
export function listMcpPermissions(): McpClientPermission[] {
  ensureTable()
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM mcp_client_permissions ORDER BY created_at DESC')
    .all() as McpPermissionRow[]
  return rows.map(rowToPermission)
}

/** 保存/更新 MCP 客户端权限 */
export function saveMcpPermission(input: {
  clientId: string
  clientName: string
  level?: string
  allowedTools?: string | null
  enabled?: boolean
}): McpClientPermission {
  ensureTable()
  const db = getDatabase()
  const now = new Date().toISOString()

  const existing = db
    .prepare('SELECT * FROM mcp_client_permissions WHERE client_id = ?')
    .get(input.clientId) as McpPermissionRow | undefined

  if (existing) {
    const level = input.level ?? existing.level
    const allowedTools = input.allowedTools !== undefined ? input.allowedTools : existing.allowed_tools
    const enabled = input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled

    db.prepare(
      `UPDATE mcp_client_permissions
       SET client_name = ?, level = ?, allowed_tools = ?, enabled = ?, updated_at = ?
       WHERE client_id = ?`
    ).run(input.clientName, level, allowedTools, enabled, now, input.clientId)

    return {
      ...existing,
      client_name: input.clientName,
      level,
      allowed_tools: allowedTools,
      enabled: enabled === 1,
      updated_at: now
    } as unknown as McpClientPermission
  }

  const id = uuidv4()
  const level = input.level ?? 'readonly'
  const allowedTools = input.allowedTools ?? null
  const enabled = input.enabled !== false ? 1 : 0

  db.prepare(
    `INSERT INTO mcp_client_permissions
     (id, client_id, client_name, level, allowed_tools, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.clientId, input.clientName, level, allowedTools, enabled, now, now)

  return {
    id,
    clientId: input.clientId,
    clientName: input.clientName,
    level,
    allowedTools,
    enabled: enabled === 1,
    createdAt: now,
    updatedAt: now
  }
}

/** 删除 MCP 客户端权限 */
export function deleteMcpPermission(clientId: string): boolean {
  ensureTable()
  const db = getDatabase()
  const result = db
    .prepare('DELETE FROM mcp_client_permissions WHERE client_id = ?')
    .run(clientId)
  return result.changes > 0
}

/** 检查客户端是否有权限执行指定工具 */
export function checkMcpPermission(clientId: string, toolName: string): {
  allowed: boolean
  reason: string
  level: string
} {
  ensureTable()
  const db = getDatabase()

  // 如果没有配置任何客户端权限，回退到环境变量模式
  const count = (db.prepare('SELECT COUNT(*) as n FROM mcp_client_permissions').get() as { n: number }).n
  if (count === 0) {
    return { allowed: true, reason: 'no client permissions configured, falling back to env vars', level: 'inherit' }
  }

  const row = db
    .prepare('SELECT * FROM mcp_client_permissions WHERE client_id = ?')
    .get(clientId) as McpPermissionRow | undefined

  if (!row) {
    return { allowed: false, reason: `未知客户端: ${clientId}`, level: 'none' }
  }

  if (!row.enabled) {
    return { allowed: false, reason: `客户端 ${row.client_name} 已被禁用`, level: 'disabled' }
  }

  // 工具白名单检查
  if (row.allowed_tools) {
    const allowedSet = new Set(row.allowed_tools.split(',').map((t) => t.trim()).filter(Boolean))
    if (!allowedSet.has(toolName)) {
      return { allowed: false, reason: `工具 ${toolName} 不在 ${row.client_name} 的允许列表中`, level: row.level }
    }
  }

  return { allowed: true, reason: '', level: row.level }
}