import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/constants'
import { deleteSummary, upsertSummary } from '@db/repositories'
import { generateSummary, getSessionSummary, generateKnowledgeMd } from '@ai/summarizer'
import { embedSession, getEmbedStatus } from '@ai/embedder'
import { askProjectMemory, findRelatedSessions } from '@ai/projectMemory'
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

export function registerAiHandlers(): void {
  // ===== AI 总结（Phase 2） =====
  safeHandle(
    IPC.AI_SUMMARY_GENERATE,
    async (_e, sessionId: string, config: AiConfig) => {
      return generateSummary(sessionId, config)
    }
  )

  safeHandle(IPC.AI_SUMMARY_GET, (_e, sessionId: string) => {
    return getSessionSummary(sessionId)
  })

  safeHandle(IPC.AI_SUMMARY_DELETE, (_e, sessionId: string) => {
    deleteSummary(sessionId)
  })

  safeHandle(
    IPC.AI_SUMMARY_UPDATE,
    (_e, sessionId: string, data: { summary: string; keyPoints: string[]; todos: string[] }) => {
      return upsertSummary(sessionId, data)
    }
  )

  safeHandle(IPC.AI_KNOWLEDGE_GENERATE, (_e, sessionId: string) => {
    return generateKnowledgeMd(sessionId)
  })

  // ===== 向量嵌入（Phase 2） =====
  safeHandle(
    IPC.AI_EMBED_SESSION,
    async (_e, sessionId: string, config: AiConfig) => {
      return embedSession(sessionId, config)
    }
  )

  safeHandle(IPC.AI_EMBED_STATUS, (_e, sessionId: string) => {
    return getEmbedStatus(sessionId)
  })

  // ===== Project Memory 智能问答（Phase 3） =====
  safeHandle(
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

  safeHandle(
    IPC.AI_RELATED_SESSIONS,
    (_e, sessionId: string, options?: { limit?: number; threshold?: number }) => {
      return findRelatedSessions(sessionId, options)
    }
  )

  // AI 连接测试（通过 main 进程，避免 CORS）
  // 同时测 chat 和 embeddings，只要一个成功就算可用
  safeHandle(IPC.TEST_AI_CONNECTION, async (_e, config) => {
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
