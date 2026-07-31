import { getDatabase } from '../database/connection'
import { getSession } from '../database/repositories/sessionRepo'
import { segmentQuery } from './segmenter'
import type { SearchResult, SearchSnippet } from '@shared/types'

interface FtsHitRow {
  session_id: string
  title: string
  content: string
  provider: string
  rank: number
}

/**
 * 构造 FTS5 查询字符串
 * - 用 Intl.Segmenter 做中文分词（解决 unicode61 逐字切分问题）
 * - 每个词加前缀通配（*）匹配前缀
 * - operator: 'AND'（精确，所有词必须命中）或 'OR'（宽松，任一词命中）
 */
function buildFtsQuery(raw: string, operator: 'AND' | 'OR' = 'AND'): string {
  const terms = segmentQuery(raw)
  if (terms.length === 0) return ''

  const quoted = terms.map((term) => {
    const safe = term.replace(/"/g, '""')
    return `"${safe}"*`
  })

  return quoted.join(` ${operator} `)
}

/** 执行 FTS 查询并返回原始命中行 */
function runFts(
  ftsQuery: string,
  limit: number,
  provider?: string
): FtsHitRow[] {
  const db = getDatabase()
  let sql = `
    SELECT session_id, title, content, provider, rank
    FROM chat_fts
    WHERE chat_fts MATCH ?
  `
  const params: unknown[] = [ftsQuery]
  if (provider) {
    sql += ' AND provider = ?'
    params.push(provider)
  }
  sql += ' ORDER BY rank LIMIT ?'
  params.push(limit)
  return db.prepare(sql).all(...params) as FtsHitRow[]
}

/** 全文搜索（中文分词 + AND→OR 降级） */
export function search(
  query: string,
  options?: { limit?: number; provider?: string }
): SearchResult[] {
  const limit = options?.limit ?? 50

  // 1. 先用 AND（精确匹配，所有词都要命中）
  let ftsQuery = buildFtsQuery(query, 'AND')
  if (!ftsQuery) return []
  let rows = runFts(ftsQuery, limit, options?.provider)

  // 2. AND 无结果时降级为 OR（宽松召回，任一词命中即可）
  if (rows.length === 0) {
    const orQuery = buildFtsQuery(query, 'OR')
    if (orQuery && orQuery !== ftsQuery) {
      rows = runFts(orQuery, limit, options?.provider)
    }
  }

  // 聚合：同一会话的多条命中合并为一个 SearchResult
  const map = new Map<string, SearchResult>()
  for (const row of rows) {
    const session = getSession(row.session_id, false)
    if (!session) continue

    const snippet = buildSnippet(row.content, query)
    const existing = map.get(row.session_id)
    if (existing) {
      existing.snippets.push({
        snippet,
        messageId: '',
        sessionId: row.session_id
      })
      // 取最佳 rank
      if (row.rank < existing.rank) existing.rank = row.rank
    } else {
      map.set(row.session_id, {
        session,
        snippets: [
          { snippet, messageId: '', sessionId: row.session_id }
        ],
        rank: row.rank
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.rank - b.rank)
}

/** HTML 转义，防止 AI 生成内容中的 HTML 注入 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 生成高亮片段（截取匹配关键词前后文，关键词用 <mark> 包裹） */
function buildSnippet(content: string, query: string, radius = 60): string {
  if (!content) return ''
  const lowerContent = content.toLowerCase()
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())

  // 找第一个匹配位置
  let pos = -1
  for (const term of terms) {
    const idx = lowerContent.indexOf(term)
    if (idx >= 0 && (pos < 0 || idx < pos)) pos = idx
  }

  if (pos < 0) {
    // 无匹配，截取开头
    const raw = content.length > radius * 2 ? content.slice(0, radius * 2) + '…' : content
    return escapeHtml(raw)
  }

  const start = Math.max(0, pos - radius)
  const end = Math.min(content.length, pos + radius)
  const raw = content.slice(start, end)

  // 先转义，再加高亮（在已转义文本上做大小写不敏感替换）
  let escaped = escapeHtml(raw)
  for (const term of terms) {
    if (!term) continue
    const escapedTerm = escapeHtml(term)
    // 转义正则特殊字符
    const safe = escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    escaped = escaped.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>')
  }

  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return prefix + escaped + suffix
}
