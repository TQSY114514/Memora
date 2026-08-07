/**
 * 自动记忆合并定时任务（v1.15 P2-3）
 *
 * 每周后台扫描所有工作区的偏好，自动执行记忆合并去重：
 * - 复用 memoryAgent/consolidation 的扫描 + 执行算法
 * - 记录最近合并结果，供 UI 展示「最近合并」提示
 * - 合并前先扫描候选，无候选时跳过执行（避免无意义写库）
 */
import { listWorkspaces } from '../database/repositories/workspaceRepo'
import { scanConsolidationCandidates, executeConsolidation } from '../memoryAgent/consolidation'
import { logger } from './logger'
import type { AutoConsolidationStatus } from '@shared/types'

const status: AutoConsolidationStatus = {
  running: false,
  intervalMs: 7 * 24 * 60 * 60 * 1000, // 每周
  lastRunAt: null,
  nextRunAt: null,
  lastMerged: 0,
  lastWorkspaces: 0,
  lastSummary: null
}

let timer: ReturnType<typeof setInterval> | null = null

/** 执行一次自动合并：遍历所有工作区，扫描并合并可合并偏好 */
export async function runAutoConsolidation(): Promise<{
  merged: number
  workspaces: number
  summary: string
}> {
  try {
    const workspaces = listWorkspaces()
    if (workspaces.length === 0) {
      const summary = '无工作区，跳过自动合并'
      status.lastSummary = summary
      status.lastRunAt = new Date().toISOString()
      return { merged: 0, workspaces: 0, summary }
    }

    let totalMerged = 0
    for (const ws of workspaces) {
      try {
        const candidates = await scanConsolidationCandidates(ws.id)
        if (candidates.candidates.length === 0) continue
        const result = executeConsolidation(ws.id, candidates.candidates)
        totalMerged += result.merged
      } catch (e) {
        logger.warn(`[autoConsolidation] workspace ${ws.id} failed:`, { error: String(e) })
      }
    }

    status.lastMerged = totalMerged
    status.lastWorkspaces = workspaces.length
    const summary = totalMerged > 0
      ? `自动合并完成：${workspaces.length} 个工作区中共合并 ${totalMerged} 条重复/相似偏好`
      : `自动合并完成：${workspaces.length} 个工作区未发现可合并偏好`
    status.lastSummary = summary
    status.lastRunAt = new Date().toISOString()
    logger.info(`[autoConsolidation] ${summary}`)
    return { merged: totalMerged, workspaces: workspaces.length, summary }
  } catch (e) {
    logger.error('[autoConsolidation] runAutoConsolidation error:', e as Record<string, unknown>)
    status.lastSummary = '自动合并失败：' + String(e)
    status.lastRunAt = new Date().toISOString()
    return { merged: 0, workspaces: 0, summary: '自动合并失败' }
  }
}

/** 启动自动合并定时任务（每周一次） */
export function startAutoConsolidation(): AutoConsolidationStatus {
  if (timer) clearInterval(timer)
  status.running = true
  status.nextRunAt = new Date(Date.now() + status.intervalMs).toISOString()
  timer = setInterval(() => {
    runAutoConsolidation().then(() => {
      status.nextRunAt = new Date(Date.now() + status.intervalMs).toISOString()
    })
  }, status.intervalMs)
  logger.info('[autoConsolidation] started, interval ' + (status.intervalMs / (24 * 60 * 60 * 1000)) + ' days')
  return { ...status }
}

/** 停止自动合并定时任务 */
export function stopAutoConsolidation(): AutoConsolidationStatus {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  status.running = false
  status.nextRunAt = null
  return { ...status }
}

/** 获取自动合并状态（供 UI 展示最近合并） */
export function getAutoConsolidationStatus(): AutoConsolidationStatus {
  return { ...status }
}