/**
 * AI 配置文件持久化（主进程侧）
 *
 * 痛点：renderer 的 AI 配置存在 localStorage，MCP 进程（独立 Electron 实例）读不到。
 * 方案：renderer 保存配置时通过 IPC 同步一份非敏感字段到 userData/ai-config.json，
 * MCP 进程读取该文件 + secretStore 的 apiKey 组装完整 AiConfig。
 *
 * 安全：本文件只存非敏感字段（baseUrl/chatModel/embeddingModel/embeddingDim/activeProvider），
 * apiKey 明文仍只存 secretStore 加密文件。
 *
 * v1.2：加 apiStyle（多协议路由）和 label（显示名）字段，支持无限供应商
 */
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export interface StoredAiConfig {
  baseUrl: string
  chatModel: string
  embeddingModel: string
  embeddingDim: number
  hasApiKey: boolean
  /** v1.2 新增：API 协议风格（默认 openai） */
  apiStyle?: 'openai' | 'anthropic' | 'ollama' | 'gemini'
  /** v1.2 新增：显示名 */
  label?: string
}

export interface AiConfigFile {
  activeProvider?: string
  configs: Record<string, StoredAiConfig>
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'ai-config.json')
}

/** 读取 AI 配置文件 */
export function loadAiConfigFile(): AiConfigFile {
  const p = getConfigPath()
  if (!existsSync(p)) return { configs: {} }
  try {
    const raw = readFileSync(p, 'utf-8')
    return JSON.parse(raw) as AiConfigFile
  } catch {
    return { configs: {} }
  }
}

/** 写入 AI 配置文件 */
export function saveAiConfigFile(data: AiConfigFile): void {
  writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf-8')
}

/** 更新单个 provider 的非敏感配置 */
export function saveProviderConfig(
  provider: string,
  config: StoredAiConfig
): void {
  const file = loadAiConfigFile()
  file.configs[provider] = config
  saveAiConfigFile(file)
}

/** 设置激活的 provider */
export function setActiveProvider(provider: string): void {
  const file = loadAiConfigFile()
  file.activeProvider = provider
  saveAiConfigFile(file)
}

/** 删除某 provider 的配置 */
export function deleteProviderConfig(provider: string): void {
  const file = loadAiConfigFile()
  delete file.configs[provider]
  // v1.2：删除激活项时，回退到第一个可用配置，而非硬编码 'openai'
  if (file.activeProvider === provider) {
    const remaining = Object.keys(file.configs)
    file.activeProvider = remaining.length > 0 ? remaining[0] : undefined
  }
  saveAiConfigFile(file)
}

/** v1.2：列出所有已配置的 provider key（供 secretStore 动态读取 apiKey） */
export function listConfiguredProviders(): string[] {
  const file = loadAiConfigFile()
  return Object.keys(file.configs)
}
