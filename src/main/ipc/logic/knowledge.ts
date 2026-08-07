import { getDatabase } from '@db/connection'
import { getSummary } from '@db/repositories'
import type { KnowledgeType } from '@shared/types'

/** 查 session 所属 workspaceId（经 folder） */
export function getWorkspaceIdBySession(sessionId: string): string | null {
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

/**
 * 从对话总结提炼为 knowledge_entries
 * - keyPoints → decision
 * - todos → task (open)
 * - knowledge → knowledge
 * 幂等：同 session + title + type 不重复插入
 */
export function extractFromSession(sessionId: string): { created: number; workspaceId: string } {
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
}