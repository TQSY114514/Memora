import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  scanKnowledgeGaps,
  getReviewQueue,
  getMemoryAgentStatus,
  startMemoryAgent,
  stopMemoryAgent
} from '../../../memoryAgent'
import {
  getAutoConsolidationStatus,
  runAutoConsolidation
} from '../../memoryConsolidationScheduler'

export function registerMemoryAgentHandlers(): void {
  safeHandle(IPC.MEMORY_AGENT_SCAN, (_e, workspaceId?: string) => {
    return scanKnowledgeGaps(workspaceId)
  })

  safeHandle(IPC.MEMORY_AGENT_REVIEW_QUEUE, (_e, workspaceId?: string) => {
    return getReviewQueue(workspaceId)
  })

  safeHandle(IPC.MEMORY_AGENT_STATUS, () => {
    return getMemoryAgentStatus()
  })

  safeHandle(IPC.MEMORY_AGENT_START, (_e, intervalMinutes?: number) => {
    return startMemoryAgent(intervalMinutes)
  })

  safeHandle(IPC.MEMORY_AGENT_STOP, () => {
    return stopMemoryAgent()
  })

  // 自动记忆合并（v1.15 P2-3）：查询最近合并状态
  safeHandle(IPC.CONSOLIDATION_STATUS, () => {
    return getAutoConsolidationStatus()
  })

  // 自动记忆合并（v1.15 P2-3）：手动触发一次
  safeHandle(IPC.CONSOLIDATION_RUN, async () => {
    return runAutoConsolidation()
  })
}