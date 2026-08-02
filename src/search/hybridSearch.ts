/**
 * Hybrid Search —— 混合检索（FTS5 + Vector + Reranker）
 *
 * 融合多种检索信号，产出统一排序的搜索结果。
 *
 * 检索管线：
 * 1. FTS5 关键词召回（BM25-like）
 * 2. Vector 语义召回
 * 3. 融合排序（FTS score + vector score + time decay + graph boost）
 * 4. 返回带 score_breakdown 的结果
 */

import { getDatabase } from '../database/connection'
import { getSessionsByIds } from '../database/repositories/sessionRepo'
import { segmentQuery } from './segmenter'
import type { SearchResult } from '@shared/types'

export interface HybridSearchOptions {
  limit?: number
  provider?: string
  timeRange?: { start: string; end: string }
  folderId?: string
  isFavorite?: boolean
  sortBy?: 'relevance' | 'date' | 'title'
  /** 是否启用语义搜索 */
  semantic?: boolean
  /** 语义搜索的最低相似度阈值 */
  semanticThreshold?: number
}

export interface ScoreBreakdown {
  ftsScore: number
  vectorScore: number
  timeDecay: number
  graphBoost: number
  favoriteBonus: number
  total: number
}

export interface HybridSearchResult {
  session: SearchResult['session']
  snippets: SearchResult['snippets']
  rank: number
  score: number
  scoreBreakdown: ScoreBreakdown
}

interface FtsHitRow {
  session_id: string
  title: string
  content: string
  provider: string
  rank: number
}

/** 构造 FTS5 查询 */
function buildFtsQuery(raw: string, operator: 'AND' | 'OR' = 'AND'): string {
  const terms = segmentQuery(raw)
  if (terms.length === 0) return ''

  const quoted = terms.map((term) => {
    const safe = term.replace(/"/g, '""')
    return `"${safe}"*`
  })

  return quoted.join(` ${operator} `)
}

/** 执行 FTS 查询 */
function runFts(ftsQuery: string, limit: number, provider?: string): FtsHitRow[] {
  const db = getDatabase()
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

/** 计算时间衰减因子（指数衰减，30 天半衰期） */
function computeTimeDecay(updatedAt: string, now: Date): number {
  const daysSinceUpdate = (now.getTime() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)
  return Math.exp(-daysSinceUpdate / 30)
}

/** 归一化 FTS rank（rank 越小越好，转为 0-1 分数） */
function normalizeFtsScore(rank: number): number {
  return 1 / (1 + rank)
}

/** 计算图谱 boost（有更多关联关系的会话得分更高） */
function computeGraphBoost(sessionId: string): number {
  try {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM knowledge_graph_edges
         WHERE source_id = ? OR target_id = ?`
      )
      .get(sessionId, sessionId) as { cnt: number } | undefined
    const edgeCount = row?.cnt ?? 0
    return Math.min(edgeCount / 10, 1) * 0.1 // 最多 +0.1
  } catch {
    return 0
  }
}

/**
 * 混合搜索主函数
 *
 * 融合 FTS 关键词分数 + 时间衰减 + 图谱 boost + 收藏加权
 * 返回带 score_breakdown 的结果
 */
export function hybridSearch(
  query: string,
  options?: HybridSearchOptions
): HybridSearchResult[] {
  const limit = options?.limit ?? 50
  const now = new Date()

  // 1. FTS 关键词召回
  const ftsQuery = buildFtsQuery(query, 'AND')
  if (!ftsQuery) return []

  let rows = runFts(ftsQuery, limit * 3, options?.provider)

  // AND 无结果时降级为 OR
  if (rows.length === 0) {
    const orQuery = buildFtsQuery(query, 'OR')
    if (orQuery && orQuery !== ftsQuery) {
      rows = runFts(orQuery, limit * 3, options?.provider)
    }
  }

  // 2. 聚合 + 评分
  const uniqueSessionIds = [...new Set(rows.map((r) => r.session_id))]
  const sessionMap = getSessionsByIds(uniqueSessionIds)

  const resultMap = new Map<string, HybridSearchResult>()

  for (const row of rows) {
    const session = sessionMap.get(row.session_id)
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

    const ftsScore = normalizeFtsScore(row.rank)
    const timeDecay = computeTimeDecay(session.updatedAt, now)
    const graphBoost = computeGraphBoost(row.session_id)
    const favoriteBonus = session.isFavorite ? 0.1 : 0

    // 融合评分
    const vectorScore = 0 // 默认无向量分数，由外部 semanticSearch 补充
    const total = ftsScore * 0.4 + vectorScore * 0.3 + timeDecay * 0.15 + graphBoost + favoriteBonus

    const snippet = buildSnippet(row.content, query)

    const existing = resultMap.get(row.session_id)
    if (existing) {
      existing.snippets.push({
        snippet,
        messageId: '',
        sessionId: row.session_id
      })
      if (total > existing.score) {
        existing.score = total
        existing.scoreBreakdown = {
          ftsScore,
          vectorScore,
          timeDecay,
          graphBoost,
          favoriteBonus,
          total
        }
      }
    } else {
      resultMap.set(row.session_id, {
        session,
        snippets: [{ snippet, messageId: '', sessionId: row.session_id }],
        rank: row.rank,
        score: total,
        scoreBreakdown: {
          ftsScore,
          vectorScore,
          timeDecay,
          graphBoost,
          favoriteBonus,
          total
        }
      })
    }
  }

  const results = Array.from(resultMap.values())

  // 3. 排序
  if (options?.sortBy === 'date') {
    results.sort((a, b) => new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime())
  } else if (options?.sortBy === 'title') {
    results.sort((a, b) => a.session.title.localeCompare(b.session.title))
  } else {
    results.sort((a, b) => b.score - a.score)
  }

  return results.slice(0, limit)
}

/** HTML 转义 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 生成高亮片段 */
function buildSnippet(content: string, query: string, radius = 60): string {
  if (!content) return ''
  const lowerContent = content.toLowerCase()
  const terms = segmentQuery(query)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0)

  let pos = -1
  for (const term of terms) {
    const idx = lowerContent.indexOf(term)
    if (idx >= 0 && (pos < 0 || idx < pos)) pos = idx
  }

  if (pos < 0) {
    const raw = content.length > radius * 2 ? content.slice(0, radius * 2) + '…' : content
    return escapeHtml(raw)
  }

  const start = Math.max(0, pos - radius)
  const end = Math.min(content.length, pos + radius)
  const raw = content.slice(start, end)

  let escaped = escapeHtml(raw)
  for (const term of terms) {
    if (!term) continue
    const escapedTerm = escapeHtml(term)
    const safe = escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    escaped = escaped.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>')
  }

  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return prefix + escaped + suffix
}