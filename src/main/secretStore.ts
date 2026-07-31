/**
 * API Key 安全存储
 *
 * 用 Electron safeStorage 加密（macOS Keychain / Windows DPAPI / Linux libsecret），
 * 密文存到 userData/secrets.enc，renderer 永远不接触明文存储。
 *
 * renderer 通过 IPC 存取，localStorage 不再保存 apiKey。
 */
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

const PROVIDERS = ['openai', 'deepseek', 'custom'] as const
type Provider = (typeof PROVIDERS)[number]

interface SecretsFile {
  [provider: string]: string // base64 编码的加密 Buffer
}

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

/** 加密存储某 provider 的 apiKey */
export function setApiKey(provider: string, apiKey: string): void {
  const data = readSecretsFile()
  if (!apiKey) {
    delete data[provider]
  } else {
    const encrypted = safeStorage.encryptString(apiKey)
    data[provider] = encrypted.toString('base64')
  }
  writeSecretsFile(data)
}

/** 解密读取某 provider 的 apiKey */
export function getApiKey(provider: string): string | null {
  const data = readSecretsFile()
  const encoded = data[provider]
  if (!encoded) return null
  try {
    const buf = Buffer.from(encoded, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    console.warn(`[secretStore] 解密 ${provider} 失败，可能密钥已变更`)
    return null
  }
}

/** 批量获取所有 provider 的明文 apiKey */
export function getAllApiKeys(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const p of PROVIDERS) {
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
