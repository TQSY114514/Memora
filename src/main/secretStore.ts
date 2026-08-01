/**
 * API Key 安全存储
 *
 * 用 Electron safeStorage 加密（macOS Keychain / Windows DPAPI / Linux libsecret），
 * 密文存到 userData/secrets.enc，renderer 永远不接触明文存储。
 *
 * renderer 通过 IPC 存取，localStorage 不再保存 apiKey。
 *
 * v1.2：getAllApiKeys 不再硬编码 3 个 provider，改为从 aiConfigFile 动态读取
 *      已配置的 provider 列表，支持无限供应商
 * v1.8：safeStorage 不可用时（无 libsecret 的 Linux）显式降级为明文 base64 存储，
 *      值以 'plain:' 前缀标记，并通过 isPlaintextFallback() 暴露给 UI 警告用户
 */
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { listConfiguredProviders } from './aiConfigFile'
import { logger } from './logger'

interface SecretsFile {
  [provider: string]: string // base64 编码的加密 Buffer，或 'plain:' 前缀的明文 base64
}

/** 明文降级值前缀 */
const PLAIN_PREFIX = 'plain:'

function getSecretsPath(): string {
  return join(app.getPath('userData'), 'secrets.enc')
}

/** 读取加密文件（返回原始映射） */
function readSecretsFile(): SecretsFile {
  const p = getSecretsPath()
  if (!existsSync(p)) return {}
  try {
    const raw = readFileSync(p, 'utf-8')
    return JSON.parse(raw) as SecretsFile
  } catch {
    return {}
  }
}

/** 写入加密文件 */
function writeSecretsFile(data: SecretsFile): void {
  writeFileSync(getSecretsPath(), JSON.stringify(data), 'utf-8')
}

/** safeStorage 是否可用（不可用时降级为明文存储，仅本地文件） */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/**
 * 是否处于明文降级模式（safeStorage 不可用）。
 * UI 层应据此向用户显示安全警告。
 */
export function isPlaintextFallback(): boolean {
  return !safeStorage.isEncryptionAvailable()
}

/** 加密存储某 provider 的 apiKey */
export function setApiKey(provider: string, apiKey: string): void {
  const data = readSecretsFile()
  if (!apiKey) {
    delete data[provider]
  } else if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(apiKey)
    data[provider] = encrypted.toString('base64')
  } else {
    // 降级：明文 base64 存储，用前缀标记，UI 层会警告用户
    logger.warn('safeStorage unavailable, storing API key in plaintext fallback', { provider })
    data[provider] = PLAIN_PREFIX + Buffer.from(apiKey, 'utf-8').toString('base64')
  }
  writeSecretsFile(data)
}

/** 解密读取某 provider 的 apiKey */
export function getApiKey(provider: string): string | null {
  const data = readSecretsFile()
  const encoded = data[provider]
  if (!encoded) return null
  try {
    if (encoded.startsWith(PLAIN_PREFIX)) {
      // 明文降级值
      return Buffer.from(encoded.slice(PLAIN_PREFIX.length), 'base64').toString('utf-8')
    }
    const buf = Buffer.from(encoded, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    console.warn(`[secretStore] 解密 ${provider} 失败，可能密钥已变更`)
    return null
  }
}

/**
 * 批量获取所有已配置 provider 的明文 apiKey
 * v1.2：从 aiConfigFile 动态读取 provider 列表，不再硬编码
 */
export function getAllApiKeys(): Record<string, string> {
  const result: Record<string, string> = {}
  // 从 ai-config.json 读取已配置的 provider 列表
  const providers = listConfiguredProviders()
  for (const p of providers) {
    const key = getApiKey(p)
    if (key) result[p] = key
  }
  return result
}

/** 删除某 provider 的 apiKey */
export function deleteApiKey(provider: string): void {
  const data = readSecretsFile()
  delete data[provider]
  writeSecretsFile(data)
}
