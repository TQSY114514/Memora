/**
 * Memory Blocks Repository（v1.15 行动项 2：Letta 式结构化记忆块）
 *
 * 比偏好更自由的键值记忆：label 唯一（human / persona / project_context / custom:xxx），
 * value 为 markdown 文本，每次 save 记录变更历史，支持版本回滚。
 *
 * read_only 块（系统/导入保护）：
 * - AI/MCP 调用 save/delete 时若块为 read_only 则拒绝（changedBy 校验）
 * - 用户（changedBy='user'）可修改 read_only 块
 */
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import type { MemoryBlock, MemoryBlockHistory } from '@shared/types'

interface MemoryBlockRow {
  id: string
  workspace_id: string
  label: string
  value: string
  read_only: number
  created_at: string
  updated_at: string
}

interface MemoryBlockHistoryRow {
  id: string
  block_id: string
  old_value: string | null
  new_value: string
  changed_by: string
  reason: string | null
  created_at: string
}

function blockRowToBlock(row: MemoryBlockRow): MemoryBlock {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    label: row.label,
    value: row.value,
    readOnly: row.read_only === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function historyRowToHistory(row: MemoryBlockHistoryRow): MemoryBlockHistory {
  return {
    id: row.id,
    blockId: row.block_id,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value,
    changedBy: row.changed_by,
    reason: row.reason ?? undefined,
    createdAt: row.created_at
  }
}

/** 按 label 查询块（workspace 内唯一） */
export function getBlockByLabel(workspaceId: string, label: string): MemoryBlock | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM memory_blocks WHERE workspace_id = ? AND label = ?')
    .get(workspaceId, label) as MemoryBlockRow | undefined
  return row ? blockRowToBlock(row) : null
}

/** 按 id 查询块 */
export function getBlock(id: string): MemoryBlock | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM memory_blocks WHERE id = ?').get(id) as MemoryBlockRow | undefined
  return row ? blockRowToBlock(row) : null
}

/** 列出块（可按工作区） */
export function listBlocks(workspaceId?: string): MemoryBlock[] {
  const db = getDatabase()
  if (workspaceId) {
    const rows = db
      .prepare('SELECT * FROM memory_blocks WHERE workspace_id = ? ORDER BY label ASC')
      .all(workspaceId) as MemoryBlockRow[]
    return rows.map(blockRowToBlock)
  }
  const rows = db.prepare('SELECT * FROM memory_blocks ORDER BY workspace_id, label ASC').all() as MemoryBlockRow[]
  return rows.map(blockRowToBlock)
}

/**
 * 保存块（upsert by label）
 * - 不存在则创建；存在则更新 value 并记 history
 * - read_only 块仅 changed_by='user' 可写（AI/MCP 拒绝）
 * - changed_by：'user' | 'mcp' | 'ai' | 'import' | 'system'
 */
export function saveBlock(input: {
  workspaceId: string
  label: string
  value: string
  readOnly?: boolean
  changedBy?: string
  reason?: string
}): MemoryBlock {
  const db = getDatabase()
  const existing = getBlockByLabel(input.workspaceId, input.label)
  const changedBy = input.changedBy ?? 'user'

  // read_only 保护：非用户来源不可覆盖只读块
  if (existing?.readOnly && changedBy !== 'user') {
    throw new Error(
      `[READONLY] memory block "${input.label}" 为只读保护块（read_only=1），` +
      `仅用户可修改。AI/MCP 写入被拒绝。`
    )
  }

  const now = new Date().toISOString()

  if (existing) {
    if (existing.value === input.value) return existing // 值未变，跳过
    // 更新块 + 记录变更历史（同事务）
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE memory_blocks SET value = ?, read_only = ?, updated_at = ? WHERE id = ?`
      ).run(input.value, input.readOnly !== undefined ? (input.readOnly ? 1 : 0) : existing.readOnly ? 1 : 0, now, existing.id)
      db.prepare(
        `INSERT INTO memory_block_history (id, block_id, old_value, new_value, changed_by, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), existing.id, existing.value, input.value, changedBy, input.reason ?? null, now)
    })
    tx()
    return getBlock(existing.id)!
  }

  // 创建新块
  const id = uuidv4()
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO memory_blocks (id, workspace_id, label, value, read_only, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.workspaceId, input.label, input.value, input.readOnly ? 1 : 0, now, now)
    db.prepare(
      `INSERT INTO memory_block_history (id, block_id, old_value, new_value, changed_by, reason, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`
    ).run(uuidv4(), id, input.value, changedBy, input.reason ?? null, now)
  })
  tx()
  return getBlock(id)!
}

/** 删除块（级联删除 history）。read_only 保护同上。 */
export function deleteBlock(id: string, changedBy = 'user'): void {
  const db = getDatabase()
  const existing = getBlock(id)
  if (!existing) return
  if (existing.readOnly && changedBy !== 'user') {
    throw new Error(
      `[BLOCKREADONLY] memory block "${existing.label}" 为只读保护，仅 user 可删除。`
    )
  }
  db.prepare('DELETE FROM memory_blocks WHERE id = ?').run(id)
}

/** 获取块变更历史（按时间倒序） */
export function listBlockHistory(blockId: string, limit = 50): MemoryBlockHistory[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM memory_block_history WHERE block_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(blockId, limit) as MemoryBlockHistoryRow[]
  return rows.map(historyRowToHistory)
}

/**
 * 回滚到指定历史版本
 * - 把块恢复到 history 记录中某个 old_value（即回滚到该次变更之前的状态）
 * - changed_by='user' 校验只读保护；回滚本身也记一条 history（reason='rollback'）
 * 返回更新后的块；history 不存在时抛错。
 */
export function rollbackBlock(
  blockId: string,
  historyId: string,
  changedBy = 'user'
): MemoryBlock {
  const db = getDatabase()
  const existing = getBlock(blockId)
  if (!existing) throw new Error(`[BLOCK] memory block ${blockId} 不存在`)
  if (existing.readOnly && changedBy !== 'user') {
    throw new Error(`[BLOCKREADONLY] memory block "${existing.label}" 为只读保护，仅 user 可回滚。`)
  }

  const target = db
    .prepare('SELECT * FROM memory_block_history WHERE id = ? AND block_id = ?')
    .get(historyId, blockId) as MemoryBlockHistoryRow | undefined
  if (!target) throw new Error(`[BLOCK] history ${historyId} 不存在于块 ${blockId}`)

  // 目标版本 = 该次变更前的值（old_value），首次创建无 old_value 则不允许回滚到空
  if (target.old_value === null) {
    throw new Error(`[BLOCK] history ${historyId} 是初始创建记录，无可回滚的旧版本`)
  }

  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('UPDATE memory_blocks SET value = ?, updated_at = ? WHERE id = ?').run(
      target.old_value, now, blockId
    )
    db.prepare(
      `INSERT INTO memory_block_history (id, block_id, old_value, new_value, changed_by, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(), blockId, existing.value, target.old_value, changedBy,
      `rollback to ${historyId}`, now
    )
  })
  tx()
  return getBlock(blockId)!
}