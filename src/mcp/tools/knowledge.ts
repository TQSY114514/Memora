/**
 * MCP 工具域 —— knowledge（知识库）
 *
 * 处理知识库相关工具：knowledge_search / decision_search / project_context /
 * knowledge_entry_update / knowledge_entry_delete。
 */

import {
  searchEntries,
  listEntries,
  countEntries,
  updateEntry,
  deleteEntry
} from '../../database/repositories/knowledgeRepo'

export async function handleKnowledgeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'knowledge_search': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 10)
      const type = args.type ? (String(args.type) as 'knowledge' | 'decision' | 'task') : undefined
      const results = searchEntries(query, { type, limit })
      return results.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        content: e.content,
        status: e.status,
        source: e.source,
        sessionId: e.sessionId,
        createdAt: e.createdAt
      }))
    }

    case 'decision_search': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 10)
      const results = searchEntries(query, { type: 'decision', limit })
      return results.map((e) => ({
        id: e.id,
        title: e.title,
        content: e.content,
        status: e.status,
        sessionId: e.sessionId,
        createdAt: e.createdAt
      }))
    }

    case 'project_context': {
      const workspaceId = String(args.workspaceId ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')

      const counts = countEntries(workspaceId)
      const decisions = listEntries({ workspaceId, type: 'decision', limit: 20 })
      const openTasks = listEntries({ workspaceId, type: 'task', status: 'open', limit: 30 })
      const knowledge = listEntries({ workspaceId, type: 'knowledge', limit: 20 })

      return {
        workspaceId,
        summary: {
          totalEntries: counts.total,
          decisions: counts.decision,
          openTasks: counts.openTask,
          knowledge: counts.knowledge
        },
        recentDecisions: decisions.map((e) => ({ id: e.id, title: e.title, content: e.content, status: e.status, sessionId: e.sessionId, createdAt: e.createdAt })),
        openTasks: openTasks.map((e) => ({ id: e.id, title: e.title, content: e.content, sessionId: e.sessionId, createdAt: e.createdAt })),
        coreKnowledge: knowledge.map((e) => ({ id: e.id, title: e.title, content: e.content, sessionId: e.sessionId, createdAt: e.createdAt }))
      }
    }

    case 'knowledge_entry_update': {
      const entryId = String(args.entryId ?? '')
      if (!entryId) throw new Error('entryId 不能为空')
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = String(args.title)
      if (args.content !== undefined) patch.content = String(args.content)
      if (args.type !== undefined) patch.type = String(args.type)
      if (args.status !== undefined) patch.status = String(args.status)
      const updated = updateEntry(entryId, patch as any)
      if (!updated) throw new Error('知识条目不存在')
      return { entryId, updated: true }
    }

    case 'knowledge_entry_delete': {
      const entryId = String(args.entryId ?? '')
      if (!entryId) throw new Error('entryId 不能为空')
      deleteEntry(entryId)
      return { entryId, deleted: true }
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}
