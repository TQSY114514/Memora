import { create } from 'zustand'
import type { AiConfig } from '@shared/types'

/**
 * AI 配置 store（多供应商版）
 * 每个 provider 独立存储配置，互不干扰
 *
 * 安全：apiKey 不存 localStorage（明文不安全），改用 Electron safeStorage 加密存储。
 * - localStorage 只存 baseUrl/model/hasApiKey 等非敏感配置
 * - apiKey 明文通过 IPC 存取 main 进程的加密文件（secrets.enc）
 * - store 内存中保留 apiKey 明文供运行时使用，启动时异步从 main 加载
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

/** 单个供应商的配置（apiKey 仅在内存中，不持久化到 localStorage） */
export type ProviderConfig = {
  baseUrl: string
  apiKey: string
  hasApiKey: boolean // 是否已配置密钥（持久化到 localStorage，供 UI 立即判断）
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
      hasApiKey: false,
      chatModel: preset.chatModel,
      embeddingModel: preset.embeddingModel,
      embeddingDim: preset.embeddingDim
    }
  }
  return configs as ProviderConfigs
}

/** localStorage 存取的格式（不含 apiKey 明文） */
type StoredProviderConfig = Omit<ProviderConfig, 'apiKey'> & { apiKey?: string }

/** 旧版 localStorage 里的明文 apiKey，待迁移到 safeStorage */
let legacyKeysToMigrate: Partial<Record<AiConfig['provider'], string>> = {}

function loadConfigs(): ProviderConfigs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return makeDefaultConfigs()
    const parsed = JSON.parse(raw) as Partial<Record<AiConfig['provider'], StoredProviderConfig>>
    const defaults = makeDefaultConfigs()
    const result: Partial<ProviderConfigs> = {}
    legacyKeysToMigrate = {}
    for (const p of Object.keys(PROVIDER_PRESETS) as AiConfig['provider'][]) {
      const stored = parsed[p]
      // 兼容旧数据：如果旧 localStorage 里有 apiKey 明文，标记待迁移到 safeStorage
      const hasApiKey = stored?.hasApiKey ?? !!stored?.apiKey
      if (stored?.apiKey) {
        legacyKeysToMigrate[p] = stored.apiKey
      }
      result[p] = {
        ...defaults[p],
        baseUrl: stored?.baseUrl ?? defaults[p].baseUrl,
        chatModel: stored?.chatModel ?? defaults[p].chatModel,
        embeddingModel: stored?.embeddingModel ?? defaults[p].embeddingModel,
        embeddingDim: stored?.embeddingDim ?? defaults[p].embeddingDim,
        apiKey: '', // 不从 localStorage 加载明文
        hasApiKey
      }
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

/** 持久化到 localStorage（apiKey 明文不写入，只存 hasApiKey 标记） */
function saveConfigs(configs: ProviderConfigs): void {
  try {
    const sanitized: Partial<Record<AiConfig['provider'], StoredProviderConfig>> = {}
    for (const p of Object.keys(configs) as AiConfig['provider'][]) {
      const c = configs[p]
      sanitized[p] = {
        baseUrl: c.baseUrl,
        hasApiKey: c.hasApiKey,
        chatModel: c.chatModel,
        embeddingModel: c.embeddingModel,
        embeddingDim: c.embeddingDim
        // 不存 apiKey 明文
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized))
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
  /** 所有供应商的配置（各自独立，apiKey 在内存中） */
  configs: ProviderConfigs
  /** 当前激活供应商的配置（与 activeProvider 同步） */
  config: ProviderConfig
  /** apiKey 是否已从 main 加载到内存 */
  apiKeysLoaded: boolean
  /** 更新当前激活供应商的配置 */
  setConfig: (patch: Partial<ProviderConfig>) => void
  /** 切换激活供应商 */
  setActiveProvider: (provider: AiConfig['provider']) => void
  /** 重置某供应商配置为预设 */
  resetProvider: (provider: AiConfig['provider']) => void
  /** 从 main 加密存储加载所有 apiKey 到内存（App 启动时调用一次） */
  loadApiKeys: () => Promise<void>
}

export const useAiConfigStore = create<AiConfigState>((set, get) => {
  const initialConfigs = loadConfigs()
  const initialActive = loadActiveProvider()

  return {
    activeProvider: initialActive,
    configs: initialConfigs,
    config: initialConfigs[initialActive],
    apiKeysLoaded: false,

    setConfig: (patch) => {
      const state = get()
      const nextConfig: ProviderConfig = { ...state.configs[state.activeProvider], ...patch }

      // apiKey 特殊处理：加密存到 main 的 safeStorage，不存 localStorage
      if (patch.apiKey !== undefined) {
        if (patch.apiKey) {
          nextConfig.hasApiKey = true
          // 异步存到加密存储，不阻塞 UI
          window.Memora?.secret?.set(state.activeProvider, patch.apiKey).catch(() => {})
        } else {
          nextConfig.hasApiKey = false
          window.Memora?.secret?.delete(state.activeProvider).catch(() => {})
        }
      }

      const nextConfigs = { ...state.configs, [state.activeProvider]: nextConfig }
      saveConfigs(nextConfigs) // localStorage 不含 apiKey 明文
      set({ configs: nextConfigs, config: nextConfig })
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
        hasApiKey: false,
        chatModel: preset.chatModel,
        embeddingModel: preset.embeddingModel,
        embeddingDim: preset.embeddingDim
      }
      const state = get()
      const nextConfigs = { ...state.configs, [provider]: resetConfig }
      saveConfigs(nextConfigs)
      window.Memora?.secret?.delete(provider).catch(() => {})
      if (provider === state.activeProvider) {
        set({ configs: nextConfigs, config: resetConfig })
      } else {
        set({ configs: nextConfigs })
      }
    },

    loadApiKeys: async () => {
      if (get().apiKeysLoaded) return
      try {
        // 迁移旧版 localStorage 明文 apiKey → safeStorage 加密存储
        if (Object.keys(legacyKeysToMigrate).length > 0) {
          for (const [p, key] of Object.entries(legacyKeysToMigrate)) {
            await window.Memora.secret.set(p, key)
          }
          legacyKeysToMigrate = {}
          // 立即刷新 localStorage（清除明文 apiKey，只保留 hasApiKey 标记）
          saveConfigs(get().configs)
        }
        const keys = await window.Memora.secret.getAll()
        const state = get()
        const nextConfigs = { ...state.configs }
        for (const p of Object.keys(nextConfigs) as AiConfig['provider'][]) {
          if (keys[p]) {
            nextConfigs[p] = { ...nextConfigs[p], apiKey: keys[p], hasApiKey: true }
          }
        }
        set({
          configs: nextConfigs,
          config: nextConfigs[state.activeProvider],
          apiKeysLoaded: true
        })
      } catch {
        set({ apiKeysLoaded: true })
      }
    }
  }
})

/** 判断某个供应商配置是否完整可用（基于 hasApiKey，不依赖明文是否已加载） */
export function isProviderConfigured(cfg: ProviderConfig): boolean {
  return !!(cfg.baseUrl && (cfg.hasApiKey || cfg.apiKey) && cfg.chatModel && cfg.embeddingModel)
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
