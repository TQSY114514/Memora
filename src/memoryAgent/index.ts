/**
 * 记忆智能体（Memory Agent）
 *
 * 定期扫描知识库，主动发现：
 * 1. 知识缺口：存在关联但尚未记录的知识点
 * 2. 待复习条目：基于间隔重复算法识别的需要复习的知识
 * 3. 摘要提醒：长时间未访问的对话建议总结
 */
import { listEntries, searchEntries, countEntries, getGraphData } from '../database/repositories/knowledgeRepo'
import { logger } from '../main/logger'

export interface KnowledgeGap {
  entryId: string
  entryTitle: string
  gapType: 'missing_connection' | 'stale_knowledge' | 'orphan_entry' | 'sparse_topic'
  description: string
  severity: 'low' | 'medium' | 'high'
  suggestion: string
}

export interface ReviewItem {
  entryId: string
  entryTitle: string
  entryType: string
  daysSinceLastReview: number
  priority: 'high' | 'medium' | 'low'
  reason: string
}

export interface MemoryAgentStatus {
  running: boolean
  intervalMinutes: number
  lastScanAt: string | null
  nextScanAt: string | null
  gapsFound: number
  reviewItems: number
}

const agentStatus: MemoryAgentStatus = {
  running: false,
  intervalMinutes: 60,
  lastScanAt: null,
  nextScanAt: null,
  gapsFound: 0,
  reviewItems: 0
}

let agentTimer: ReturnType<typeof setInterval> | null = null

/** 扫描知识缺口 */
export function scanKnowledgeGaps(workspaceId?: string): KnowledgeGap[] {
  const gaps: KnowledgeGap[] = []
  const now = new Date()

  try {
    // 获取所有知识条目
    const entries = listEntries(workspaceId ? { workspaceId, limit: 1000 } : { limit: 1000 })

    if (entries.length === 0) return gaps

    // 1. 检测孤立条目（没有关联关系）
    const orphanEntries = entries.filter((entry) => {
      const related = searchEntries(entry.title, { workspaceId: entry.workspaceId, limit: 3 })
      return related.length <= 1 // 只有自己
    })

    if (orphanEntries.length > 0) {
      for (const entry of orphanEntries.slice(0, 5)) {
        gaps.push({
          entryId: entry.id,
          entryTitle: entry.title,
          gapType: 'orphan_entry',
          description: `"${entry.title}" 没有与其他知识建立关联`,
          severity: 'low',
          suggestion: `考虑为 "${entry.title}" 添加相关知识点或建立关联关系`
        })
      }
    }

    // 2. 检测陈旧知识（超过 30 天未更新）
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const staleEntries = entries.filter((entry) => {
      const updated = new Date(entry.updatedAt)
      return updated < thirtyDaysAgo
    })

    if (staleEntries.length > 0) {
      for (const entry of staleEntries.slice(0, 5)) {
        const daysSinceUpdate = Math.floor((now.getTime() - new Date(entry.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
        gaps.push({
          entryId: entry.id,
          entryTitle: entry.title,
          gapType: 'stale_knowledge',
          description: `"${entry.title}" 已 ${daysSinceUpdate} 天未更新，可能需要重新审视`,
          severity: daysSinceUpdate > 60 ? 'high' : 'medium',
          suggestion: `检查 "${entry.title}" 是否仍然有效，或需要更新内容`
        })
      }
    }

    // 3. 检测知识稀疏的主题（任务过多但知识/决策太少）
    if (workspaceId) {
      const counts = countEntries(workspaceId)
      if (counts.total > 10) {
        const knowledgeRatio = counts.knowledge / counts.total
        const decisionRatio = counts.decision / counts.total

        if (knowledgeRatio < 0.3) {
          gaps.push({
            entryId: '',
            entryTitle: '工作区整体',
            gapType: 'sparse_topic',
            description: `知识类条目占比仅 ${Math.round(knowledgeRatio * 100)}%，建议从对话中提炼更多知识`,
            severity: 'medium',
            suggestion: '对已有对话执行「记忆蒸馏」，提取可复用的知识点'
          })
        }

        if (decisionRatio < 0.1 && counts.total > 20) {
          gaps.push({
            entryId: '',
            entryTitle: '工作区整体',
            gapType: 'sparse_topic',
            description: `决策类条目占比仅 ${Math.round(decisionRatio * 100)}%，建议记录重要的技术决策`,
            severity: 'low',
            suggestion: '回顾关键技术决策，创建决策条目记录选型理由'
          })
        }
      }
    }

    // 4. 检测缺失关联（同类型知识之间没有显式关系）
    try {
      const graphData = workspaceId ? getGraphData(workspaceId) : null
      if (graphData && graphData.nodes.length > 5) {
        const explicitEdges = graphData.edges.filter((e) => !e.implicit)
        if (explicitEdges.length < graphData.nodes.length * 0.3) {
          gaps.push({
            entryId: '',
            entryTitle: '知识图谱',
            gapType: 'missing_connection',
            description: `知识图谱中显式关系较少（${explicitEdges.length} 条边，${graphData.nodes.length} 个节点），建议建立更多关联`,
            severity: 'medium',
            suggestion: '在知识图谱中手动为相关条目建立关联关系'
          })
        }
      }
    } catch {
      // 图谱获取失败，忽略
    }
  } catch (e) {
    logger.error('[memoryAgent] scanKnowledgeGaps error:', e as Record<string, unknown>)
  }

  agentStatus.gapsFound = gaps.length
  agentStatus.lastScanAt = new Date().toISOString()
  return gaps
}

/** 获取待复习队列（间隔重复） */
export function getReviewQueue(workspaceId?: string): ReviewItem[] {
  const items: ReviewItem[] = []
  const now = new Date()

  try {
    const entries = listEntries(workspaceId ? { workspaceId, limit: 200 } : { limit: 200 })

    for (const entry of entries) {
      const daysSinceUpdate = Math.floor((now.getTime() - new Date(entry.updatedAt).getTime()) / (1000 * 60 * 60 * 24))

      // 间隔重复逻辑：
      // - 1天内更新：不需要复习
      // - 1-7天：低优先级
      // - 7-30天：中优先级
      // - 30+天：高优先级
      let priority: ReviewItem['priority'] = 'low'
      let reason = ''

      if (daysSinceUpdate <= 1) continue

      if (daysSinceUpdate > 30) {
        priority = 'high'
        reason = `超过 30 天未复习，建议回顾`
      } else if (daysSinceUpdate > 7) {
        priority = 'medium'
        reason = `已 ${daysSinceUpdate} 天未复习`
      } else {
        priority = 'low'
        reason = `近期更新，可轻量复习`
      }

      // 任务类型特殊处理
      if (entry.type === 'task' && entry.status === 'open') {
        if (daysSinceUpdate > 7) {
          priority = 'high'
          reason = `待办任务已 ${daysSinceUpdate} 天未更新`
        }
      }

      items.push({
        entryId: entry.id,
        entryTitle: entry.title,
        entryType: entry.type,
        daysSinceLastReview: daysSinceUpdate,
        priority,
        reason
      })
    }

    // 按优先级排序
    items.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  } catch (e) {
    logger.error('[memoryAgent] getReviewQueue error:', e as Record<string, unknown>)
  }

  agentStatus.reviewItems = items.length
  return items.slice(0, 50) // 最多返回 50 条
}

/** 获取记忆智能体状态 */
export function getMemoryAgentStatus(): MemoryAgentStatus {
  return { ...agentStatus }
}

/** 启动记忆智能体定期扫描 */
export function startMemoryAgent(intervalMinutes?: number): MemoryAgentStatus {
  if (agentTimer) {
    clearInterval(agentTimer)
  }

  const interval = intervalMinutes ?? 60
  agentStatus.intervalMinutes = interval
  agentStatus.running = true
  agentStatus.nextScanAt = new Date(Date.now() + interval * 60 * 1000).toISOString()

  agentTimer = setInterval(() => {
    logger.info('[memoryAgent] periodic scan starting')
    scanKnowledgeGaps()
    getReviewQueue()
    agentStatus.nextScanAt = new Date(Date.now() + interval * 60 * 1000).toISOString()
    logger.info(`[memoryAgent] scan complete, gaps: ${agentStatus.gapsFound}, review: ${agentStatus.reviewItems}`)
  }, interval * 60 * 1000)

  logger.info(`[memoryAgent] started with interval ${interval} minutes`)
  return { ...agentStatus }
}

/** 停止记忆智能体 */
export function stopMemoryAgent(): MemoryAgentStatus {
  if (agentTimer) {
    clearInterval(agentTimer)
    agentTimer = null
  }
  agentStatus.running = false
  agentStatus.nextScanAt = null
  logger.info('[memoryAgent] stopped')
  return { ...agentStatus }
}