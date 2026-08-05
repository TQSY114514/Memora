import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type { SessionSummary, AiConfig } from '@shared/types'

// ===== AI（Phase 2） =====
export const ai = {
  /** 生成（或重新生成）会话总结 */
  generateSummary: (sessionId: string, config: AiConfig, templateId?: string): Promise<SessionSummary> =>
    ipcRenderer.invoke(IPC.AI_SUMMARY_GENERATE, sessionId, config, templateId),
  /** 获取会话总结（不触发生成） */
  getSummary: (sessionId: string): Promise<SessionSummary | null> =>
    ipcRenderer.invoke(IPC.AI_SUMMARY_GET, sessionId),
  /** 删除会话总结 */
  deleteSummary: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.AI_SUMMARY_DELETE, sessionId),
  /** 更新会话总结（手动编辑） */
  updateSummary: (
    sessionId: string,
    data: { summary: string; keyPoints: string[]; todos: string[] }
  ): Promise<SessionSummary> => ipcRenderer.invoke(IPC.AI_SUMMARY_UPDATE, sessionId, data),
  /** 生成 knowledge.md 内容 */
  generateKnowledgeMd: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke(IPC.AI_KNOWLEDGE_GENERATE, sessionId),
  /** 为会话生成向量索引（增量） */
  embedSession: (
    sessionId: string,
    config: AiConfig
  ): Promise<{ total: number; embedded: number; skipped: number }> =>
    ipcRenderer.invoke(IPC.AI_EMBED_SESSION, sessionId, config),
  /** 查询会话向量索引进度 */
  getEmbedStatus: (
    sessionId: string
  ): Promise<{ total: number; embedded: number; complete: boolean }> =>
    ipcRenderer.invoke(IPC.AI_EMBED_STATUS, sessionId),
  /** 测试 AI 连接（通过 main 进程，避免 CORS，v1.2 支持多协议） */
  testConnection: (config: {
    apiStyle?: import('@shared/types').AiApiStyle
    baseUrl: string
    apiKey: string
    chatModel: string
    embeddingModel: string
    embeddingMode?: import('@shared/types').EmbeddingMode
  }): Promise<{ ok: boolean; dim: number; error: string | undefined; message?: string }> =>
    ipcRenderer.invoke(IPC.TEST_AI_CONNECTION, config),
  /** 同步 AI 配置到主进程文件（供 MCP 进程读取，只存非敏感字段） */
  saveConfigFile: (
    provider: string,
    config: {
      baseUrl: string
      chatModel: string
      embeddingModel: string
      embeddingDim: number
      hasApiKey: boolean
      apiStyle?: import('@shared/types').AiApiStyle
      label?: string
      embeddingMode?: import('@shared/types').EmbeddingMode
    }
  ): Promise<void> => ipcRenderer.invoke(IPC.AI_CONFIG_FILE_SAVE, provider, config),
  /** 设置激活的 provider（同步到主进程文件） */
  setActiveProviderFile: (provider: string): Promise<void> =>
    ipcRenderer.invoke(IPC.AI_CONFIG_FILE_SET_ACTIVE, provider),
  /** 删除某 provider 的配置文件记录 */
  deleteConfigFile: (provider: string): Promise<void> =>
    ipcRenderer.invoke(IPC.AI_CONFIG_FILE_DELETE, provider),
  /** 查询本地嵌入模型状态（v1.8 #15） */
  getLocalEmbedderStatus: (): Promise<{
    state: 'idle' | 'loading' | 'ready' | 'error'
    model?: string
    dim?: number
    error?: string
    progress?: {
      status?: string
      file?: string | null
      percent?: number | null
      loaded?: number | null
      total?: number | null
    }
  }> => ipcRenderer.invoke(IPC.AI_EMBED_LOCAL_STATUS),
  /** 预加载本地嵌入模型（v1.8 #15） */
  loadLocalModel: (modelId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.AI_EMBED_LOCAL_LOAD, modelId),
  /** 获取模型下载镜像（null = 官方 HuggingFace） */
  getLocalModelMirror: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.AI_EMBED_LOCAL_MIRROR_GET),
  /** 设置模型下载镜像，空字符串恢复官方源 */
  setLocalModelMirror: (mirror: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.AI_EMBED_LOCAL_MIRROR_SET, mirror),
  /** 删除本地缓存的模型文件 */
  deleteLocalModel: (modelId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.AI_EMBED_LOCAL_DELETE_MODEL, modelId),
  /** 模型缓存占用统计 */
  getLocalModelCacheInfo: (): Promise<{ ok: boolean; models: Array<{ id: string; sizeBytes: number }>; totalBytes: number; error?: string }> =>
    ipcRenderer.invoke(IPC.AI_EMBED_LOCAL_CACHE_INFO)
}

// ===== API Key 安全存储（safeStorage 加密） =====
export const secret = {
  /** 批量获取所有 provider 的明文 apiKey（从加密存储读取） */
  getAll: (): Promise<Record<string, string>> => ipcRenderer.invoke(IPC.SECRET_GET_ALL),
  /** 加密保存某 provider 的 apiKey */
  set: (provider: string, key: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SECRET_SET, provider, key),
  /** 删除某 provider 的 apiKey */
  delete: (provider: string): Promise<void> => ipcRenderer.invoke(IPC.SECRET_DELETE, provider),
  /** 加密存储是否可用（false = 明文降级模式，UI 应警告用户） */
  isEncryptionAvailable: (): Promise<boolean> => ipcRenderer.invoke(IPC.SECRET_ENCRYPTION_AVAILABLE)
}