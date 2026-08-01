/**
 * MCP 工具域共享 helper
 *
 * 供多个域文件共用的工具函数（如 AI 配置加载）。
 */

import { loadAiConfigFile } from '../../main/aiConfigFile'
import { getAllApiKeys } from '../../main/secretStore'
import type { AiConfig } from '@shared/types'

/**
 * 从主进程配置文件 + secretStore 组装完整 AiConfig。
 *
 * memory_recall（memory 域）与 summarize_session（sessions 域）共用此逻辑。
 * 两个调用点的错误提示文案不同，故通过参数传入以保持零行为变更。
 */
export function loadAiConfigForTool(opts: {
  missingConfigMessage: string
  missingKeyMessage: string
}): AiConfig {
  const configFile = loadAiConfigFile()
  const activeProvider = configFile.activeProvider ?? 'openai'
  const stored = configFile.configs[activeProvider]
  if (!stored || !stored.hasApiKey) {
    throw new Error(opts.missingConfigMessage)
  }
  const apiKeys = getAllApiKeys()
  const apiKey = apiKeys[activeProvider]
  if (!apiKey) {
    throw new Error(opts.missingKeyMessage)
  }
  return {
    provider: activeProvider as AiConfig['provider'],
    baseUrl: stored.baseUrl,
    apiKey,
    chatModel: stored.chatModel,
    embeddingModel: stored.embeddingModel,
    embeddingDim: stored.embeddingDim
  }
}
