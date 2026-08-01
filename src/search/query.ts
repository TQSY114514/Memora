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

/** 搜索选项（v1.6 增强） */
export interface SearchOptions {
  limit?: number
  provider?: string
  /** 时间范围过滤 */
  timeRange?: { start: string; end: string }
  /** 按文件夹过滤 */
  folderId?: string
  /** 仅收藏 */
  isFavorite?: boolean
  /** 排序方式 */
  sortBy?: 'relevance' | 'date' | 'title'
  /** 搜索类型：all / session / knowledge / preference / decision */
  type?: 'session' | 'knowledge' | 'preference' | 'decision' | 'all'
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
  // provider 过滤走 chat_sessions 权威表（chat_fts.provider 列历史数据可能为空串）
  let sql = `
    SELECT chat_fts.session_id, chat_fts.title, chat_fts.content, chat_fts.provider, chat_fts.rank
    FROM chat_fts
    JOIN chat_sessions ON chat_fts.session_id = chat_sessions.id
    WHERE chat_fts MATCH ?
  `
  const params: unknown[] = [ftsQuery]
  if (provider) {
    sql += ' AND chat_sessions.provider = ?'
    params.push(provider)
  }
  sql += ' ORDER BY chat_fts.rank LIMIT ?'
  params.push(limit)
  return db.prepare(sql).all(...params) as FtsHitRow[]
}

/** 全文搜索（中文分词 + AND→OR 降级 + 多维过滤 + 相关性排序） */
export function search(
  query: string,
  options?: SearchOptions
): SearchResult[] {
  const limit = options?.limit ?? 50

  // 1. 先用 AND（精确匹配，所有词都要命中）
  let ftsQuery = buildFtsQuery(query, 'AND')
  if (!ftsQuery) return []
  let rows = runFts(ftsQuery, limit * 2, options?.provider) // 多取一些用于过滤

  // 2. AND 无结果时降级为 OR（宽松召回，任一词命中即可）
  if (rows.length === 0) {
    const orQuery = buildFtsQuery(query, 'OR')
    if (orQuery && orQuery !== ftsQuery) {
      rows = runFts(orQuery, limit * 2, options?.provider)
    }
  }

  // 3. 聚合：同一会话的多条命中合并为一个 SearchResult
  const map = new Map<string, SearchResult>()
  for (const row of rows) {
    const session = getSession(row.session_id, false)
    if (!session) continue

    // 时间范围过滤
    if (options?.timeRange) {
      const createdAt = new Date(session.createdAt)
      if (createdAt < new Date(options.timeRange.start) ||
          createdAt > new Date(options.timeRange.end)) {
        continue
      }
    }

    // 文件夹过滤
    if (options?.folderId && session.folderId !== options.folderId) {
      continue
    }

    // 收藏过滤
    if (options?.isFavorite && !session.isFavorite) {
      continue
    }

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

  let results = Array.from(map.values())

  // 4. 相关性加权排序
  const now = new Date()
  const sortBy = options?.sortBy ?? 'relevance'

  if (sortBy === 'relevance') {
    results = results.map((r) => {
      const daysSinceUpdate =
        (now.getTime() - new Date(r.session.updatedAt).getTime()) / (24 * 60 * 60 * 1000)
      const timeDecay = Math.exp(-daysSinceUpdate / 30) // 30 天半衰期
      const favoriteBonus = r.session.isFavorite ? 1.5 : 1.0
      const matchCount = r.snippets.length

      const compositeScore =
        (1 / (1 + r.rank)) * 0.5 +     // FTS rank 归一化
        timeDecay * 0.3 +
        (favoriteBonus - 1) * 0.1 +
        Math.min(matchCount / 10, 1) * 0.1

      return { ...r, rank: 1 - compositeScore } // 越小越好（保持与 FTS rank 一致）
    })
  } else if (sortBy === 'date') {
    results = results.sort(
      (a, b) => new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime()
    )
  } else if (sortBy === 'title') {
    results = results.sort((a, b) => a.session.title.localeCompare(b.session.title))
  }

  // 如果排序方式不是 relevance，也需要按 rank 排序
  if (sortBy === 'relevance') {
    results = results.sort((a, b) => a.rank - b.rank)
  }

  return results.slice(0, limit)
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
  // 用与搜索一致的中文分词，避免中文查询因无空格导致高亮失效
  const terms = segmentQuery(query)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0)

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
