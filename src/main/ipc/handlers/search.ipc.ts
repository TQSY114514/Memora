import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import { search, SearchOptions } from '@search/query'
import { semanticSearch } from '@search/semantic'
import { hybridSearch, HybridSearchOptions } from '@search/hybridSearch'
import type { AiConfig } from '@shared/types'

export function registerSearchHandlers(): void {
  // ===== Search（带 LRU 缓存，30s TTL，容量 20） =====
  const searchCache = new Map<string, { value: any; expiresAt: number }>()
  const SEARCH_CACHE_TTL = 30_000
  const SEARCH_CACHE_MAX = 20

  safeHandle(IPC.SEARCH_QUERY, (_e, query: string, options?: SearchOptions) => {
    const cacheKey = JSON.stringify({ q: query, ...options })
    // 命中缓存
    const cached = searchCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      // LRU：移到末尾（最近使用）
      searchCache.delete(cacheKey)
      searchCache.set(cacheKey, cached)
      return cached.value
    }
    const result = search(query, options)
    // 写入缓存，超容量时淘汰最旧
    searchCache.set(cacheKey, { value: result, expiresAt: Date.now() + SEARCH_CACHE_TTL })
    if (searchCache.size > SEARCH_CACHE_MAX) {
      const oldestKey = searchCache.keys().next().value
      if (oldestKey) searchCache.delete(oldestKey)
    }
    return result
  })

  // 高级搜索（v1.6，支持多维过滤）
  safeHandle(IPC.SEARCH_ADVANCED, (_e, query: string, options?: SearchOptions) => {
    return search(query, options)
  })

  // ===== 语义搜索（Phase 2） =====
  safeHandle(
    IPC.SEARCH_SEMANTIC,
    async (
      _e,
      query: string,
      config: AiConfig,
      options?: { limit?: number; threshold?: number }
    ) => {
      return semanticSearch(query, config, options)
    }
  )

  // ===== 混合搜索（FTS + Vector 融合） =====
  safeHandle(
    IPC.SEARCH_HYBRID,
    async (
      _e,
      query: string,
      config: AiConfig,
      options?: HybridSearchOptions
    ) => {
      return hybridSearch(query, config, options)
    }
  )
}
