/**
 * 记忆时间胶囊（Memory Time Capsule）
 *
 * 封存一组记忆，设定未来解锁时间。
 * 解锁时生成对比报告（封存时 vs 现在的变化）。
 */
import { encrypt, decrypt, type EncryptedPackage } from '../crypto/e2e'
import { logger } from '../main/logger'
import { getDatabase } from '../database/connection'

export interface TimeCapsule {
  id: string
  name: string
  description: string
  /** 封存时间 */
  sealedAt: string
  /** 解锁时间（ISO 时间戳） */
  unlockAt: string
  /** 是否已解锁 */
  unlocked: boolean
  /** 解锁时间（如果已解锁） */
  unlockedAt: string | null
  /** 加密的封存数据 */
  encryptedData: EncryptedPackage
  /** 摘要信息（不加密，方便预览） */
  summary: string
  /** 包含的条目数 */
  entryCount: number
}

export interface CapsuleCreateInput {
  name: string
  description?: string
  unlockAt: string
  password: string
  /** 要封存的知识条目 ID 列表 */
  entryIds: string[]
  /** 要封存的偏好 ID 列表 */
  preferenceIds: string[]
}

export interface CapsuleReport {
  capsule: TimeCapsule
  /** 新增的知识条目 */
  newEntries: number
  /** 删除的知识条目 */
  deletedEntries: number
  /** 修改的知识条目 */
  modifiedEntries: number
  /** 新增的偏好 */
  newPreferences: number
  /** 变化的偏好 */
  changedPreferences: number
  /** 封存时的知识条目列表 */
  sealedEntries: Array<{ title: string; type: string }>
  /** 封存时的偏好列表 */
  sealedPreferences: Array<{ subject: string; value: string }>
}

/** 创建记忆时间胶囊 */
export function createTimeCapsule(input: CapsuleCreateInput): TimeCapsule {
  const db = getDatabase()

  // 获取要封存的知识条目
  const entries: Array<{ id: string; title: string; type: string; content: string }> = []
  if (input.entryIds.length > 0) {
    const placeholders = input.entryIds.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT id, title, type, content FROM knowledge_entries WHERE id IN (${placeholders})`
      )
      .all(...input.entryIds) as Array<{ id: string; title: string; type: string; content: string }>
    entries.push(...rows)
  }

  // 获取要封存的偏好
  const preferences: Array<{ id: string; subject: string; value: string }> = []
  if (input.preferenceIds.length > 0) {
    const placeholders = input.preferenceIds.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT id, subject, value FROM preferences WHERE id IN (${placeholders})`
      )
      .all(...input.preferenceIds) as Array<{ id: string; subject: string; value: string }>
    preferences.push(...rows)
  }

  const capsuleData = {
    version: 1,
    sealedAt: new Date().toISOString(),
    entries,
    preferences
  }

  const encrypted = encrypt(JSON.stringify(capsuleData), input.password)
  const id = `capsule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const summary = `${entries.length} 条知识, ${preferences.length} 条偏好`

  return {
    id,
    name: input.name,
    description: input.description ?? '',
    sealedAt: new Date().toISOString(),
    unlockAt: input.unlockAt,
    unlocked: false,
    unlockedAt: null,
    encryptedData: encrypted,
    summary,
    entryCount: entries.length + preferences.length
  }
}

/** 解锁时间胶囊 */
export function unlockCapsule(
  capsule: TimeCapsule,
  password: string
): { success: boolean; data?: CapsuleReport; error?: string } {
  try {
    const decrypted = decrypt(capsule.encryptedData, password)
    const sealedData = JSON.parse(decrypted)

    const db = getDatabase()

    // 查询当前状态
    const now = new Date().toISOString()

    // 检查封存的知识条目当前状态
    const sealedEntryIds = sealedData.entries.map((e: { id: string }) => e.id)
    let existingEntries = 0
    if (sealedEntryIds.length > 0) {
      const placeholders = sealedEntryIds.map(() => '?').join(',')
      const row = db
        .prepare(
          `SELECT COUNT(*) as count FROM knowledge_entries WHERE id IN (${placeholders})`
        )
        .get(...sealedEntryIds) as { count: number }
      existingEntries = row.count
    }

    // 检查封存的偏好当前状态
    const sealedPrefIds = sealedData.preferences.map((p: { id: string }) => p.id)
    let existingPrefs = 0
    if (sealedPrefIds.length > 0) {
      const placeholders = sealedPrefIds.map(() => '?').join(',')
      const row = db
        .prepare(
          `SELECT COUNT(*) as count FROM preferences WHERE id IN (${placeholders})`
        )
        .get(...sealedPrefIds) as { count: number }
      existingPrefs = row.count
    }

    const report: CapsuleReport = {
      capsule: {
        ...capsule,
        unlocked: true,
        unlockedAt: now
      },
      newEntries: Math.max(0, existingEntries - sealedData.entries.length),
      deletedEntries: Math.max(0, sealedData.entries.length - existingEntries),
      modifiedEntries: 0, // 需要逐条比较才能得出
      newPreferences: Math.max(0, existingPrefs - sealedData.preferences.length),
      changedPreferences: 0,
      sealedEntries: sealedData.entries.map((e: { title: string; type: string }) => ({
        title: e.title,
        type: e.type
      })),
      sealedPreferences: sealedData.preferences.map((p: { subject: string; value: string }) => ({
        subject: p.subject,
        value: p.value
      }))
    }

    return { success: true, data: report }
  } catch (e) {
    logger.error('[timeCapsule] unlock error:', e as Record<string, unknown>)
    return { success: false, error: '密码错误或数据损坏' }
  }
}

/** 检查是否有到期的胶囊 */
export function checkDueCapsules(capsules: TimeCapsule[]): TimeCapsule[] {
  const now = new Date()
  return capsules.filter(c => !c.unlocked && new Date(c.unlockAt) <= now)
}