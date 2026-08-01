import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import { buildUpdateSets } from './sqlHelpers'
import { segment } from '@search/segmenter'
import type {
  KnowledgeEntry,
  KnowledgeType,
  KnowledgeSource,
  KnowledgeRelationRow,
  KnowledgeRelation,
  GraphEdge,
  KnowledgeGraphData
} from '@shared/types'

interface KnowledgeRow {
  id: string
  workspace_id: string
  session_id: string | null
  type: string
  title: string
  content: string | null
  status: string
  source: string
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToEntry(row: KnowledgeRow): KnowledgeEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id ?? undefined,
    type: row.type as KnowledgeType,
    title: row.title,
    content: row.content ?? undefined,
    status: row.status,
    source: row.source as KnowledgeSource,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 建立/重建知识条目的 FTS 索引（中文分词） */
function indexEntryForSearch(entryId: string, title: string, content: string | null, type: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM knowledge_fts WHERE entry_id = ?').run(entryId)
  db.prepare(
    'INSERT INTO knowledge_fts (entry_id, title, content, type) VALUES (?, ?, ?, ?)'
  ).run(entryId, segment(title), content ? segment(content) : '', type)
}

/** 删除知识条目的 FTS 索引 */
function unindexEntry(entryId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM knowledge_fts WHERE entry_id = ?').run(entryId)
}

/** 创建知识条目 */
export function createEntry(
  input: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'> & { sortOrder?: number }
): KnowledgeEntry {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO knowledge_entries
       (id, workspace_id, session_id, type, title, content, status, source, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.workspaceId,
      input.sessionId ?? null,
      input.type,
      input.title,
      input.content ?? null,
      input.status ?? (input.type === 'task' ? 'open' : 'active'),
      input.source ?? 'manual',
      input.sortOrder ?? 0,
      now,
      now
    )
  })
  tx()

  // FTS 索引（事务外，避免索引失败影响写入）
  try {
    indexEntryForSearch(id, input.title, input.content ?? null, input.type)
  } catch (e) {
    console.error('[knowledgeRepo] FTS 索引失败（不影响条目写入）:', e)
  }

  return getEntry(id)!
}

/** 获取单个条目 */
export function getEntry(id: string): KnowledgeEntry | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM knowledge_entries WHERE id = ?')
    .get(id) as KnowledgeRow | undefined
  return row ? rowToEntry(row) : null
}

/** 列出条目（按工作区 + 可选类型筛选） */
export function listEntries(options?: {
  workspaceId?: string
  type?: KnowledgeType
  sessionId?: string
  status?: string
  limit?: number
  offset?: number
}): KnowledgeEntry[] {
  const db = getDatabase()
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (options?.workspaceId) {
    conditions.push('workspace_id = @workspaceId')
    params.workspaceId = options.workspaceId
  }
  if (options?.type) {
    conditions.push('type = @type')
    params.type = options.type
  }
  if (options?.sessionId) {
    conditions.push('session_id = @sessionId')
    params.sessionId = options.sessionId
  }
  if (options?.status) {
    conditions.push('status = @status')
    params.status = options.status
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit ?? 1000
  const offset = options?.offset ?? 0

  const rows = db
    .prepare(
      `SELECT * FROM knowledge_entries ${where}
       ORDER BY type ASC, sort_order ASC, created_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset }) as KnowledgeRow[]

  return rows.map(rowToEntry)
}

/** 统计（用于 Workspace Overview） */
export function countEntries(workspaceId: string): {
  total: number
  knowledge: number
  decision: number
  task: number
  openTask: number
} {
  const db = getDatabase()
  const total = (
    db.prepare('SELECT COUNT(*) as n FROM knowledge_entries WHERE workspace_id = ?').get(workspaceId) as { n: number }
  ).n
  const knowledge = (
    db
      .prepare("SELECT COUNT(*) as n FROM knowledge_entries WHERE workspace_id = ? AND type = 'knowledge'")
      .get(workspaceId) as { n: number }
  ).n
  const decision = (
    db
      .prepare("SELECT COUNT(*) as n FROM knowledge_entries WHERE workspace_id = ? AND type = 'decision'")
      .get(workspaceId) as { n: number }
  ).n
  const task = (
    db
      .prepare("SELECT COUNT(*) as n FROM knowledge_entries WHERE workspace_id = ? AND type = 'task'")
      .get(workspaceId) as { n: number }
  ).n
  const openTask = (
    db
      .prepare(
        "SELECT COUNT(*) as n FROM knowledge_entries WHERE workspace_id = ? AND type = 'task' AND status = 'open'"
      )
      .get(workspaceId) as { n: number }
  ).n
  return { total, knowledge, decision, task, openTask }
}

/** 更新条目 */
export function updateEntry(
  id: string,
  patch: Partial<Pick<KnowledgeEntry, 'title' | 'content' | 'type' | 'status' | 'sortOrder'>>
): KnowledgeEntry | null {
  const db = getDatabase()
  const { sets, params } = buildUpdateSets(patch, {
    title: 'title',
    content: 'content',
    type: 'type',
    status: 'status',
    sortOrder: 'sort_order'
  })
  if (sets.length === 0) return getEntry(id)

  sets.push("updated_at = datetime('now')")
  db.prepare(`UPDATE knowledge_entries SET ${sets.join(', ')} WHERE id = @id`).run({ ...params, id })

  // 更新 FTS 索引（title/content 变化时）
  const updated = getEntry(id)
  if (updated && (patch.title !== undefined || patch.content !== undefined)) {
    try {
      indexEntryForSearch(updated.id, updated.title, updated.content ?? null, updated.type)
    } catch (e) {
      console.error('[knowledgeRepo] FTS 重建失败:', e)
    }
  }
  return updated
}

/** 切换任务完成状态 */
export function toggleTask(id: string): KnowledgeEntry | null {
  const entry = getEntry(id)
  if (!entry) return null
  const next = entry.status === 'done' ? 'open' : 'done'
  return updateEntry(id, { status: next })
}

/** 删除条目（级联删除关系 + FTS） */
export function deleteEntry(id: string): void {
  const db = getDatabase()
  const tx = db.transaction(() => {
    unindexEntry(id)
    db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(id)
  })
  tx()
}

/** FTS 搜索知识条目（中文分词） */
export function searchEntries(
  query: string,
  options?: { workspaceId?: string; type?: KnowledgeType; limit?: number }
): KnowledgeEntry[] {
  const db = getDatabase()
  // 复用 chat_fts 的查询构造：分词 + 引号包裹 + 前缀通配
  const terms = segment(query)
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) return []

  const ftsQuery = terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR ')
  const limit = options?.limit ?? 50

  let sql = `
    SELECT ke.* FROM knowledge_entries ke
    JOIN knowledge_fts ON ke.id = knowledge_fts.entry_id
    WHERE knowledge_fts MATCH ?
  `
  const params: unknown[] = [ftsQuery]
  if (options?.workspaceId) {
    sql += ' AND ke.workspace_id = ?'
    params.push(options.workspaceId)
  }
  if (options?.type) {
    sql += ' AND ke.type = ?'
    params.push(options.type)
  }
  sql += ' ORDER BY knowledge_fts.rank LIMIT ?'
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as KnowledgeRow[]
  return rows.map(rowToEntry)
}

/** 查找相关条目（同 workspace + 同 type + FTS 共现，轻量 Memory Graph） */
export function findRelatedEntries(entryId: string, limit = 5): KnowledgeEntry[] {
  const entry = getEntry(entryId)
  if (!entry) return []

  const db = getDatabase()
  // 用 title 关键词搜同工作区同类条目
  const terms = segment(entry.title)
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) return []

  const ftsQuery = terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR ')
  const rows = db
    .prepare(
      `SELECT ke.* FROM knowledge_entries ke
       JOIN knowledge_fts ON ke.id = knowledge_fts.entry_id
       WHERE knowledge_fts MATCH ?
         AND ke.workspace_id = ?
         AND ke.id != ?
       ORDER BY knowledge_fts.rank LIMIT ?`
    )
    .all(ftsQuery, entry.workspaceId, entryId, limit) as KnowledgeRow[]
  return rows.map(rowToEntry)
}

// ===== 关系（Memory Graph） =====

/** 添加关系 */
export function addRelation(fromId: string, toId: string, relation: KnowledgeRelation): void {
  const db = getDatabase()
  db.prepare(
    'INSERT OR IGNORE INTO knowledge_relations (from_id, to_id, relation) VALUES (?, ?, ?)'
  ).run(fromId, toId, relation)
}

/** 删除关系 */
export function removeRelation(fromId: string, toId: string, relation: KnowledgeRelation): void {
  const db = getDatabase()
  db.prepare(
    'DELETE FROM knowledge_relations WHERE from_id = ? AND to_id = ? AND relation = ?'
  ).run(fromId, toId, relation)
}

/** 列出条目的所有关系（出+入） */
export function listRelations(entryId: string): KnowledgeRelationRow[] {
  const db = getDatabase()
  const out = db
    .prepare('SELECT from_id, to_id, relation FROM knowledge_relations WHERE from_id = ?')
    .all(entryId) as KnowledgeRelationRow[]
  const incoming = db
    .prepare('SELECT from_id, to_id, relation FROM knowledge_relations WHERE to_id = ?')
    .all(entryId) as KnowledgeRelationRow[]
  return [...out, ...incoming]
}

/**
 * 获取工作区知识图谱数据（节点 + 边）
 * - 显式边：knowledge_relations 表中的用户/系统建立的关系
 * - 隐式边：同一 source_session_id 的 entries 互相关联（same-session）
 *
 * 隐式边数量控制：同一 session 最多生成 20 条边，避免 O(n²) 爆炸
 */
export function getGraphData(workspaceId: string): KnowledgeGraphData {
  const db = getDatabase()

  // 节点：当前工作区所有 entries（上限 500，避免大图谱卡顿）
  const nodes = listEntries({ workspaceId, limit: 500 })

  // 显式边：knowledge_relations（通过 JOIN 确保只返回当前工作区的）
  const relationRows = db
    .prepare(
      `SELECT kr.from_id, kr.to_id, kr.relation
       FROM knowledge_relations kr
       JOIN knowledge_entries ke1 ON kr.from_id = ke1.id
       WHERE ke1.workspace_id = ?`
    )
    .all(workspaceId) as Array<{ from_id: string; to_id: string; relation: string }>

  const edges: GraphEdge[] = relationRows.map((r) => ({
    from: r.from_id,
    to: r.to_id,
    relation: r.relation,
    implicit: false
  }))

  // 隐式边：同 session_id 的 entries 互相关联
  const sessionGroups = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.sessionId) {
      const group = sessionGroups.get(node.sessionId) || []
      group.push(node.id)
      sessionGroups.set(node.sessionId, group)
    }
  }

  // 已有显式边的 pair 集合（双向），避免隐式边重复
  const explicitPairs = new Set<string>()
  for (const e of edges) {
    explicitPairs.add(`${e.from}|${e.to}`)
    explicitPairs.add(`${e.to}|${e.from}`)
  }

  for (const [, entryIds] of sessionGroups) {
    if (entryIds.length < 2) continue
    let added = 0
    for (let i = 0; i < entryIds.length && added < 20; i++) {
      for (let j = i + 1; j < entryIds.length && added < 20; j++) {
        const pairKey = `${entryIds[i]}|${entryIds[j]}`
        if (!explicitPairs.has(pairKey)) {
          edges.push({
            from: entryIds[i],
            to: entryIds[j],
            relation: 'same-session',
            implicit: true
          })
          explicitPairs.add(pairKey)
          explicitPairs.add(`${entryIds[j]}|${entryIds[i]}`)
          added++
        }
      }
    }
  }

  return { nodes, edges }
}
