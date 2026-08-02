import { safeHandle, assertSafeId } from '../safeHandle'
import { IPC } from '@shared/constants'
import { deleteSummary, upsertSummary } from '@db/repositories'
import { generateSummary, getSessionSummary, generateKnowledgeMd } from '@ai/summarizer'
import { embedSession, getEmbedStatus } from '@ai/embedder'
import { askProjectMemory, findRelatedSessions } from '@ai/projectMemory'
import {
  saveProviderConfig,
  loadAiConfigFile,
  setActiveProvider as setActiveProviderFile,
  deleteProviderConfig
} from '@main/aiConfigFile'
import { callChat, embedQuery } from '@ai/apiClient'
import { getLocalEmbedderStatus, loadModel } from '@ai/localEmbedder'
import type { AiConfig, AiApiStyle } from '@shared/types'

export function registerAiHandlers(): void {
  // ===== AI 总结（Phase 2） =====
  safeHandle(
    IPC.AI_SUMMARY_GENERATE,
    async (_e, sessionId: string, config: AiConfig, templateId?: string) => {
      return generateSummary(assertSafeId(sessionId, 'sessionId'), config, templateId)
    }
  )

  safeHandle(IPC.AI_SUMMARY_GET, (_e, sessionId: string) => {
    return getSessionSummary(assertSafeId(sessionId, 'sessionId'))
  })

  safeHandle(IPC.AI_SUMMARY_DELETE, (_e, sessionId: string) => {
    deleteSummary(assertSafeId(sessionId, 'sessionId'))
  })

  safeHandle(
    IPC.AI_SUMMARY_UPDATE,
    (_e, sessionId: string, data: { summary: string; keyPoints: string[]; todos: string[] }) => {
      return upsertSummary(assertSafeId(sessionId, 'sessionId'), data)
    }
  )

  safeHandle(IPC.AI_KNOWLEDGE_GENERATE, (_e, sessionId: string) => {
    return generateKnowledgeMd(assertSafeId(sessionId, 'sessionId'))
  })

  // ===== 向量嵌入（Phase 2） =====
  safeHandle(
    IPC.AI_EMBED_SESSION,
    async (_e, sessionId: string, config: AiConfig) => {
      return embedSession(assertSafeId(sessionId, 'sessionId'), config)
    }
  )

  safeHandle(IPC.AI_EMBED_STATUS, (_e, sessionId: string) => {
    return getEmbedStatus(assertSafeId(sessionId, 'sessionId'))
  })

  // ===== 本地嵌入模型（v1.8 #15） =====
  safeHandle(IPC.AI_EMBED_LOCAL_STATUS, () => {
    return getLocalEmbedderStatus()
  })

  safeHandle(IPC.AI_EMBED_LOCAL_LOAD, async (_e, modelId: string) => {
    await loadModel(modelId)
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
      return findRelatedSessions(assertSafeId(sessionId, 'sessionId'), options)
    }
  )

  // AI 连接测试（通过 main 进程，避免 CORS）
  // v1.2：用 apiClient 统一路由，支持 openai/anthropic/ollama/gemini 四种协议
  // 同时测 chat 和 embeddings，只要一个成功就算可用
  safeHandle(IPC.TEST_AI_CONNECTION, async (_e, config) => {
    const { baseUrl, apiKey, chatModel, embeddingModel, apiStyle, embeddingMode } = config as {
      baseUrl: string
      apiKey: string
      chatModel: string
      embeddingModel: string
      apiStyle?: AiApiStyle
      embeddingMode?: 'api' | 'local'
    }

    const aiConfig: AiConfig = {
      provider: '_test_',
      apiStyle: apiStyle ?? 'openai',
      baseUrl,
      apiKey,
      chatModel,
      embeddingModel,
      embeddingDim: 0, // 测试时未知，不校验
      embeddingMode
    }

    // 1. 测 chat 接口（必测）
    let chatOk = false
    let chatError = ''
    try {
      await callChat(aiConfig, 'You are a test assistant. Reply with: ok', 'hi')
      chatOk = true
    } catch (e) {
      chatError = e instanceof Error ? e.message : String(e)
    }

    // v1.8 #15：本地嵌入模式跳过 embedding API 测试，chat 成功即算可用
    if (embeddingMode === 'local') {
      if (chatOk) {
        return {
          ok: true,
          dim: 0,
          error: undefined,
          message: '对话连接成功 ✓（嵌入模型将使用本地 ONNX，首次使用时自动下载模型）'
        }
      }
      return {
        ok: false,
        error: `对话接口失败：${chatError}`,
        dim: 0,
        message: undefined
      }
    }

    // 2. 测 embeddings 接口（可选，不支持也不算失败）
    let embeddingOk = false
    let embeddingDim = 0
    let embeddingError = ''
    try {
      const vec = await embedQuery(aiConfig, 'test')
      embeddingDim = vec.length
      if (embeddingDim > 0) embeddingOk = true
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

  // ===== AI 配置文件持久化（供 MCP 进程读取） =====
  safeHandle(
    IPC.AI_CONFIG_FILE_SAVE,
    (_e, provider: string, config: { baseUrl: string; chatModel: string; embeddingModel: string; embeddingDim: number; hasApiKey: boolean; apiStyle?: AiApiStyle; label?: string; embeddingMode?: 'api' | 'local' }) => {
      saveProviderConfig(provider, config)
    }
  )

  safeHandle(IPC.AI_CONFIG_FILE_LOAD, () => {
    return loadAiConfigFile()
  })

  safeHandle(IPC.AI_CONFIG_FILE_SET_ACTIVE, (_e, provider: string) => {
    setActiveProviderFile(provider)
  })

  safeHandle(IPC.AI_CONFIG_FILE_DELETE, (_e, provider: string) => {
    deleteProviderConfig(provider)
  })
}
