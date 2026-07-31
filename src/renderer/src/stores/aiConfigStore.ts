import { create } from 'zustand'
import type { AiConfig } from '@shared/types'

/**
 * AI 配置 store（多供应商版）
 * 每个 provider 独立存储配置，互不干扰
 * 持久化到 localStorage（含 API Key，仅本地保存，不上传）
 */

const STORAGE_KEY = 'Memora.aiConfigs'
const ACTIVE_KEY = 'Memora.aiActiveProvider'

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

/** 单个供应商的配置 */
export type ProviderConfig = {
  baseUrl: string
  apiKey: string
  chatModel: string
  embeddingModel: string
  embeddingDim: number
}

/** 所有供应商的配置映射 */
type ProviderConfigs = Record<AiConfig['provider'], ProviderConfig>

function makeDefaultConfigs(): ProviderConfigs {
  const configs: Partial<ProviderConfigs> = {}
  for (const p of Object.keys(PROVIDER_PRESETS) as AiConfig['provider'][]) {
    const preset = PROVIDER_PRESETS[p]
    configs[p] = {
      baseUrl: preset.baseUrl,
      apiKey: '',
      chatModel: preset.chatModel,
      embeddingModel: preset.embeddingModel,
      embeddingDim: preset.embeddingDim
    }
  }
  return configs as ProviderConfigs
}

function loadConfigs(): ProviderConfigs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return makeDefaultConfigs()
    const parsed = JSON.parse(raw) as Partial<ProviderConfigs>
    const defaults = makeDefaultConfigs()
    // 合并：确保所有 provider 都有配置
    const result: Partial<ProviderConfigs> = {}
    for (const p of Object.keys(PROVIDER_PRESETS) as AiConfig['provider'][]) {
      result[p] = { ...defaults[p], ...parsed[p] }
    }
    return result as ProviderConfigs
  } catch {
    return makeDefaultConfigs()
  }
}

function loadActiveProvider(): AiConfig['provider'] {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (raw === 'openai' || raw === 'deepseek' || raw === 'custom') return raw
  } catch {
    // ignore
  }
  return 'openai'
}

function saveConfigs(configs: ProviderConfigs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
  } catch {
    // ignore
  }
}

function saveActiveProvider(provider: AiConfig['provider']): void {
  try {
    localStorage.setItem(ACTIVE_KEY, provider)
  } catch {
    // ignore
  }
}

interface AiConfigState {
  /** 当前激活的供应商 */
  activeProvider: AiConfig['provider']
  /** 所有供应商的配置（各自独立） */
  configs: ProviderConfigs
  /** 当前激活供应商的配置（与 activeProvider 同步） */
  config: ProviderConfig
  /** 更新当前激活供应商的配置 */
  setConfig: (patch: Partial<ProviderConfig>) => void
  /** 切换激活供应商 */
  setActiveProvider: (provider: AiConfig['provider']) => void
  /** 重置某供应商配置为预设 */
  resetProvider: (provider: AiConfig['provider']) => void
}

export const useAiConfigStore = create<AiConfigState>((set, get) => {
  const initialConfigs = loadConfigs()
  const initialActive = loadActiveProvider()

  return {
    activeProvider: initialActive,
    configs: initialConfigs,
    config: initialConfigs[initialActive],
    setConfig: (patch) => {
      const state = get()
      const nextConfigs = {
        ...state.configs,
        [state.activeProvider]: { ...state.configs[state.activeProvider], ...patch }
      }
      saveConfigs(nextConfigs)
      set({ configs: nextConfigs, config: nextConfigs[state.activeProvider] })
    },
    setActiveProvider: (provider) => {
      saveActiveProvider(provider)
      const state = get()
      set({ activeProvider: provider, config: state.configs[provider] })
    },
    resetProvider: (provider) => {
      const preset = PROVIDER_PRESETS[provider]
      const resetConfig: ProviderConfig = {
        baseUrl: preset.baseUrl,
        apiKey: '',
        chatModel: preset.chatModel,
        embeddingModel: preset.embeddingModel,
        embeddingDim: preset.embeddingDim
      }
      const state = get()
      const nextConfigs = { ...state.configs, [provider]: resetConfig }
      saveConfigs(nextConfigs)
      if (provider === state.activeProvider) {
        set({ configs: nextConfigs, config: resetConfig })
      } else {
        set({ configs: nextConfigs })
      }
    }
  }
})

/** 判断某个供应商配置是否完整可用 */
export function isProviderConfigured(cfg: ProviderConfig): boolean {
  return !!(cfg.baseUrl && cfg.apiKey && cfg.chatModel && cfg.embeddingModel)
}

/** 判断当前激活供应商是否配置完整（兼容旧接口） */
export function isAiConfigured(config: ProviderConfig): boolean {
  return isProviderConfigured(config)
}

/**
 * 兼容旧接口：返回类 AiConfig 对象
 * 供需要 provider 字段的代码（如 preload IPC 调用）使用
 */
export function getActiveAiConfig(): AiConfig {
  const { configs, activeProvider } = useAiConfigStore.getState()
  const cfg = configs[activeProvider]
  return {
    provider: activeProvider,
    ...cfg
  }
}
