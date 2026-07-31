import { ipcMain, dialog, app } from 'electron'
import { writeFileSync, existsSync } from 'fs'
import { basename } from 'path'
import { IPC } from '@shared/constants'
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  createFolder,
  getFolder,
  listFolders,
  listRootFolders,
  listChildFolders,
  updateFolder,
  deleteFolder,
  getSession,
  listSessions,
  listSessionsByWorkspace,
  updateSession,
  deleteSession,
  moveSession,
  toggleFavorite,
  listTags,
  createTag,
  deleteTag,
  attachTag,
  detachTag,
  attachTagByName,
  getSummary,
  deleteSummary
} from '@db/repositories'
import { importFile, importDirectory, importContent, importExtractedSessions } from '@importer/service'
import { scanDirectories } from '@importer/scanner'
import { detectInstalledApps } from '@importer/appDetector'
import { extractLocal } from '@importer/localExtractor'
import { search } from '@search/query'
import { semanticSearch } from '@search/semantic'
import { renderSessionToHtml } from '@sharing'
import { generateSummary, getSessionSummary, generateKnowledgeMd } from '@ai/summarizer'
import { embedSession, getEmbedStatus } from '@ai/embedder'
import { askProjectMemory, findRelatedSessions } from '@ai/projectMemory'
import type { AiConfig, ChatSession } from '@shared/types'

/** 安全获取 Electron 系统目录（目录不存在时返回 null） */
function safeGetPath(name: 'downloads' | 'documents' | 'desktop'): string | null {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}

export function registerIpcHandlers(): void {
  // ===== 系统 =====
  ipcMain.handle(IPC.APP_GET_DATA_DIR, () => app.getPath('userData'))

  ipcMain.handle(
    IPC.DIALOG_OPEN_FILE,
    async (_e, options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }) => {
      const result = await dialog.showOpenDialog({
        properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: options?.filters ?? [
          { name: 'AI 对话文件', extensions: ['json', 'md', 'markdown', 'txt', 'html'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      return result.canceled ? null : result.filePaths
    }
  )

  ipcMain.handle(
    IPC.DIALOG_SAVE_FILE,
    async (_e, options: { defaultName?: string; content: string }) => {
      const result = await dialog.showSaveDialog({
        defaultPath: options.defaultName || 'Memora-export.html',
        filters: [{ name: 'HTML 文件', extensions: ['html'] }]
      })
      if (result.canceled || !result.filePath) return null
      writeFileSync(result.filePath, options.content, 'utf-8')
      return result.filePath
    }
  )

  // ===== Workspace =====
  ipcMain.handle(IPC.WORKSPACE_LIST, () => listWorkspaces())
  ipcMain.handle(IPC.WORKSPACE_CREATE, (_e, input: Parameters<typeof createWorkspace>[0]) =>
    createWorkspace(input)
  )
  ipcMain.handle(IPC.WORKSPACE_UPDATE, (_e, id: string, patch: Parameters<typeof updateWorkspace>[1]) =>
    updateWorkspace(id, patch)
  )
  ipcMain.handle(IPC.WORKSPACE_DELETE, (_e, id: string) => deleteWorkspace(id))
  ipcMain.handle(IPC.WORKSPACE_TREE, (_e, workspaceId: string) => {
    const workspace = getWorkspace(workspaceId)
    if (!workspace) return null
    const rootFolders = listRootFolders(workspaceId)
    const sessions = listSessionsByWorkspace(workspaceId)
    return { workspace, rootFolders, sessions }
  })

  // ===== Folder =====
  ipcMain.handle(IPC.FOLDER_LIST, (_e, workspaceId?: string) => listFolders(workspaceId))
  ipcMain.handle(IPC.FOLDER_CREATE, (_e, input: Parameters<typeof createFolder>[0]) =>
    createFolder(input)
  )
  ipcMain.handle(IPC.FOLDER_UPDATE, (_e, id: string, patch: Parameters<typeof updateFolder>[1]) =>
    updateFolder(id, patch)
  )
  ipcMain.handle(IPC.FOLDER_DELETE, (_e, id: string) => deleteFolder(id))

  // ===== Session =====
  ipcMain.handle(IPC.SESSION_GET, (_e, id: string, withMessages = true) =>
    getSession(id, withMessages)
  )
  ipcMain.handle(
    IPC.SESSION_LIST,
    (_e, options?: Parameters<typeof listSessions>[0]) => listSessions(options)
  )
  ipcMain.handle(IPC.SESSION_UPDATE, (_e, id: string, patch: Parameters<typeof updateSession>[1]) =>
    updateSession(id, patch)
  )
  ipcMain.handle(IPC.SESSION_DELETE, (_e, id: string) => deleteSession(id))
  ipcMain.handle(IPC.SESSION_MOVE, (_e, id: string, folderId: string | null) =>
    moveSession(id, folderId)
  )
  ipcMain.handle(IPC.SESSION_TOGGLE_FAVORITE, (_e, id: string) => toggleFavorite(id))

  // ===== Tag =====
  ipcMain.handle(IPC.TAG_LIST, () => listTags())
  ipcMain.handle(IPC.TAG_CREATE, (_e, input: Parameters<typeof createTag>[0]) => createTag(input))
  ipcMain.handle(IPC.TAG_DELETE, (_e, id: string) => deleteTag(id))
  ipcMain.handle(IPC.TAG_ATTACH, (_e, sessionId: string, tagId: string) =>
    attachTag(sessionId, tagId)
  )
  ipcMain.handle(IPC.TAG_DETACH, (_e, sessionId: string, tagId: string) =>
    detachTag(sessionId, tagId)
  )

  // ===== Importer =====
  ipcMain.handle(
    IPC.IMPORT_FILE,
    (_e, filePath: string, options?: { folderId?: string }) => importFile(filePath, options)
  )
  ipcMain.handle(
    IPC.IMPORT_FILES,
    (_e, filePaths: string[], options?: { folderId?: string }) => {
      const aggregated = { imported: 0, skipped: 0, failed: 0, errors: [] as string[], sessionIds: [] as string[] }
      for (const p of filePaths) {
        const r = importFile(p, options)
        aggregated.imported += r.imported
        aggregated.skipped += r.skipped
        aggregated.failed += r.failed
        aggregated.sessionIds.push(...r.sessionIds)
        if (r.errors.length) aggregated.errors.push(`${p}: ${r.errors.join('; ')}`)
      }
      return aggregated
    }
  )
  ipcMain.handle(
    IPC.IMPORT_DIRECTORY,
    (_e, dirPath: string, options?: { folderId?: string }) => importDirectory(dirPath, options)
  )

  // ===== 扫描器（智能导入中心） =====
  // 安全：默认仅扫描 Downloads / Documents / Desktop，且由用户主动触发
  ipcMain.handle(IPC.SCANNER_GET_DEFAULT_DIRS, () => {
    const candidates = [
      safeGetPath('downloads'),
      safeGetPath('documents'),
      safeGetPath('desktop')
    ].filter((p): p is string => !!p)
    const uniq = Array.from(new Set(candidates))
    return uniq.filter((p) => {
      try {
        return existsSync(p)
      } catch {
        return false
      }
    })
  })

  ipcMain.handle(
    IPC.SCANNER_SCAN,
    (_e, dirs: string[], options?: { maxDepth?: number; maxFiles?: number }) => {
      return scanDirectories(dirs, options)
    }
  )

  // ===== AI 应用检测 + 本地扒取 =====
  ipcMain.handle(IPC.DETECT_APPS, () => detectInstalledApps())

  ipcMain.handle(
    IPC.EXTRACT_APP,
    (_e, provider: string, dataPath: string, options?: { maxSessions?: number }) => {
      return extractLocal(provider as any, dataPath, options)
    }
  )

  // 导入已扒取的对话（内存中，可编辑标题/来源）
  ipcMain.handle(
    IPC.IMPORT_EXTRACTED,
    (_e, sessions: any[], options?: { folderId?: string }) => {
      return importExtractedSessions(sessions, options)
    }
  )

  // ===== Search =====
  ipcMain.handle(IPC.SEARCH_QUERY, (_e, query: string, options?: { provider?: string; limit?: number }) =>
    search(query, options)
  )

  // ===== Sharing =====
  ipcMain.handle(
    IPC.SHARE_EXPORT_HTML,
    (_e, sessionId: string, options?: { customTitle?: string; customDescription?: string }) => {
      const session = getSession(sessionId, true) as ChatSession | null
      if (!session) return null
      return renderSessionToHtml(session, options)
    }
  )

  // ===== 批量操作 =====
  ipcMain.handle(IPC.SESSION_BATCH_DELETE, (_e, ids: string[]) => {
    let deleted = 0
    for (const id of ids) {
      try {
        deleteSession(id)
        deleted++
      } catch {
        // 单条失败跳过
      }
    }
    return { deleted, total: ids.length }
  })

  ipcMain.handle(IPC.SESSION_BATCH_MOVE, (_e, ids: string[], folderId: string | null) => {
    let moved = 0
    for (const id of ids) {
      try {
        moveSession(id, folderId)
        moved++
      } catch {
        // 单条失败跳过
      }
    }
    return { moved, total: ids.length }
  })

  // ===== AI 总结（Phase 2） =====
  ipcMain.handle(
    IPC.AI_SUMMARY_GENERATE,
    async (_e, sessionId: string, config: AiConfig) => {
      return generateSummary(sessionId, config)
    }
  )

  ipcMain.handle(IPC.AI_SUMMARY_GET, (_e, sessionId: string) => {
    return getSessionSummary(sessionId)
  })

  ipcMain.handle(IPC.AI_SUMMARY_DELETE, (_e, sessionId: string) => {
    deleteSummary(sessionId)
  })

  ipcMain.handle(IPC.AI_KNOWLEDGE_GENERATE, (_e, sessionId: string) => {
    return generateKnowledgeMd(sessionId)
  })

  // ===== 向量嵌入（Phase 2） =====
  ipcMain.handle(
    IPC.AI_EMBED_SESSION,
    async (_e, sessionId: string, config: AiConfig) => {
      return embedSession(sessionId, config)
    }
  )

  ipcMain.handle(IPC.AI_EMBED_STATUS, (_e, sessionId: string) => {
    return getEmbedStatus(sessionId)
  })

  // ===== 语义搜索（Phase 2） =====
  ipcMain.handle(
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

  // ===== Project Memory 智能问答（Phase 3） =====
  ipcMain.handle(
    IPC.AI_MEMORY_ASK,
    async (
      _e,
      question: string,
      config: AiConfig,
      options?: { topK?: number; threshold?: number }
    ) => {
      return askProjectMemory(question, config, options)
    }
  )

  ipcMain.handle(
    IPC.AI_RELATED_SESSIONS,
    (_e, sessionId: string, options?: { limit?: number; threshold?: number }) => {
      return findRelatedSessions(sessionId, options)
    }
  )

  // AI 连接测试（通过 main 进程，避免 CORS）
  // 同时测 chat 和 embeddings，只要一个成功就算可用
  ipcMain.handle(IPC.TEST_AI_CONNECTION, async (_e, config) => {
    const { baseUrl, apiKey, chatModel, embeddingModel } = config
    const base = baseUrl.replace(/\/$/, '')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    }

    // 1. 测 chat 接口（必测）
    let chatOk = false
    let chatError = ''
    try {
      const resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: chatModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        })
      })
      if (resp.ok) {
        chatOk = true
      } else {
        const txt = await resp.text()
        chatError = `chat ${resp.status}: ${txt.slice(0, 150)}`
      }
    } catch (e) {
      chatError = e instanceof Error ? e.message : String(e)
    }

    // 2. 测 embeddings 接口（可选，不支持也不算失败）
    let embeddingOk = false
    let embeddingDim = 0
    let embeddingError = ''
    try {
      const resp = await fetch(`${base}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: embeddingModel, input: ['test'] })
      })
      if (resp.ok) {
        const data = await resp.json()
        embeddingDim = data.data?.[0]?.embedding?.length ?? 0
        if (embeddingDim > 0) embeddingOk = true
      } else {
        const txt = await resp.text()
        embeddingError = `embeddings ${resp.status}: ${txt.slice(0, 150)}`
      }
    } catch (e) {
      embeddingError = e instanceof Error ? e.message : String(e)
    }

    // chat 成功就算配置可用
    if (chatOk) {
      const msg = embeddingOk
        ? `连接成功（chat ✓, embeddings ✓ 维度 ${embeddingDim}）`
        : `对话连接成功 ✓（embeddings 不可用：${embeddingError}，语义搜索将无法使用）`
      return { ok: true, dim: embeddingDim, error: undefined, message: msg }
    }

    // chat 失败
    return {
      ok: false,
      error: `对话接口失败：${chatError}${embeddingError ? '；embeddings 也失败：' + embeddingError : ''}`,
      dim: 0,
      message: undefined
    }
  })
}
