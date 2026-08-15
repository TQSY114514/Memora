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
import { listFolders } from '../database/repositories/folderRepo'
import { segmentQuery } from './segmenter'
import { semanticSearch } from './semantic'
import { rerank, type RerankOptions } from './reranker'
import type { AiConfig, SearchResult } from '@shared/types'

export interface HybridSearchOptions {
  limit?: number
  provider?: string
  timeRange?: { start: string; end: string }
  folderId?: string
  isFavorite?: boolean
  sortBy?: 'relevance' | 'date' | 'title'
  /** 结构化检索范围（借鉴 MemPalace 的按人/项目/主题 scope 搜索） */
  scope?: {
    /** 按工作区过滤（跨会话记忆隔离） */
    workspaceId?: string
    /** 按标签过滤 */
    tag?: string
    /** 按提供商过滤 */
    provider?: string
    /** 按标题关键词过滤 */
    title?: string
  }
  /** 是否启用语义召回 */
  semantic?: boolean
  /** 语义搜索的最低相似度阈值 */
  semanticThreshold?: number
  /** 是否启用精排（对 top-k 融合结果做向量精排） */
  rerank?: boolean
  /** 精排配置（embed 函数 + 权重 + topK） */
  rerankConfig?: RerankOptions
}

export interface ScoreBreakdown {
  ftsScore: number
  vectorScore: number
  timeDecay: number
  graphBoost: number
  entityBoost: number
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

/**
 * 解析结构化检索范围（借鉴 MemPalace 的 scope 搜索）
 * 将 workspaceId 解析为允许的 folderId 集合，供会话过滤使用。
 */
function resolveScopeFilters(scope?: HybridSearchOptions['scope']): {
  folderIds?: Set<string>
  tag?: string
  title?: string
} {
  if (!scope) return {}
  let folderIds: Set<string> | undefined
  if (scope.workspaceId) {
    folderIds = new Set(listFolders(scope.workspaceId).map((f) => f.id))
  }
  return {
    folderIds,
    tag: scope.tag,
    title: scope.title
  }
}

/** 判断会话是否命中 scope 过滤 */
function passesScope(
  session: SearchResult['session'],
  scopeFilters: { folderIds?: Set<string>; tag?: string; title?: string }
): boolean {
  if (!scopeFilters) return true
  const { folderIds, tag, title } = scopeFilters
  if (folderIds && session.folderId && !folderIds.has(session.folderId)) return false
  if (tag && !session.tags.some((t) => t.name === tag)) return false
  if (title && !session.title.toLowerCase().includes(title.toLowerCase())) return false
  return true
}

/** 归一化 FTS rank（rank 越小越好，转为 0-1 分数） */
function normalizeFtsScore(rank: number): number {
  return 1 / (1 + rank)
}

/** IN 查询单批参数上限（SQLite 变量上限 999，同一列表出现两次时保守取 400） */
const IN_CHUNK_SIZE = 400

/** 数组分批 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * 批量计算图谱 boost（会话关联的知识条目与关系越多得分越高，最多 +0.1）
 *
 * 一次分组查询拿到所有会话的计数，替代逐会话 2 条 SQL 的 N+1 模式。
 * boost 公式与逐会话版本完全一致：min((entryCount + relCount) / 20, 1) * 0.1
 *
 * @returns Map<sessionId, boost>（查询失败时所有会话返回 0，与原单会话版 catch 行为一致）
 */
export function computeGraphBoost(sessionIds: string[]): Map<string, number> {
  const unique = [...new Set(sessionIds)]
  const result = new Map<string, number>()
  if (unique.length === 0) return result

  const counts = new Map<string, { entries: number; rels: number }>()
  for (const id of unique) counts.set(id, { entries: 0, rels: 0 })

  try {
    const db = getDatabase()
    for (const chunk of chunkArray(unique, IN_CHUNK_SIZE)) {
      const ph = chunk.map(() => '?').join(',')

      // 各会话关联的知识条目数（一次 GROUP BY 拿全）
      const entryRows = db
        .prepare(
          `SELECT session_id, COUNT(*) as cnt FROM knowledge_entries
           WHERE session_id IN (${ph}) GROUP BY session_id`
        )
        .all(...chunk) as Array<{ session_id: string; cnt: number }>
      for (const r of entryRows) {
        const c = counts.get(r.session_id)
        if (c) c.entries = r.cnt
      }

      // 各会话条目参与的关联关系数（1 跳图连接），取回端点会话在内存按行统计：
      // 一条关系两端属于同一会话时只计 1 次（与单会话 COUNT(*) 语义一致）
      const relRows = db
        .prepare(
          `SELECT e1.session_id as from_session, e2.session_id as to_session
           FROM knowledge_relations r
           JOIN knowledge_entries e1 ON r.from_id = e1.id
           JOIN knowledge_entries e2 ON r.to_id = e2.id
           WHERE e1.session_id IN (${ph}) OR e2.session_id IN (${ph})`
        )
        .all(...chunk, ...chunk) as Array<{ from_session: string | null; to_session: string | null }>
      for (const row of relRows) {
        const targets = new Set<string>()
        if (row.from_session && counts.has(row.from_session)) targets.add(row.from_session)
        if (row.to_session && counts.has(row.to_session)) targets.add(row.to_session)
        for (const sid of targets) counts.get(sid)!.rels++
      }
    }

    for (const [sid, c] of counts) {
      result.set(sid, Math.min((c.entries + c.rels) / 20, 1) * 0.1)
    }
    return result
  } catch {
    for (const sid of unique) result.set(sid, 0)
    return result
  }
}

/**
 * 批量计算实体链接 boost（借鉴 mem0 的实体抽取与跨记忆关联）
 *
 * 会话关联的知识条目若与工作区内其他知识条目存在显式关系（knowledge_relations），
 * 说明该会话处于知识网络的关键节点，具备更强的关联价值 → 得分加成。
 *
 * boost 公式与逐会话版本完全一致：无条目 → 0；有条目 → min(linkCount / 4, 1) * 0.15
 *
 * @returns Map<sessionId, boost>（查询失败时所有会话返回 0，与原单会话版 catch 行为一致）
 */
export function computeEntityBoost(sessionIds: string[]): Map<string, number> {
  const unique = [...new Set(sessionIds)]
  const result = new Map<string, number>()
  if (unique.length === 0) return result
  for (const sid of unique) result.set(sid, 0)

  try {
    const db = getDatabase()

    // 1. 批量取各会话的知识条目 id（entryId → 归属会话）
    const entryOwner = new Map<string, string>()
    for (const chunk of chunkArray(unique, IN_CHUNK_SIZE)) {
      const ph = chunk.map(() => '?').join(',')
      const rows = db
        .prepare(`SELECT id, session_id FROM knowledge_entries WHERE session_id IN (${ph})`)
        .all(...chunk) as Array<{ id: string; session_id: string }>
      for (const r of rows) entryOwner.set(r.id, r.session_id)
    }
    if (entryOwner.size === 0) return result

    // 2. 批量取这些条目作为端点的显式关系，在内存按归属会话计数。
    //    跨批次用 (from, to, relation) 主键去重，保证与单会话 COUNT(*) 语义一致：
    //    一条关系两端属于同一会话时该会话只计 1 次
    const entryIds = [...entryOwner.keys()]
    const seen = new Set<string>()
    const linkCounts = new Map<string, number>()
    for (const chunk of chunkArray(entryIds, IN_CHUNK_SIZE)) {
      const ph = chunk.map(() => '?').join(',')
      const rows = db
        .prepare(
          `SELECT from_id, to_id, relation FROM knowledge_relations
           WHERE from_id IN (${ph}) OR to_id IN (${ph})`
        )
        .all(...chunk, ...chunk) as Array<{ from_id: string; to_id: string; relation: string }>
      for (const r of rows) {
        const key = `${r.from_id}\u0000${r.to_id}\u0000${r.relation}`
        if (seen.has(key)) continue
        seen.add(key)

        const owners = new Set<string>()
        const fromOwner = entryOwner.get(r.from_id)
        if (fromOwner) owners.add(fromOwner)
        const toOwner = entryOwner.get(r.to_id)
        if (toOwner) owners.add(toOwner)
        for (const sid of owners) linkCounts.set(sid, (linkCounts.get(sid) ?? 0) + 1)
      }
    }

    for (const sid of unique) {
      const linkCount = linkCounts.get(sid) ?? 0
      result.set(sid, Math.min(linkCount / 4, 1) * 0.15)
    }
    return result
  } catch {
    for (const sid of unique) result.set(sid, 0)
    return result
  }
}

/**
 * 混合搜索主函数
 *
 * 融合 FTS 关键词分数 + 语义向量分数 + 时间衰减 + 图谱 boost + 收藏加权
 * 返回带 score_breakdown 的结果。
 *
 * 当 options.semantic === true 且传入有效 AiConfig 时，会额外执行语义召回，
 * 将两路结果按会话去重合并，语义命中会话的 vectorScore 取最高分。
 */
export async function hybridSearch(
  query: string,
  config: AiConfig,
  options?: HybridSearchOptions
): Promise<HybridSearchResult[]> {
  const limit = options?.limit ?? 50
  const now = new Date()
  const scopeFilters = resolveScopeFilters(options?.scope)

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

  // 2. 聚合 FTS 结果 + 评分
  const uniqueSessionIds = [...new Set(rows.map((r) => r.session_id))]
  const sessionMap = getSessionsByIds(uniqueSessionIds)

  const resultMap = new Map<string, HybridSearchResult>()

  // 先收集通过全部过滤的候选行，再对候选会话批量计算 boost（消除逐会话 2 条 SQL 的 N+1）
  const filtered: Array<{ row: FtsHitRow; session: SearchResult['session'] }> = []
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

    // 结构化检索范围过滤（借鉴 MemPalace）
    if (!passesScope(session, scopeFilters)) {
      continue
    }

    filtered.push({ row, session })
  }

  const graphBoosts = computeGraphBoost([...new Set(filtered.map((f) => f.row.session_id))])
  const entityBoosts = computeEntityBoost([...new Set(filtered.map((f) => f.row.session_id))])

  for (const { row, session } of filtered) {
    const ftsScore = normalizeFtsScore(row.rank)
    const timeDecay = computeTimeDecay(session.updatedAt, now)
    const graphBoost = graphBoosts.get(row.session_id) ?? 0
    const entityBoost = entityBoosts.get(row.session_id) ?? 0
    const favoriteBonus = session.isFavorite ? 0.1 : 0

    const total = ftsScore * 0.4 + timeDecay * 0.15 + graphBoost + entityBoost + favoriteBonus

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
          vectorScore: existing.scoreBreakdown.vectorScore,
          timeDecay,
          graphBoost,
          entityBoost,
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
          vectorScore: 0,
          timeDecay,
          graphBoost,
          entityBoost,
          favoriteBonus,
          total
        }
      })
    }
  }

  // 3. 语义召回（可选）：与本文件的 FTS 结果按会话去重合并
  if (options?.semantic && config) {
    const semanticResults = await semanticSearch(query, config, {
      limit,
      threshold: options.semanticThreshold
    })

    // 语义命中会话的 boost 批量计算（FTS 阶段已算过的会话不重复查询）
    const missingIds = [
      ...new Set(
        semanticResults
          .filter((sr) => passesScope(sr.session, scopeFilters))
          .map((sr) => sr.session.id)
      )
    ].filter((id) => !graphBoosts.has(id))
    if (missingIds.length > 0) {
      const g = computeGraphBoost(missingIds)
      const e = computeEntityBoost(missingIds)
      for (const id of missingIds) {
        graphBoosts.set(id, g.get(id) ?? 0)
        entityBoosts.set(id, e.get(id) ?? 0)
      }
    }

    for (const sr of semanticResults) {
      // 结构化检索范围过滤（借鉴 MemPalace）
      if (!passesScope(sr.session, scopeFilters)) {
        continue
      }
      const existing = resultMap.get(sr.session.id)
      if (existing) {
        // 更新现有条目的 vectorScore（取最高分）
        const fb = existing.scoreBreakdown.favoriteBonus
        const timeDecay = computeTimeDecay(sr.session.updatedAt, now)
        const graphBoost = graphBoosts.get(sr.session.id) ?? 0
        const entityBoost = entityBoosts.get(sr.session.id) ?? 0
        const vectorScore = Math.max(existing.scoreBreakdown.vectorScore, sr.score)
        const total = existing.scoreBreakdown.ftsScore * 0.4 +
          vectorScore * 0.3 + timeDecay * 0.15 + graphBoost + entityBoost + fb
        existing.scoreBreakdown.vectorScore = vectorScore
        existing.scoreBreakdown.timeDecay = timeDecay
        existing.scoreBreakdown.graphBoost = graphBoost
        existing.scoreBreakdown.entityBoost = entityBoost
        existing.scoreBreakdown.total = total
        existing.score = total
      } else {
        // 语义召回但 FTS 未命中的会话：新增条目
        const timeDecay = computeTimeDecay(sr.session.updatedAt, now)
        const graphBoost = graphBoosts.get(sr.session.id) ?? 0
        const entityBoost = entityBoosts.get(sr.session.id) ?? 0
        const favoriteBonus = sr.session.isFavorite ? 0.1 : 0
        const total = sr.score * 0.3 + timeDecay * 0.15 + graphBoost + entityBoost + favoriteBonus
        resultMap.set(sr.session.id, {
          session: sr.session,
          snippets: [{ snippet: sr.snippet, messageId: sr.messageId, sessionId: sr.session.id }],
          rank: 0,
          score: total,
          scoreBreakdown: {
            ftsScore: 0,
            vectorScore: sr.score,
            timeDecay,
            graphBoost,
            entityBoost,
            favoriteBonus,
            total
          }
        })
      }
    }
  }

  const results = Array.from(resultMap.values())

  // 4. 精排（可选）：对 top-k 融合结果做向量精排
  if (options?.rerank && options.rerankConfig?.embed) {
    const docs = results.map((r) => ({
      sessionId: r.session.id,
      title: r.session.title,
      content: r.snippets[0]?.snippet ?? '',
      fusionScore: r.score
    }))
    const reranked = await rerank(query, docs, options.rerankConfig)
    const order = new Map(reranked.map((d, i) => [d.sessionId, i]))
    results.sort((a, b) => (order.get(a.session.id) ?? 0) - (order.get(b.session.id) ?? 0))
    return results.slice(0, limit)
  }

  // 5. 排序
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