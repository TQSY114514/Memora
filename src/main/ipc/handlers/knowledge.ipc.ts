import { safeHandle, assertSafeId } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  createEntry,
  getEntry,
  listEntries,
  updateEntry,
  deleteEntry,
  toggleTask,
  searchEntries,
  countEntries,
  findRelatedEntries,
  addRelation,
  removeRelation,
  listRelations,
  getGraphData
} from '@db/repositories'
import { extractFromSession } from '../logic/knowledge'
import type { KnowledgeRelation } from '@shared/types'

export function registerKnowledgeHandlers(): void {
  safeHandle(IPC.KNOWLEDGE_LIST, (_e, options?: Parameters<typeof listEntries>[0]) => {
    return listEntries(options)
  })

  safeHandle(IPC.KNOWLEDGE_GET, (_e, id: string) => {
    return getEntry(assertSafeId(id))
  })

  safeHandle(IPC.KNOWLEDGE_CREATE, (_e, input: Parameters<typeof createEntry>[0]) => {
    return createEntry(input)
  })

  safeHandle(IPC.KNOWLEDGE_UPDATE, (_e, id: string, patch: Parameters<typeof updateEntry>[1]) => {
    return updateEntry(assertSafeId(id), patch)
  })

  safeHandle(IPC.KNOWLEDGE_DELETE, (_e, id: string) => {
    deleteEntry(assertSafeId(id))
  })

  safeHandle(IPC.KNOWLEDGE_TOGGLE_TASK, (_e, id: string) => {
    return toggleTask(assertSafeId(id))
  })

  safeHandle(IPC.KNOWLEDGE_SEARCH, (_e, query: string, options?: Parameters<typeof searchEntries>[1]) => {
    return searchEntries(query, options)
  })

  safeHandle(IPC.KNOWLEDGE_COUNT, (_e, workspaceId: string) => {
    return countEntries(workspaceId)
  })

  safeHandle(IPC.KNOWLEDGE_RELATED, (_e, entryId: string) => {
    return findRelatedEntries(assertSafeId(entryId, 'entryId'))
  })

  /**
   * 从对话总结提炼为 knowledge_entries（逻辑见 logic/knowledge.ts，本处仅做参数校验 + 转发）
   */
  safeHandle(IPC.KNOWLEDGE_EXTRACT_FROM_SESSION, (_e, sessionId: string) => {
    return extractFromSession(assertSafeId(sessionId, 'sessionId'))
  })

  // ===== 关系（Memory Graph） =====
  safeHandle(
    IPC.KNOWLEDGE_RELATION_ADD,
    (_e, fromId: string, toId: string, relation: KnowledgeRelation) => {
      addRelation(assertSafeId(fromId, 'fromId'), assertSafeId(toId, 'toId'), relation)
    }
  )

  safeHandle(
    IPC.KNOWLEDGE_RELATION_REMOVE,
    (_e, fromId: string, toId: string, relation: KnowledgeRelation) => {
      removeRelation(assertSafeId(fromId, 'fromId'), assertSafeId(toId, 'toId'), relation)
    }
  )

  safeHandle(IPC.KNOWLEDGE_RELATION_LIST, (_e, entryId: string) => {
    return listRelations(assertSafeId(entryId, 'entryId'))
  })

  // ===== 知识图谱（Memory Graph 可视化数据） =====
  safeHandle(IPC.KNOWLEDGE_GRAPH_DATA, (_e, workspaceId: string) => {
    return getGraphData(workspaceId)
  })
}
