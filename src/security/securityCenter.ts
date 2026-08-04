/**
 * Memory Security Center —— 安全中心 v2.0
 *
 * 聚合展示加密状态、敏感信息检测、Prompt Injection 风险、脱敏建议等安全信息。
 *
 * v2.0: 新增 Prompt Injection 风险扫描
 */

import { getDatabase } from '../database/connection'
import { safeStorage } from 'electron'
import { detectPii } from '../importer/piiDetector'
import { detectPromptInjection } from '../importer/promptInjectionDetector'


export interface SecurityCenterReport {
  generatedAt: string
  encryption: {
    safeStorageAvailable: boolean
    encryptedKeysCount: number
    status: 'secure' | 'partial' | 'insecure'
    note: string
  }
  sensitiveInfo: {
    total: number
    byType: Array<{
      type: string
      count: number
      lastDetectedAt: string
    }>
    samples: Array<{
      type: string
      masked: string
      source: string
      detectedAt: string
    }>
  }
  /** v2.0: Prompt Injection 风险 */
  injectionRisk: {
    scanned: number
    risky: number
    riskLevel: string
    samples: Array<{
      source: string
      riskLevel: string
      summary: string
    }>
  }
  dataSafety: {
    dbPath: string
    dbSizeMB: number
    encrypted: boolean
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
    const msgRows = db
      .prepare(
        `SELECT m.id, m.content, s.title as source, m.created_at as createdAt
         FROM messages m
         JOIN chat_sessions s ON m.session_id = s.id
         ORDER BY m.created_at DESC
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

  // v2.0: Prompt Injection 风险扫描
  const injectionSamples: SecurityCenterReport['injectionRisk']['samples'] = []
  let injectionScanned = 0
  let injectionRisky = 0
  let maxInjectionRisk = 'low'

  try {
    const msgRows = db
      .prepare(
        `SELECT m.content, s.title as source
         FROM messages m
         JOIN chat_sessions s ON m.session_id = s.id
         ORDER BY m.created_at DESC
         LIMIT 200`
      )
      .all() as Array<{ content: string; source: string }>

    for (const row of msgRows) {
      injectionScanned++
      const result = detectPromptInjection(row.content)
      if (result.hasInjection) {
        injectionRisky++
        if (injectionSamples.length < 10) {
          injectionSamples.push({
            source: row.source,
            riskLevel: result.riskLevel,
            summary: result.summary
          })
        }
        // 更新最高风险等级
        const riskOrder = ['low', 'medium', 'high', 'critical']
        if (riskOrder.indexOf(result.riskLevel) > riskOrder.indexOf(maxInjectionRisk)) {
          maxInjectionRisk = result.riskLevel
        }
      }
    }
  } catch {
    // 扫描失败不影响
  }

  const injectionRisk = {
    scanned: injectionScanned,
    risky: injectionRisky,
    riskLevel: maxInjectionRisk,
    samples: injectionSamples
  }

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
  // v2.0: Prompt Injection 建议
  if (injectionRisky > 0) {
    recommendations.push(`检测到 ${injectionRisky} 处潜在 Prompt Injection 风险（${maxInjectionRisk} 级），建议审查相关对话内容`)
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
    injectionRisk,
    dataSafety,
    recommendations
  }
}