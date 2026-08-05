import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type { SearchResult, AiConfig, SemanticSearchResult } from '@shared/types'

// ===== Search =====
export const search = (
  query: string,
  options?: {
    provider?: string
    limit?: number
    /** 时间范围过滤（v1.6） */
    timeRange?: { start: string; end: string }
    /** 按文件夹过滤（v1.6） */
    folderId?: string
    /** 仅收藏（v1.6） */
    isFavorite?: boolean
    /** 排序方式（v1.6） */
    sortBy?: 'relevance' | 'date' | 'title'
  }
): Promise<SearchResult[]> => ipcRenderer.invoke(IPC.SEARCH_QUERY, query, options)

/** 语义搜索（Phase 2，需要先建立向量索引） */
export const semanticSearch = (
  query: string,
  config: AiConfig,
  options?: { limit?: number; threshold?: number }
): Promise<SemanticSearchResult[]> =>
  ipcRenderer.invoke(IPC.SEARCH_SEMANTIC, query, config, options)

/** 混合搜索（FTS + Vector 融合） */
export const hybridSearch = (
  query: string,
  config: AiConfig,
  options?: {
    limit?: number
    provider?: string
    semantic?: boolean
    semanticThreshold?: number
    sortBy?: 'relevance' | 'date' | 'title'
  }
): Promise<unknown[]> => ipcRenderer.invoke(IPC.SEARCH_HYBRID, query, config, options)

// ===== Sharing =====
export const share = {
  exportHtml: (
    sessionId: string,
    options?: { customTitle?: string; customDescription?: string }
  ): Promise<string | null> => ipcRenderer.invoke(IPC.SHARE_EXPORT_HTML, sessionId, options),
  /** 导出为 Markdown */
  exportMd: (
    sessionId: string,
    options?: { customTitle?: string; customDescription?: string }
  ): Promise<string | null> => ipcRenderer.invoke(IPC.SHARE_EXPORT_MD, sessionId, options),
  /** 导出为 Claude Code jsonl（用于跨平台迁移到 Claude Code） */
  exportClaudeCode: (
    sessionId: string,
    options?: { customTitle?: string; customDescription?: string }
  ): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SHARE_EXPORT_CLAUDE_CODE, sessionId, options),
  /** 导出为通用 JSON（可导入其他 AI 工具 / OpenCode / 备份） */
  exportJson: (
    sessionId: string,
    options?: { customTitle?: string; customDescription?: string }
  ): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SHARE_EXPORT_JSON, sessionId, options)
}