/**
 * Memory Security Center —— 安全中心
 *
 * 聚合展示加密状态、敏感信息检测、脱敏建议等安全信息。
 */

import { getDatabase } from '../database/connection'
import { safeStorage } from 'electron'
import { detectPii } from '../importer/piiDetector'

export interface SecurityCenterReport {
  generatedAt: string
  encryption: {
    /** 主进程 safeStorage 是否可用 */
    safeStorageAvailable: boolean
    /** 已加密存储的 API Key 数量 */
    encryptedKeysCount: number
    /** 加密状态评估 */
    status: 'secure' | 'partial' | 'insecure'
    /** 说明 */
    note: string
  }
  sensitiveInfo: {
    /** 检测到的敏感信息总数 */
    total: number
    /** 按类型分组 */
    byType: Array<{
      type: string
      count: number
      lastDetectedAt: string
    }>
    /** 最近的敏感信息样本（脱敏后） */
    samples: Array<{
      type: string
      masked: string
      source: string
      detectedAt: string
    }>
  }
  dataSafety: {
    /** 数据库路径 */
    dbPath: string
    /** 数据库大小 (MB) */
    dbSizeMB: number
    /** 是否加密 */
    encrypted: boolean
    /** 备份数量 */
    backupCount: number
  }
  recommendations: string[]
}

interface SensitiveScanRow {
  id: string
  content: string
  source: string
  createdAt: string
}

export function generateSecurityReport(): SecurityCenterReport {
  const db = getDatabase()

  // 加密状态
  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  let encryptedKeysCount = 0
  try {
    const rows = db
      .prepare('SELECT COUNT(*) as cnt FROM secrets')
      .get() as { cnt: number } | undefined
    encryptedKeysCount = rows?.cnt ?? 0
  } catch {
    // secrets 表可能不存在
  }

  const encryption = {
    safeStorageAvailable: encryptionAvailable,
    encryptedKeysCount,
    status: encryptionAvailable
      ? (encryptedKeysCount > 0 ? 'secure' as const : 'partial' as const)
      : 'insecure' as const,
    note: encryptionAvailable
      ? 'API Key 使用操作系统级加密存储（safeStorage）'
      : '操作系统不支持 safeStorage，API Key 以明文存储（不推荐）'
  }

  // 敏感信息检测
  const sensitiveByType: Map<string, { count: number; lastDetectedAt: string }> = new Map()
  const samples: SecurityCenterReport['sensitiveInfo']['samples'] = []

  try {
    // 扫描消息中的敏感信息
    const msgRows = db
      .prepare(
        `SELECT m.id, m.content, s.title as source, m.createdAt
         FROM messages m
         JOIN chat_sessions s ON m.sessionId = s.id
         ORDER BY m.createdAt DESC
         LIMIT 500`
      )
      .all() as SensitiveScanRow[]

    for (const row of msgRows) {
      const result = detectPii(row.content)
      for (const d of result.matches) {
        const existing = sensitiveByType.get(d.type)
        if (existing) {
          existing.count++
          if (row.createdAt > existing.lastDetectedAt) {
            existing.lastDetectedAt = row.createdAt
          }
        } else {
          sensitiveByType.set(d.type, { count: 1, lastDetectedAt: row.createdAt })
        }

        if (samples.length < 10) {
          // 脱敏：只显示前 2 后 2 字符
          const masked = d.value.length > 8
            ? `${d.value.slice(0, 2)}${'*'.repeat(Math.min(d.value.length - 4, 8))}${d.value.slice(-2)}`
            : '***'

          samples.push({
            type: d.type,
            masked,
            source: row.source,
            detectedAt: row.createdAt
          })
        }
      }
    }
  } catch {
    // 扫描失败不影响其他功能
  }

  const byType = Array.from(sensitiveByType.entries()).map(([type, info]) => ({
    type,
    count: info.count,
    lastDetectedAt: info.lastDetectedAt
  }))

  // 数据安全
  let dbPath = ''
  let dbSizeMB = 0
  try {
    const row = db
      .prepare('PRAGMA database_list')
      .get() as { file: string } | undefined
    if (row) {
      dbPath = row.file
      const fs = require('fs')
      try {
        const stats = fs.statSync(dbPath)
        dbSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100
      } catch {
        // 忽略
      }
    }
  } catch {
    // 忽略
  }

  let backupCount = 0
  try {
    const row = db
      .prepare('SELECT COUNT(*) as cnt FROM backups')
      .get() as { cnt: number } | undefined
    backupCount = row?.cnt ?? 0
  } catch {
    // backups 表可能不存在
  }

  const dataSafety = {
    dbPath,
    dbSizeMB,
    encrypted: false,
    backupCount
  }

  // 建议
  const recommendations: string[] = []
  if (!encryptionAvailable) {
    recommendations.push('当前操作系统不支持安全加密存储，建议升级系统或使用支持 TPM/Keychain 的设备')
  }
  if (byType.length > 0) {
    recommendations.push(`检测到 ${byType.reduce((sum, t) => sum + t.count, 0)} 处敏感信息，建议在导入时启用自动脱敏`)
    if (byType.some((t) => t.type === 'api_key' || t.type === 'token')) {
      recommendations.push('发现 API Key 或 Token 明文存储，建议删除或使用环境变量替代')
    }
    if (byType.some((t) => t.type === 'phone' || t.type === 'email')) {
      recommendations.push('发现手机号或邮箱，建议在分享导出前手动脱敏')
    }
  }
  if (backupCount === 0) {
    recommendations.push('尚未创建备份，建议定期备份数据以防丢失')
  }
  if (dbSizeMB > 100) {
    recommendations.push(`数据库较大（${dbSizeMB} MB），建议执行 VACUUM 回收空间`)
  }
  if (recommendations.length === 0) {
    recommendations.push('安全状态良好，无需额外操作')
  }

  return {
    generatedAt: new Date().toISOString(),
    encryption,
    sensitiveInfo: {
      total: byType.reduce((sum, t) => sum + t.count, 0),
      byType,
      samples
    },
    dataSafety,
    recommendations
  }
}