/**
 * 记忆生命周期管理（v1.7.0）
 *
 * C1: 仿生学遗忘机制 — 基于艾宾浩斯遗忘曲线 + 访问频率的置信度衰减
 * C2: 分层记忆模型 — 工作记忆 / 短期记忆 / 长期记忆 三轨分类
 * C3: 深度用户画像 — 自然语言摘要生成
 */
import { getDatabase } from '../database/connection'
import { listPreferences } from '../database/repositories/preferencesRepo'
import type { Preference, MemoryTier, TieredMemory, MemoryHealth, ProfileSummary } from '@shared/types'

// ===== C1: 艾宾浩斯遗忘曲线 =====

/**
 * 艾宾浩斯遗忘曲线：R = e^(-t / S)
 * S = 记忆稳定性因子，随复习次数增长
 *
 * 复习次数 → 稳定性：
 *   0 次（新记忆）: S = 1   (1 天后保留 ~37%)
 *   1 次: S = 6   (6 天后保留 ~37%)
 *   2 次: S = 30  (30 天后保留 ~37%)
 *   3 次: S = 90  (90 天后保留 ~37%)
 *   4+ 次: S = 180 (180 天后保留 ~37%)
 */
function getStabilityFactor(accessCount: number): number {
  if (accessCount === 0) return 1
  if (accessCount === 1) return 6
  if (accessCount === 2) return 30
  if (accessCount === 3) return 90
  return 180
}

/**
 * 计算艾宾浩斯保留率
 * @param daysSinceLastAccess 距上次访问的天数
 * @param accessCount 总访问次数
 * @returns 保留率 0-1
 */
export function ebbinghausRetention(daysSinceLastAccess: number, accessCount: number): number {
  if (daysSinceLastAccess <= 0) return 1.0
  const S = getStabilityFactor(accessCount)
  return Math.exp(-daysSinceLastAccess / S)
}

/**
 * 计算综合记忆强度
 * 综合 confidence + 艾宾浩斯保留率 + 访问加权
 */
export function memoryStrength(pref: Preference): number {
  const now = new Date()
  const daysSinceLastAccess = pref.lastAccessedAt
    ? (now.getTime() - new Date(pref.lastAccessedAt).getTime()) / (24 * 60 * 60 * 1000)
    : 30 // 从未访问过，默认 30 天

  const retention = ebbinghausRetention(daysSinceLastAccess, pref.accessCount)
  const accessBonus = Math.min(0.2, pref.accessCount * 0.02) // 每次访问 +0.02，上限 0.2

  return Math.min(1.0, Math.max(0, pref.confidence * 0.5 + retention * 0.3 + accessBonus))
}

// ===== C2: 分层记忆模型 =====

/**
 * 将偏好分类到记忆层级
 *
 * 工作记忆 (working):
 *   - strength < 0.3 或创建 < 7 天且未巩固
 *   - 还在形成的记忆，可能被遗忘
 *
 * 短期记忆 (short_term):
 *   - strength 0.3-0.6
 *   - 有印象但不够稳固的记忆
 *
 * 长期记忆 (long_term):
 *   - strength > 0.6
 *   - 多次访问、高置信度的稳固记忆
 */
export function classifyMemoryTier(pref: Preference): MemoryTier {
  const strength = memoryStrength(pref)
  const now = new Date()
  const daysSinceCreated =
    (now.getTime() - new Date(pref.createdAt).getTime()) / (24 * 60 * 60 * 1000)

  // 新创建的记忆默认为工作记忆
  if (daysSinceCreated < 7 && pref.accessCount < 2) {
    return 'working'
  }

  if (strength < 0.3) return 'working'
  if (strength < 0.6) return 'short_term'
  return 'long_term'
}

/** 获取分层记忆列表 */
export function getTieredMemories(workspaceId?: string): TieredMemory[] {
  const prefs = listPreferences({ workspaceId, status: 'active' })
  return prefs.map((p) => {
    const tier = classifyMemoryTier(p)
    const strength = memoryStrength(p)
    const S = getStabilityFactor(p.accessCount)
    const estimatedRetentionDays = Math.round(S * Math.log(1 / 0.37)) // 保留 37% 的天数

    return { preference: p, tier, strength, estimatedRetentionDays }
  }).sort((a, b) => b.strength - a.strength)
}

/** 获取记忆健康报告 */
export function getMemoryHealth(workspaceId?: string): MemoryHealth {
  const memories = getTieredMemories(workspaceId)

  const working = memories.filter((m) => m.tier === 'working')
  const shortTerm = memories.filter((m) => m.tier === 'short_term')
  const longTerm = memories.filter((m) => m.tier === 'long_term')
  const atRisk = memories.filter((m) => m.strength < 0.2)
  const strongest = longTerm.slice(0, 5)

  return {
    workspaceId: workspaceId ?? 'all',
    total: memories.length,
    working: working.length,
    shortTerm: shortTerm.length,
    longTerm: longTerm.length,
    atRisk,
    strongest
  }
}

// ===== C3: 深度用户画像 =====

/** 生成自然语言用户画像摘要 */
export function generateProfileSummary(workspaceId: string): ProfileSummary {
  const memories = getTieredMemories(workspaceId)
  const health = getMemoryHealth(workspaceId)

  // 按 subject 分组，取最高置信度
  const subjectMap = new Map<string, TieredMemory[]>()
  for (const m of memories) {
    const group = subjectMap.get(m.preference.subject) || []
    group.push(m)
    subjectMap.set(m.preference.subject, group)
  }

  const highlights: ProfileSummary['highlights'] = []
  const trends: ProfileSummary['trends'] = []

  for (const [subject, items] of subjectMap) {
    // 按 confidence 降序
    const sorted = items.sort((a, b) => b.preference.confidence - a.preference.confidence)
    const best = sorted[0]

    // 描述
    const tierLabel = best.tier === 'long_term' ? '稳固记忆' : best.tier === 'short_term' ? '近期记忆' : '工作记忆'
    const description = `${best.preference.value}（${tierLabel}，强度 ${Math.round(best.strength * 100)}%）`

    highlights.push({
      subject,
      value: best.preference.value,
      confidence: best.preference.confidence,
      tier: best.tier,
      description
    })

    // 检测趋势：同 subject 下有 superseded 的偏好
    const superseded = sorted.filter((m) => m.preference.status === 'superseded')
    if (superseded.length > 0 && sorted.length > 1) {
      const current = sorted.find((m) => m.preference.status === 'active')
      const old = superseded[0]
      if (current && old.preference.value !== current.preference.value) {
        trends.push({
          subject,
          from: old.preference.value,
          to: current.preference.value,
          description: `从「${old.preference.value}」变为「${current.preference.value}」`
        })
      }
    }
  }

  // 生成自然语言摘要
  const summaryParts: string[] = []

  // 概览
  summaryParts.push(
    `该用户共有 ${health.total} 条活跃记忆：` +
    `${health.longTerm} 条长期记忆、${health.shortTerm} 条短期记忆、${health.working} 条工作记忆。`
  )

  if (health.atRisk.length > 0) {
    summaryParts.push(`⚠️ ${health.atRisk.length} 条记忆处于遗忘风险中。`)
  }

  // 高置信度偏好
  const highConfidence = highlights.filter((h) => h.confidence >= 0.8)
  if (highConfidence.length > 0) {
    const items = highConfidence.map((h) => `${h.subject}：${h.value}`).join('、')
    summaryParts.push(`高置信度偏好：${items}。`)
  }

  // 趋势
  if (trends.length > 0) {
    const trendItems = trends.map((t) => t.description).join('；')
    summaryParts.push(`近期变化：${trendItems}。`)
  }

  // 记忆健康评分
  const healthScore = health.total > 0
    ? Math.round((health.longTerm / health.total) * 100)
    : 0
  summaryParts.push(`记忆健康评分：${healthScore}/100（长期记忆占比 ${healthScore}%）。`)

  return {
    workspaceId,
    summary: summaryParts.join('\n'),
    highlights,
    trends,
    stats: {
      totalMemories: health.total,
      longTermCount: health.longTerm,
      shortTermCount: health.shortTerm,
      workingCount: health.working,
      atRiskCount: health.atRisk.length
    }
  }
}

/**
 * 执行一次完整的记忆生命周期维护
 * - 更新所有 active 偏好的强度
 * - 归档过弱的记忆（strength < 0.1）
 * - 返回维护报告
 */
export function runMemoryLifecycle(workspaceId?: string): {
  maintained: number
  archived: number
  promoted: number  // 升级到长期记忆的数量
  demoted: number   // 降级到短期/工作记忆的数量
} {
  const db = getDatabase()
  const memories = getTieredMemories(workspaceId)
  const now = new Date().toISOString()

  let archived = 0
  let promoted = 0
  let demoted = 0

  const tx = db.transaction(() => {
    for (const mem of memories) {
      // 太弱的记忆 → 归档
      if (mem.strength < 0.1 && mem.preference.status === 'active') {
        db.prepare(
          `UPDATE preferences
           SET status = 'archived', updated_at = ?
           WHERE id = ?`
        ).run(now, mem.preference.id)
        archived++
        continue
      }

      // 更新 last_accessed_at 和访问计数（如果从未访问过，给一个初始访问）
      if (!mem.preference.lastAccessedAt) {
        db.prepare(
          `UPDATE preferences
           SET last_accessed_at = ?, access_count = access_count + 1
           WHERE id = ?`
        ).run(now, mem.preference.id)
      }

      // 追踪层级变化（仅用于统计）
      const oldTier = classifyMemoryTier(mem.preference)
      // touch 后重新计算
      if (oldTier === 'working' && mem.strength > 0.3) promoted++
      if (oldTier === 'long_term' && mem.strength < 0.6) demoted++
    }
  })
  tx()

  return {
    maintained: memories.length,
    archived,
    promoted,
    demoted
  }
}