/**
 * AI 配置文件持久化（主进程侧）
 *
 * 痛点：renderer 的 AI 配置存在 localStorage，MCP 进程（独立 Electron 实例）读不到。
 * 方案：renderer 保存配置时通过 IPC 同步一份非敏感字段到 userData/ai-config.json，
 * MCP 进程读取该文件 + secretStore 的 apiKey 组装完整 AiConfig。
 *
 * 安全：本文件只存非敏感字段（baseUrl/chatModel/embeddingModel/embeddingDim/activeProvider），
 * apiKey 明文仍只存 secretStore 加密文件。
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
  if (file.activeProvider === provider) {
    file.activeProvider = 'openai'
  }
  saveAiConfigFile(file)
}
