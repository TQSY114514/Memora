/**
 * Memory Blocks IPC handlers（v1.15 行动项 2）
 * 结构化记忆块：list / get / save / delete / history / rollback
 */
import { safeHandle, assertSafeId } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  listBlocks,
  getBlock,
  saveBlock,
  deleteBlock,
  listBlockHistory,
  rollbackBlock
} from '@db/repositories'

export function registerMemoryBlocksHandlers(): void {
  safeHandle(IPC.MEMORY_BLOCKS_LIST, (_e, workspaceId?: string) => {
    return listBlocks(workspaceId)
  })

  safeHandle(IPC.MEMORY_BLOCKS_GET, (_e, id: string) => {
    return getBlock(assertSafeId(id))
  })

  safeHandle(IPC.MEMORY_BLOCKS_SAVE, (_e, input: Parameters<typeof saveBlock>[0]) => {
    return saveBlock(input)
  })

  safeHandle(IPC.MEMORY_BLOCKS_DELETE, (_e, id: string, changedBy?: string) => {
    deleteBlock(assertSafeId(id), changedBy)
  })

  safeHandle(IPC.MEMORY_BLOCKS_HISTORY, (_e, blockId: string, limit?: number) => {
    return listBlockHistory(assertSafeId(blockId), limit)
  })

  safeHandle(IPC.MEMORY_BLOCKS_ROLLBACK, (_e, blockId: string, historyId: string, changedBy?: string) => {
    return rollbackBlock(assertSafeId(blockId), assertSafeId(historyId), changedBy)
  })
}