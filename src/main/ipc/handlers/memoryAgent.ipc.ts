import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  scanKnowledgeGaps,
  getReviewQueue,
  getMemoryAgentStatus,
  startMemoryAgent,
  stopMemoryAgent
} from '../../../memoryAgent'

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
}