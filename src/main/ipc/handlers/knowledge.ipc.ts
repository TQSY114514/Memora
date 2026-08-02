import { safeHandle, assertSafeId } from '../safeHandle'
import { IPC } from '@shared/constants'
import { getDatabase } from '@db/connection'
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
import { getSummary } from '@db/repositories'
import type { KnowledgeType, KnowledgeRelation } from '@shared/types'

/** 查 session 所属 workspaceId（经 folder） */
function getWorkspaceIdBySession(sessionId: string): string | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT f.workspace_id as wid
       FROM chat_sessions cs
       LEFT JOIN folders f ON cs.folder_id = f.id
       WHERE cs.id = ?`
    )
    .get(sessionId) as { wid: string | null } | undefined
  return row?.wid ?? null
}

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
   * 从对话总结提炼为 knowledge_entries
   * - keyPoints → decision
   * - todos → task (open)
   * - knowledge → knowledge
   * 幂等：同 session + title + type 不重复插入
   */
  safeHandle(IPC.KNOWLEDGE_EXTRACT_FROM_SESSION, (_e, sessionId: string) => {
    assertSafeId(sessionId, 'sessionId')
    const workspaceId = getWorkspaceIdBySession(sessionId)
    if (!workspaceId) {
      throw new Error('该对话未归属任何工作区文件夹，无法提炼知识条目')
    }
    const summary = getSummary(sessionId)
    if (!summary) {
      throw new Error('该对话尚未生成 AI 蒸馏，请先点击「记忆蒸馏」')
    }

    const db = getDatabase()
    const now = new Date().toISOString()
    const created: string[] = []

    const insert = (type: KnowledgeType, items: string[], idPrefix: string) => {
      items.forEach((item, idx) => {
        const title = item.slice(0, 120)
        const exists = db
          .prepare('SELECT 1 FROM knowledge_entries WHERE session_id = ? AND title = ? AND type = ?')
          .get(sessionId, title, type)
        if (exists) return
        const id = `${sessionId}-${idPrefix}-${idx}-${Date.now()}`
        db.prepare(
          `INSERT INTO knowledge_entries
           (id, workspace_id, session_id, type, title, content, status, source, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ai-extract', ?, ?, ?)`
        ).run(
          id,
          workspaceId,
          sessionId,
          type,
          title,
          item,
          type === 'task' ? 'open' : 'active',
          idx,
          now,
          now
        )
        created.push(id)
      })
    }

    const tx = db.transaction(() => {
      insert('decision', summary.keyPoints, 'dec')
      insert('task', summary.todos, 'task')
      if (summary.knowledge) insert('knowledge', summary.knowledge, 'kn')
    })
    tx()

    return { created: created.length, workspaceId }
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
