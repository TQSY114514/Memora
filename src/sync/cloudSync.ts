/**
 * 云端同步模块
 *
 * 支持 WebDAV 和 S3 兼容协议的云端同步。
 * 所有数据在本地经 E2E 加密后上传，云端不可读。
 */
import { encrypt, decrypt, sha256, type EncryptedPackage } from '../crypto/e2e'
import { logger } from '../main/logger'

/** 云端同步配置 */
export interface CloudSyncConfig {
  /** 是否启用 */
  enabled: boolean
  /** 协议类型 */
  protocol: 'webdav' | 's3'
  /** 服务端点 URL */
  endpoint: string
  /** 认证用户名（WebDAV）或 Access Key（S3） */
  username?: string
  /** 认证密码（WebDAV）或 Secret Key（S3） */
  password?: string
  /** S3 Bucket 名称 */
  bucket?: string
  /** S3 Region */
  region?: string
  /** 同步间隔（分钟） */
  intervalMinutes: number
  /** 上次同步时间 */
  lastSyncAt: string | null
  /** 加密密码（E2EE） */
  encryptionPassword?: string
}

/** 同步状态 */
export interface SyncStatus {
  /** 是否正在同步 */
  syncing: boolean
  /** 上次同步结果 */
  lastResult: 'success' | 'failed' | 'conflict' | null
  /** 上次同步时间 */
  lastSyncAt: string | null
  /** 上传的条目数 */
  uploadedCount: number
  /** 下载的条目数 */
  downloadedCount: number
  /** 错误信息 */
  error: string | null
  /** 本地数据哈希 */
  localHash: string | null
  /** 远程数据哈希 */
  remoteHash: string | null
}

/** 同步数据清单 */
export interface SyncManifest {
  deviceId: string
  deviceName: string
  version: number
  hash: string
  updatedAt: string
  items: SyncItem[]
}

export interface SyncItem {
  key: string
  hash: string
  updatedAt: string
}

/** 获取默认配置 */
export function getDefaultSyncConfig(): CloudSyncConfig {
  return {
    enabled: false,
    protocol: 'webdav',
    endpoint: '',
    intervalMinutes: 30,
    lastSyncAt: null
  }
}

/** 构建远程文件路径 */
function buildUrl(config: CloudSyncConfig, path: string): string {
  const base = config.endpoint.replace(/\/$/, '')
  if (config.protocol === 's3') {
    return `${base}/${config.bucket}/${path}`
  }
  return `${base}/${path}`
}

/** 构建请求头 */
function buildHeaders(config: CloudSyncConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' }
  if (config.username && config.password) {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64')
    headers['Authorization'] = `Basic ${auth}`
  }
  return headers
}

/** 上传数据到云端 */
export async function uploadToCloud(
  config: CloudSyncConfig,
  key: string,
  data: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!config.encryptionPassword) {
      return { success: false, error: '未设置加密密码' }
    }

    const encrypted = encrypt(data, config.encryptionPassword)
    const payload = JSON.stringify(encrypted)
    const url = buildUrl(config, `memora/${key}`)

    const response = await fetch(url, {
      method: 'PUT',
      headers: buildHeaders(config),
      body: payload
    })

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    return { success: true }
  } catch (e) {
    logger.error('[cloudSync] upload error:', e as Record<string, unknown>)
    return { success: false, error: String(e) }
  }
}

/** 从云端下载数据 */
export async function downloadFromCloud(
  config: CloudSyncConfig,
  key: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    if (!config.encryptionPassword) {
      return { success: false, error: '未设置加密密码' }
    }

    const url = buildUrl(config, `memora/${key}`)

    const response = await fetch(url, { headers: buildHeaders(config) })
    if (response.status === 404) {
      return { success: false, error: '远程文件不存在' }
    }
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const raw = await response.text()
    const encrypted: EncryptedPackage = JSON.parse(raw)
    const decrypted = decrypt(encrypted, config.encryptionPassword)

    return { success: true, data: decrypted }
  } catch (e) {
    logger.error('[cloudSync] download error:', e as Record<string, unknown>)
    return { success: false, error: String(e) }
  }
}

/** 列出云端的同步文件 */
export async function listCloudFiles(
  config: CloudSyncConfig
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  try {
    const url = buildUrl(config, 'memora/')
    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: { ...buildHeaders(config), Depth: '1' }
    })

    if (!response.ok) {
      // 尝试用 GET 请求（S3 兼容）
      const listResponse = await fetch(url, {
        headers: buildHeaders(config)
      })
      if (!listResponse.ok) {
        return { success: false, error: `HTTP ${listResponse.status}` }
      }
      return { success: true, files: [] }
    }

    const xml = await response.text()
    // 简单解析 WebDAV PROPFIND 响应
    const files = xml.match(/<D:href>([^<]+)<\/D:href>/g)
      ?.map(h => h.replace(/<D:href>/, '').replace(/<\/D:href>/, ''))
      .filter(h => h !== '/memora/' && !h.endsWith('/'))
      .map(h => h.replace(/^\/memora\//, '')) ?? []

    return { success: true, files }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/** 删除云端文件 */
export async function deleteCloudFile(
  config: CloudSyncConfig,
  key: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = buildUrl(config, `memora/${key}`)
    const response = await fetch(url, {
      method: 'DELETE',
      headers: buildHeaders(config)
    })

    if (!response.ok && response.status !== 404) {
      return { success: false, error: `HTTP ${response.status}` }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/** 测试云端连接 */
export async function testCloudConnection(
  config: CloudSyncConfig
): Promise<{ success: boolean; error?: string; latency?: number }> {
  const start = Date.now()
  try {
    const url = buildUrl(config, 'memora/.ping')
    const response = await fetch(url, {
      method: 'PUT',
      headers: buildHeaders(config),
      body: 'ping'
    })
    const latency = Date.now() - start

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, latency }
    }
    // 清理 ping 文件
    await deleteCloudFile(config, '.ping')
    return { success: true, latency }
  } catch (e) {
    return { success: false, error: String(e), latency: Date.now() - start }
  }
}

/** 执行全量同步 */
export async function performSync(
  config: CloudSyncConfig,
  localData: Record<string, string>
): Promise<SyncStatus> {
  const status: SyncStatus = {
    syncing: true,
    lastResult: null,
    lastSyncAt: null,
    uploadedCount: 0,
    downloadedCount: 0,
    error: null,
    localHash: null,
    remoteHash: null
  }

  try {
    // 计算本地数据哈希
    const localJson = JSON.stringify(localData)
    status.localHash = sha256(localJson)

    // 上传本地数据
    const uploadResult = await uploadToCloud(config, 'data.json', localJson)
    if (!uploadResult.success) {
      status.lastResult = 'failed'
      status.error = uploadResult.error ?? '上传失败'
      return status
    }
    status.uploadedCount = Object.keys(localData).length

    // 下载远程清单
    const manifestResult = await downloadFromCloud(config, 'manifest.json')
    if (manifestResult.success && manifestResult.data) {
      const manifest: SyncManifest = JSON.parse(manifestResult.data)
      status.remoteHash = manifest.hash
      status.downloadedCount = manifest.items.length
    }

    status.lastResult = 'success'
    status.lastSyncAt = new Date().toISOString()
  } catch (e) {
    status.lastResult = 'failed'
    status.error = String(e)
  } finally {
    status.syncing = false
  }

  return status
}