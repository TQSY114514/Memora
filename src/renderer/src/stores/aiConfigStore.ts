import { create } from 'zustand'
import type { AiConfig, AiApiStyle, EmbeddingMode } from '@shared/types'
import { API_STYLE_META } from '@shared/constants'

/**
 * AI 配置 store（v1.2 多供应商版，支持无限添加）
 *
 * 架构（v1.2 重构）：
 * - 内置预设：openai / deepseek（快速起步用，可删除）
 * - 自定义供应商：用户可任意新增，持久化在 localStorage 的 CUSTOM_PROVIDERS_KEY
 * - provider key 唯一，自定义供应商用 `custom_<timestamp>` 格式保证唯一
 * - 每个供应商独立配置：apiStyle / baseUrl / apiKey / chatModel / embeddingModel / embeddingDim
 *
 * 安全：apiKey 不存 localStorage（明文不安全），改用 Electron safeStorage 加密存储。
 * - localStorage 只存 baseUrl/model/hasApiKey/apiStyle/label 等非敏感配置
 * - apiKey 明文通过 IPC 存取 main 进程的加密文件（secrets.enc）
 * - store 内存中保留 apiKey 明文供运行时使用，启动时异步从 main 加载
 */

const STORAGE_KEY = 'Memora.aiConfigs'
const ACTIVE_KEY = 'Memora.aiActiveProvider'
const CUSTOM_PROVIDERS_KEY = 'Memora.aiCustomProviders' // v1.2：自定义供应商元信息（key/label/apiStyle）

/** 内置预设（仅 2 个快速起步，用户可删除） */
export const BUILTIN_PRESETS: Record<
  string,
  { label: string; baseUrl: string; chatModel: string; embeddingModel: string; embeddingDim: number; apiStyle: AiApiStyle }
> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    apiStyle: 'openai'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-chat',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    apiStyle: 'openai'
  }
}

/**
 * v1.2 兼容旧版：PROVIDER_PRESETS 合并内置预设 + 自定义供应商
 * 供旧代码（如 AiSettings 遍历标签页）使用，运行时动态计算
 */
export function getProviderPresets(): Record<string, { label: string; baseUrl: string; chatModel: string; embeddingModel: string; embeddingDim: number; apiStyle: AiApiStyle }> {
  const custom = loadCustomProviders()
  const result: Record<string, { label: string; baseUrl: string; chatModel: string; embeddingModel: string; embeddingDim: number; apiStyle: AiApiStyle }> = { ...BUILTIN_PRESETS }
  for (const [key, meta] of Object.entries(custom)) {
    result[key] = {
      label: meta.label,
      apiStyle: meta.apiStyle,
      baseUrl: API_STYLE_META[meta.apiStyle].defaultBaseUrl,
      chatModel: '',
      embeddingModel: '',
      embeddingDim: 1536
    }
  }
  return result
}

/** 单个供应商的配置（apiKey 仅在内存中，不持久化到 localStorage） */
export type ProviderConfig = {
  label: string            // v1.2：显示名（必填，从预设或用户输入）
  apiStyle: AiApiStyle     // v1.2：API 协议风格
  baseUrl: string
  apiKey: string
  hasApiKey: boolean       // 是否已配置密钥（持久化到 localStorage，供 UI 立即判断）
  chatModel: string
  embeddingModel: string
  embeddingDim: number
  /** v1.8 #15：嵌入模式（默认 api） */
  embeddingMode: EmbeddingMode
}

/** 所有供应商的配置映射（key 是 provider 唯一标识） */
type ProviderConfigs = Record<string, ProviderConfig>

/** 自定义供应商元信息（持久化在 CUSTOM_PROVIDERS_KEY） */
interface CustomProviderMeta {
  label: string
  apiStyle: AiApiStyle
}

/** 加载自定义供应商元信息列表 */
function loadCustomProviders(): Record<string, CustomProviderMeta> {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, CustomProviderMeta>
  } catch {
    return {}
  }
}

/** 保存自定义供应商元信息列表 */
function saveCustomProviders(custom: Record<string, CustomProviderMeta>): void {
  try {
    localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(custom))
  } catch {
    // ignore
  }
}

/** 根据 provider key 获取预设（内置或自定义） */
function getPreset(provider: string): { label: string; apiStyle: AiApiStyle; baseUrl: string; chatModel: string; embeddingModel: string; embeddingDim: number } | null {
  if (BUILTIN_PRESETS[provider]) return BUILTIN_PRESETS[provider]
  const custom = loadCustomProviders()
  if (custom[provider]) {
    const c = custom[provider]
    return {
      label: c.label,
      apiStyle: c.apiStyle,
      baseUrl: API_STYLE_META[c.apiStyle].defaultBaseUrl,
      chatModel: '',
      embeddingModel: '',
      embeddingDim: 1536
    }
  }
  return null
}

/** 生成唯一 provider key（用于新增自定义供应商） */
function generateProviderKey(label: string): string {
  const base = label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').toLowerCase().slice(0, 20)
  return `custom_${base}_${Date.now()}`
}

function makeDefaultConfigs(): ProviderConfigs {
  const presets = getProviderPresets()
  const configs: Partial<ProviderConfigs> = {}
  for (const p of Object.keys(presets)) {
    const preset = presets[p]
    configs[p] = {
      label: preset.label,
      apiStyle: preset.apiStyle,
      baseUrl: preset.baseUrl,
      apiKey: '',
      hasApiKey: false,
      chatModel: preset.chatModel,
      embeddingModel: preset.embeddingModel,
      embeddingDim: preset.embeddingDim,
      embeddingMode: 'api'
    }
  }
  return configs as ProviderConfigs
}

/** localStorage 存取的格式（不含 apiKey 明文） */
type StoredProviderConfig = Omit<ProviderConfig, 'apiKey'>

/** 旧版 localStorage 里的明文 apiKey，待迁移到 safeStorage */
let legacyKeysToMigrate: Record<string, string> = {}

function loadConfigs(): ProviderConfigs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const presets = getProviderPresets()
    const defaults = makeDefaultConfigs()

    if (!raw) return defaults

    const parsed = JSON.parse(raw) as Record<string, StoredProviderConfig>
    const result: Partial<ProviderConfigs> = {}
    legacyKeysToMigrate = {}

    // 合并预设 + localStorage 中存储的配置（含自定义供应商）
    const allKeys = new Set([...Object.keys(presets), ...Object.keys(parsed)])

    for (const p of allKeys) {
      const preset = presets[p]
      const stored = parsed[p]
      // 兼容旧数据：如果旧 localStorage 里有 apiKey 明文，标记待迁移到 safeStorage
      const hasApiKey = stored?.hasApiKey ?? false
      if (stored && (stored as Record<string, unknown>).apiKey) {
        legacyKeysToMigrate[p] = (stored as Record<string, unknown>).apiKey as string
      }
      result[p] = {
        label: stored?.label ?? preset?.label ?? p,
        apiStyle: stored?.apiStyle ?? preset?.apiStyle ?? 'openai',
        baseUrl: stored?.baseUrl ?? preset?.baseUrl ?? '',
        chatModel: stored?.chatModel ?? preset?.chatModel ?? '',
        embeddingModel: stored?.embeddingModel ?? preset?.embeddingModel ?? '',
        embeddingDim: stored?.embeddingDim ?? preset?.embeddingDim ?? 1536,
        embeddingMode: (stored as Record<string, unknown>)?.embeddingMode === 'local' ? 'local' : 'api',
        apiKey: '', // 不从 localStorage 加载明文
        hasApiKey
      }
    }
    return result as ProviderConfigs
  } catch {
    return makeDefaultConfigs()
  }
}

function loadActiveProvider(): string {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (raw) {
      // v1.2：只要 configs 里存在该 key 就允许，不再白名单校验
      const configs = loadConfigs()
      if (configs[raw]) return raw
    }
  } catch {
    // ignore
  }
  // 回退到第一个可用 provider
  const presets = getProviderPresets()
  const keys = Object.keys(presets)
  return keys.length > 0 ? keys[0] : 'openai'
}

/** 持久化到 localStorage（apiKey 明文不写入，只存 hasApiKey 标记） */
function saveConfigs(configs: ProviderConfigs): void {
  try {
    const sanitized: Record<string, StoredProviderConfig> = {}
    for (const p of Object.keys(configs)) {
      const c = configs[p]
      sanitized[p] = {
        label: c.label,
        apiStyle: c.apiStyle,
        baseUrl: c.baseUrl,
        hasApiKey: c.hasApiKey,
        chatModel: c.chatModel,
        embeddingModel: c.embeddingModel,
        embeddingDim: c.embeddingDim,
        embeddingMode: c.embeddingMode
        // 不存 apiKey 明文
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized))
  } catch {
    // ignore
  }
}

function saveActiveProvider(provider: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, provider)
  } catch {
    // ignore
  }
}

interface AiConfigState {
  /** 当前激活的供应商 */
  activeProvider: string
  /** 所有供应商的配置（各自独立，apiKey 在内存中） */
  configs: ProviderConfigs
  /** 当前激活供应商的配置（与 activeProvider 同步） */
  config: ProviderConfig
  /** apiKey 是否已从 main 加载到内存 */
  apiKeysLoaded: boolean
  /** 更新当前激活供应商的配置 */
  setConfig: (patch: Partial<ProviderConfig>) => void
  /** 切换激活供应商 */
  setActiveProvider: (provider: string) => void
  /** 重置某供应商配置为预设（仅对内置预设有效） */
  resetProvider: (provider: string) => void
  /** v1.2：新增自定义供应商，返回新 provider key */
  addProvider: (label: string, apiStyle: AiApiStyle, baseUrl?: string) => string
  /** v1.2：删除供应商（内置预设也可删除） */
  removeProvider: (provider: string) => void
  /** v1.2：重命名供应商 */
  renameProvider: (provider: string, newLabel: string) => void
  /** v1.2：切换供应商的 API 协议风格 */
  setProviderApiStyle: (provider: string, apiStyle: AiApiStyle) => void
  /** 从 main 加密存储加载所有 apiKey 到内存（App 启动时调用一次） */
  loadApiKeys: () => Promise<void>
}

export const useAiConfigStore = create<AiConfigState>((set, get) => {
  const initialConfigs = loadConfigs()
  const initialActive = loadActiveProvider()

  return {
    activeProvider: initialActive,
    configs: initialConfigs,
    config: initialConfigs[initialActive] ?? Object.values(initialConfigs)[0],
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
      // 同步非敏感字段到主进程文件（供 MCP 进程读取）
      window.Memora?.ai?.saveConfigFile?.(state.activeProvider, {
        label: nextConfig.label,
        apiStyle: nextConfig.apiStyle,
        baseUrl: nextConfig.baseUrl,
        chatModel: nextConfig.chatModel,
        embeddingModel: nextConfig.embeddingModel,
        embeddingDim: nextConfig.embeddingDim,
        hasApiKey: nextConfig.hasApiKey,
        embeddingMode: nextConfig.embeddingMode
      }).catch(() => {})
      set({ configs: nextConfigs, config: nextConfig })
    },

    setActiveProvider: (provider) => {
      const state = get()
      if (!state.configs[provider]) return
      saveActiveProvider(provider)
      window.Memora?.ai?.setActiveProviderFile?.(provider).catch(() => {})
      set({ activeProvider: provider, config: state.configs[provider] })
    },

    resetProvider: (provider) => {
      const preset = getPreset(provider)
      if (!preset) return
      const resetConfig: ProviderConfig = {
        label: preset.label,
        apiStyle: preset.apiStyle,
        baseUrl: preset.baseUrl,
        apiKey: '',
        hasApiKey: false,
        chatModel: preset.chatModel,
        embeddingModel: preset.embeddingModel,
        embeddingDim: preset.embeddingDim,
        embeddingMode: 'api'
      }
      const state = get()
      const nextConfigs = { ...state.configs, [provider]: resetConfig }
      saveConfigs(nextConfigs)
      window.Memora?.secret?.delete(provider).catch(() => {})
      window.Memora?.ai?.deleteConfigFile?.(provider).catch(() => {})
      if (provider === state.activeProvider) {
        set({ configs: nextConfigs, config: resetConfig })
      } else {
        set({ configs: nextConfigs })
      }
    },

    addProvider: (label, apiStyle, baseUrl) => {
      const key = generateProviderKey(label)
      const newConfig: ProviderConfig = {
        label,
        apiStyle,
        baseUrl: baseUrl ?? API_STYLE_META[apiStyle].defaultBaseUrl,
        apiKey: '',
        hasApiKey: false,
        chatModel: '',
        embeddingModel: '',
        embeddingDim: 1536,
        embeddingMode: 'api'
      }
      const state = get()
      const nextConfigs = { ...state.configs, [key]: newConfig }
      saveConfigs(nextConfigs)

      // 持久化自定义供应商元信息
      const custom = loadCustomProviders()
      custom[key] = { label, apiStyle }
      saveCustomProviders(custom)

      // 同步到主进程文件
      window.Memora?.ai?.saveConfigFile?.(key, {
        label: newConfig.label,
        apiStyle: newConfig.apiStyle,
        baseUrl: newConfig.baseUrl,
        chatModel: newConfig.chatModel,
        embeddingModel: newConfig.embeddingModel,
        embeddingDim: newConfig.embeddingDim,
        hasApiKey: false
      }).catch(() => {})

      set({ configs: nextConfigs })
      return key
    },

    removeProvider: (provider) => {
      const state = get()
      const nextConfigs = { ...state.configs }
      delete nextConfigs[provider]

      // 如果删除的是激活项，切换到第一个可用 provider
      let newActive = state.activeProvider
      let newConfig = state.config
      if (state.activeProvider === provider) {
        const remaining = Object.keys(nextConfigs)
        if (remaining.length > 0) {
          newActive = remaining[0]
          newConfig = nextConfigs[newActive]
          saveActiveProvider(newActive)
          window.Memora?.ai?.setActiveProviderFile?.(newActive).catch(() => {})
        }
      }

      saveConfigs(nextConfigs)
      window.Memora?.secret?.delete(provider).catch(() => {})
      window.Memora?.ai?.deleteConfigFile?.(provider).catch(() => {})

      // 从自定义供应商列表移除（内置预设不在其中，无副作用）
      const custom = loadCustomProviders()
      delete custom[provider]
      saveCustomProviders(custom)

      set({
        configs: nextConfigs,
        activeProvider: newActive,
        config: newConfig
      })
    },

    renameProvider: (provider, newLabel) => {
      const state = get()
      const cfg = state.configs[provider]
      if (!cfg) return
      const nextConfig = { ...cfg, label: newLabel }
      const nextConfigs = { ...state.configs, [provider]: nextConfig }
      saveConfigs(nextConfigs)

      // 更新自定义供应商元信息（如果是自定义的）
      const custom = loadCustomProviders()
      if (custom[provider]) {
        custom[provider].label = newLabel
        saveCustomProviders(custom)
      }

      // 同步到主进程
      window.Memora?.ai?.saveConfigFile?.(provider, {
        label: nextConfig.label,
        apiStyle: nextConfig.apiStyle,
        baseUrl: nextConfig.baseUrl,
        chatModel: nextConfig.chatModel,
        embeddingModel: nextConfig.embeddingModel,
        embeddingDim: nextConfig.embeddingDim,
        hasApiKey: nextConfig.hasApiKey,
        embeddingMode: nextConfig.embeddingMode
      }).catch(() => {})

      if (provider === state.activeProvider) {
        set({ configs: nextConfigs, config: nextConfig })
      } else {
        set({ configs: nextConfigs })
      }
    },

    setProviderApiStyle: (provider, apiStyle) => {
      const state = get()
      const cfg = state.configs[provider]
      if (!cfg) return
      const nextConfig = {
        ...cfg,
        apiStyle,
        // 切换协议风格时，如果 baseUrl 为空或仍是旧风格的默认值，则更新为新风格默认值
        baseUrl: (cfg.baseUrl === '' || Object.values(API_STYLE_META).some(m => m.defaultBaseUrl === cfg.baseUrl))
          ? API_STYLE_META[apiStyle].defaultBaseUrl
          : cfg.baseUrl
      }
      const nextConfigs = { ...state.configs, [provider]: nextConfig }
      saveConfigs(nextConfigs)

      // 更新自定义供应商元信息
      const custom = loadCustomProviders()
      if (custom[provider]) {
        custom[provider].apiStyle = apiStyle
        saveCustomProviders(custom)
      }

      window.Memora?.ai?.saveConfigFile?.(provider, {
        label: nextConfig.label,
        apiStyle: nextConfig.apiStyle,
        baseUrl: nextConfig.baseUrl,
        chatModel: nextConfig.chatModel,
        embeddingModel: nextConfig.embeddingModel,
        embeddingDim: nextConfig.embeddingDim,
        hasApiKey: nextConfig.hasApiKey,
        embeddingMode: nextConfig.embeddingMode
      }).catch(() => {})

      if (provider === state.activeProvider) {
        set({ configs: nextConfigs, config: nextConfig })
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
        for (const p of Object.keys(nextConfigs)) {
          if (keys[p]) {
            nextConfigs[p] = { ...nextConfigs[p], apiKey: keys[p], hasApiKey: true }
          }
        }
        set({
          configs: nextConfigs,
          config: nextConfigs[state.activeProvider] ?? state.config,
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
  const needsKey = API_STYLE_META[cfg.apiStyle].needsApiKey
  // v1.8 #15：local 模式下 embeddingModel 为本地模型 ID，不需要 API embedding 配置
  if (cfg.embeddingMode === 'local') {
    return !!(cfg.baseUrl && cfg.chatModel && (!needsKey || cfg.hasApiKey || cfg.apiKey))
  }
  return !!(cfg.baseUrl && cfg.chatModel && cfg.embeddingModel && (!needsKey || cfg.hasApiKey || cfg.apiKey))
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
    label: cfg.label,
    apiStyle: cfg.apiStyle,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    chatModel: cfg.chatModel,
    embeddingModel: cfg.embeddingModel,
    embeddingDim: cfg.embeddingDim,
    embeddingMode: cfg.embeddingMode
  }
}
