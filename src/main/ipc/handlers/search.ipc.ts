import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/constants'
import { search } from '@search/query'
import { semanticSearch } from '@search/semantic'
import type { AiConfig } from '@shared/types'

function safeHandle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      console.error(`[IPC] ${channel} failed:`, err)
      throw err  // Electron 会传给 renderer 的 reject
    }
  })
}

export function registerSearchHandlers(): void {
  // ===== Search（带 LRU 缓存，30s TTL，容量 20） =====
  const searchCache = new Map<string, { value: any; expiresAt: number }>()
  const SEARCH_CACHE_TTL = 30_000
  const SEARCH_CACHE_MAX = 20

  safeHandle(IPC.SEARCH_QUERY, (_e, query: string, options?: { provider?: string; limit?: number }) => {
    const cacheKey = JSON.stringify({ q: query, p: options?.provider, l: options?.limit })
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
}
