import { create } from 'zustand'
import type { AiConfig } from '@shared/types'

/**
 * AI 配置 store
 * 持久化到 localStorage（含 API Key，仅本地保存，不上传）
 */

const STORAGE_KEY = 'aether.aiConfig'

const DEFAULT_CONFIG: AiConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  chatModel: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 1536
}

/** 预设 Provider 配置 */
export const PROVIDER_PRESETS: Record<
  AiConfig['provider'],
  { label: string; baseUrl: string; chatModel: string; embeddingModel: string; embeddingDim: number }
> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-chat',
    // DeepSeek 暂无 embedding 接口，回退到 OpenAI 兼容服务
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536
  },
  custom: {
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    chatModel: '',
    embeddingModel: '',
    embeddingDim: 1536
  }
}

function loadConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

function saveConfig(config: AiConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // 忽略写入失败
  }
}

interface AiConfigState {
  config: AiConfig
  setConfig: (patch: Partial<AiConfig>) => void
  setProvider: (provider: AiConfig['provider']) => void
  reset: () => void
}

export const useAiConfigStore = create<AiConfigState>((set, get) => ({
  config: loadConfig(),
  setConfig: (patch) => {
    const next = { ...get().config, ...patch }
    saveConfig(next)
    set({ config: next })
  },
  setProvider: (provider) => {
    const preset = PROVIDER_PRESETS[provider]
    const next: AiConfig = {
      ...get().config,
      provider,
      baseUrl: preset.baseUrl || get().config.baseUrl,
      chatModel: preset.chatModel || get().config.chatModel,
      embeddingModel: preset.embeddingModel || get().config.embeddingModel,
      embeddingDim: preset.embeddingDim
    }
    saveConfig(next)
    set({ config: next })
  },
  reset: () => {
    saveConfig(DEFAULT_CONFIG)
    set({ config: DEFAULT_CONFIG })
  }
}))

/** 判断 AI 配置是否完整可用 */
export function isAiConfigured(config: AiConfig): boolean {
  return !!(config.baseUrl && config.apiKey && config.chatModel && config.embeddingModel)
}
