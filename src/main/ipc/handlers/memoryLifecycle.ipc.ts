import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  getTieredMemories,
  getMemoryHealth,
  generateProfileSummary,
  runMemoryLifecycle
} from '../../memoryLifecycle'

export function registerMemoryLifecycleHandlers(): void {
  safeHandle(IPC.MEMORY_TIERED, (_e, workspaceId?: string) => {
    return getTieredMemories(workspaceId)
  })

  safeHandle(IPC.MEMORY_HEALTH, (_e, workspaceId?: string) => {
    return getMemoryHealth(workspaceId)
  })

  safeHandle(IPC.MEMORY_PROFILE_SUMMARY, (_e, workspaceId: string) => {
    return generateProfileSummary(workspaceId)
  })

  safeHandle(IPC.MEMORY_LIFECYCLE_RUN, (_e, workspaceId?: string) => {
    return runMemoryLifecycle(workspaceId)
  })
}