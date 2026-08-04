/**
 * Memory Consolidation —— 记忆合并去重
 *
 * 扫描相似偏好，自动合并重复/相似记忆，
 * 被合并的旧条目标记为 superseded，新条目 confidence 加权平均。
 */

import { getDatabase } from '../database/connection'
import { logger } from '../main/logger'

export interface ConsolidationCandidate {
  /** 合并后的主题 */
  subject: string
  /** 合并后的值 */
  value: string
  /** 合并后的置信度 */
  confidence: number
  /** 被合并的条目 ID 列表 */
  mergedIds: string[]
  /** 合并理由 */
  reason: string
}

export interface ConsolidationResult {
  candidates: ConsolidationCandidate[]
  totalMerged: number
  summary: string
}

/**
 * 扫描可合并的偏好
 *
 * 策略：
 * 1. 同 subject 的多个 active 条目 → 保留最高 confidence，其余标记 superseded
 * 2. 语义相似的 subject（如 "喜欢 Python" 和 "Python 是主要语言"）→ 合并
 * 3. 同 value 不同 subject 的条目 → 合并 subject
 */
export function scanConsolidationCandidates(workspaceId?: string): ConsolidationResult {
  const db = getDatabase()
  const candidates: ConsolidationCandidate[] = []

  try {
    interface PrefRow {
      id: string
      subject: string
      value: string
      confidence: number
      status: string
    }

    let rows: PrefRow[]
    if (workspaceId) {
      rows = db
        .prepare(
          `SELECT id, subject, value, confidence, status FROM preferences
           WHERE workspace_id = ? AND status = 'active'
           ORDER BY subject, confidence DESC`
        )
        .all(workspaceId) as PrefRow[]
    } else {
      rows = db
        .prepare(
          `SELECT id, subject, value, confidence, status FROM preferences
           WHERE status = 'active'
           ORDER BY subject, confidence DESC`
        )
        .all() as PrefRow[]
    }

    if (rows.length === 0) {
      return { candidates: [], totalMerged: 0, summary: '无可合并的偏好' }
    }

    // 策略 1：同 subject 去重
    const bySubject = new Map<string, PrefRow[]>()
    for (const row of rows) {
      const key = row.subject.toLowerCase().trim()
      const list = bySubject.get(key) || []
      list.push(row)
      bySubject.set(key, list)
    }

    for (const [, items] of bySubject) {
      if (items.length <= 1) continue

      const top = items[0]
      const rest = items.slice(1)
      const avgConfidence = items.reduce((sum, r) => sum + r.confidence, 0) / items.length

      candidates.push({
        subject: top.subject,
        value: top.value,
        confidence: Math.round(avgConfidence * 100) / 100,
        mergedIds: rest.map((r) => r.id),
        reason: `同主题 "${top.subject}" 有 ${items.length} 条重复偏好，合并为一条（置信度 ${(avgConfidence * 100).toFixed(0)}%）`
      })
    }

    // 策略 2：语义相似检测
    const similarityGroups = findSimilarSubjects(rows)
    for (const group of similarityGroups) {
      if (group.length <= 1) continue

      const top = group[0]
      const rest = group.slice(1)
      const avgConfidence = group.reduce((sum, r) => sum + r.confidence, 0) / group.length

      candidates.push({
        subject: top.subject,
        value: top.value,
        confidence: Math.round(avgConfidence * 100) / 100,
        mergedIds: rest.map((r) => r.id),
        reason: `语义相似: "${group.map((r) => r.subject).join('", "')}" 表达同一含义，合并为 "${top.subject}"`
      })
    }
  } catch (e) {
    logger.error('[memoryConsolidation] scanConsolidationCandidates error:', e as Record<string, unknown>)
  }

  const totalMerged = candidates.reduce((sum, c) => sum + c.mergedIds.length, 0)

  return {
    candidates,
    totalMerged,
    summary: totalMerged > 0
      ? `发现 ${candidates.length} 组可合并偏好，共 ${totalMerged} 条可被合并`
      : '未发现可合并的偏好'
  }
}

/**
 * 执行合并操作
 */
export function executeConsolidation(
  workspaceId: string,
  candidates: ConsolidationCandidate[]
): { merged: number; errors: string[] } {
  const db = getDatabase()
  const errors: string[] = []
  let merged = 0

  const updateStmt = db.prepare(
    `UPDATE preferences SET status = 'superseded', updated_at = ?
     WHERE id = ? AND workspace_id = ?`
  )

  const now = new Date().toISOString()

  try {
    const transaction = db.transaction(() => {
      for (const candidate of candidates) {
        for (const id of candidate.mergedIds) {
          try {
            updateStmt.run(now, id, workspaceId)
            merged++
          } catch (e) {
            errors.push(`合并 ${id} 失败: ${String(e)}`)
          }
        }
      }
    })

    transaction()
  } catch (e) {
    errors.push(`事务失败: ${String(e)}`)
  }

  logger.info(`[memoryConsolidation] merged ${merged} preferences, ${errors.length} errors`)
  return { merged, errors }
}

/**
 * 查找语义相似的 subject 对（跨类别，不限于技术栈）
 *
 * 对每条偏好做 subject+value 拼接，用 Jaccard 相似度（token 集合交并比）判断是否语义相近。
 * 相似度 >= 阈值（默认 0.6）的条目聚为一组，作为可合并候选。
 * 使用贪心聚类：按 confidence 降序，优先把高置信度条目作为组代表。
 */
function findSimilarSubjects(
  rows: Array<{ id: string; subject: string; value: string; confidence: number }>
): Array<Array<typeof rows[0]>> {
  const groups: Array<Array<typeof rows[0]>> = []
  const used = new Set<string>()

  // 按 confidence 降序排序，保证组代表优先取高置信度条目
  const sorted = [...rows].sort((a, b) => b.confidence - a.confidence)

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].id)) continue
    const group: typeof rows = [sorted[i]]
    used.add(sorted[i].id)

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].id)) continue
      const sim = textSimilarity(
        `${sorted[i].subject} ${sorted[i].value}`,
        `${sorted[j].subject} ${sorted[j].value}`
      )
      if (sim >= 0.6) {
        group.push(sorted[j])
        used.add(sorted[j].id)
      }
    }

    if (group.length > 1) {
      groups.push(group)
    }
  }

  return groups
}

/**
 * 基于 token 的相似度（overlap coefficient，更适合短语/转述检测）
 *
 * 用 Jaccard 与 overlap 的加权组合：
 * - overlap = |A∩B| / min(|A|,|B|)：衡量"一个是否包含另一个的大部分"，对转述/相似短语敏感
 * - 最终取两者均值，兼顾纯度与召回
 */
function textSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  const union = tokensA.size + tokensB.size - intersection
  const jaccard = union === 0 ? 0 : intersection / union
  const overlap = Math.min(tokensA.size, tokensB.size) === 0
    ? 0
    : intersection / Math.min(tokensA.size, tokensB.size)
  return (jaccard + overlap) / 2
}

/** 提取 token：英文按词切分 + 中文按单字切分 */
function tokenize(text: string): Set<string> {
  const lower = text.toLowerCase()
  const tokens = new Set<string>()
  // 英文词 / 数字
  for (const m of lower.match(/[a-z0-9]+/g) ?? []) tokens.add(m)
  // 中文单字
  for (const ch of lower) {
    if (/[\u4e00-\u9fa5]/.test(ch)) tokens.add(ch)
  }
  return tokens
}