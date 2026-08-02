/**
 * 决策模式推断 —— 从偏好历史中推断用户的决策风格
 *
 * 分析维度：
 * - prefers_open_source: 从技术栈偏好中推断
 * - cost_sensitive: 从选型偏好（免费/付费）推断
 * - likes_new_tech: 从技术更迭频率推断
 * - values_privacy: 从 local-first / 隐私相关偏好推断
 * - early_adopter: 从技术栈前沿性推断
 * - prefers_simplicity: 从「简洁」/「简单」偏好推断
 */

import { getDatabase } from '../database/connection'

export interface DecisionPattern {
  prefers_open_source: number
  cost_sensitive: number
  likes_new_tech: number
  values_privacy: number
  early_adopter: number
  prefers_simplicity: number
  /** 推断依据 */
  evidence: string[]
}

interface PreferenceRow {
  subject: string
  value: string
  confidence: number
}

/** 开源关键词 */
const OPEN_SOURCE_KW = ['开源', 'open source', 'open-source', 'MIT', 'GPL', 'Apache', '自托管', 'self-host', '免费']
/** 成本敏感关键词 */
const COST_KW = ['免费', 'free', '便宜', '省钱', '成本', 'cost', '价格', 'price', '便宜', '预算']
/** 新技术关键词 */
const NEW_TECH_KW = ['新', '最新', 'Modern', '新版', '升级', '迁移', '切换', '换', 'Rust', 'Bun', 'Deno', 'Zig']
/** 隐私关键词 */
const PRIVACY_KW = ['隐私', 'privacy', '本地', 'local', '离线', 'offline', '加密', 'encrypt', '安全', 'security']
/** 极简关键词 */
const SIMPLICITY_KW = ['简洁', '简单', '极简', 'minimal', 'simple', '轻量', 'lightweight']

function countMatches(subject: string, value: string, keywords: string[]): number {
  const text = `${subject} ${value}`.toLowerCase()
  return keywords.filter((k) => text.includes(k.toLowerCase())).length
}

export function inferDecisionPattern(workspaceId?: string): DecisionPattern {
  const db = getDatabase()

  let rows: PreferenceRow[]
  if (workspaceId) {
    rows = db
      .prepare(
        `SELECT subject, value, confidence FROM preferences
         WHERE workspaceId = ? AND status = 'active'
         ORDER BY confidence DESC LIMIT 200`
      )
      .all(workspaceId) as PreferenceRow[]
  } else {
    rows = db
      .prepare(
        `SELECT subject, value, confidence FROM preferences
         WHERE status = 'active'
         ORDER BY confidence DESC LIMIT 200`
      )
      .all() as PreferenceRow[]
  }

  const evidence: string[] = []

  // 计算每个维度的得分
  let openSourceScore = 0
  let openSourceHits = 0
  let costScore = 0
  let costHits = 0
  let newTechScore = 0
  let newTechHits = 0
  let privacyScore = 0
  let privacyHits = 0
  let simplicityScore = 0
  let simplicityHits = 0

  for (const row of rows) {
    const os = countMatches(row.subject, row.value, OPEN_SOURCE_KW)
    if (os > 0) {
      openSourceScore += row.confidence * os
      openSourceHits++
      if (openSourceHits <= 3) evidence.push(`开源偏好: "${row.subject} → ${row.value}"`)
    }

    const cs = countMatches(row.subject, row.value, COST_KW)
    if (cs > 0) {
      costScore += row.confidence * cs
      costHits++
      if (costHits <= 3) evidence.push(`成本敏感: "${row.subject} → ${row.value}"`)
    }

    const nt = countMatches(row.subject, row.value, NEW_TECH_KW)
    if (nt > 0) {
      newTechScore += row.confidence * nt
      newTechHits++
      if (newTechHits <= 3) evidence.push(`新技术偏好: "${row.subject} → ${row.value}"`)
    }

    const pv = countMatches(row.subject, row.value, PRIVACY_KW)
    if (pv > 0) {
      privacyScore += row.confidence * pv
      privacyHits++
      if (privacyHits <= 3) evidence.push(`隐私重视: "${row.subject} → ${row.value}"`)
    }

    const sp = countMatches(row.subject, row.value, SIMPLICITY_KW)
    if (sp > 0) {
      simplicityScore += row.confidence * sp
      simplicityHits++
      if (simplicityHits <= 3) evidence.push(`极简偏好: "${row.subject} → ${row.value}"`)
    }
  }

  // 归一化到 0-1
  const norm = (score: number, hits: number, maxExpected: number): number => {
    if (hits === 0) return 0.3 // 默认中性偏低
    const raw = Math.min(score / maxExpected, 1)
    // 基于命中次数的置信度调整
    const hitConfidence = Math.min(hits / 3, 1)
    return Math.round((raw * 0.7 + hitConfidence * 0.3) * 100) / 100
  }

  // early_adopter 基于 newTech + 技术栈变更频率
  let earlyAdopterScore = 0
  if (newTechHits > 0) {
    const techStackRows = rows.filter((r) =>
      r.subject.toLowerCase().includes('技术栈') || r.subject.toLowerCase().includes('tech')
    )
    earlyAdopterScore = Math.min(newTechHits / 10 + techStackRows.length / 5, 1)
  }

  return {
    prefers_open_source: norm(openSourceScore, openSourceHits, 3),
    cost_sensitive: norm(costScore, costHits, 2),
    likes_new_tech: norm(newTechScore, newTechHits, 3),
    values_privacy: norm(privacyScore, privacyHits, 3),
    early_adopter: Math.round(earlyAdopterScore * 100) / 100,
    prefers_simplicity: norm(simplicityScore, simplicityHits, 2),
    evidence
  }
}