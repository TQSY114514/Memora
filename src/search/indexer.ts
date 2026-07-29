import { getDatabase } from '../database/connection'
import type { Message } from '@shared/types'

/**
 * FTS5 索引器
 * 每条消息作为一行写入 chat_fts，便于按消息级别返回高亮片段
 * title 字段在每行重复（用于 title 匹配时检索到消息）
 */

interface FtsRow {
  session_id: string
  title: string
  content: string
  provider: string
}

/** 为会话建立 FTS 索引（每条消息一行） */
export function indexSessionForSearch(
  sessionId: string,
  title: string,
  messages: Message[],
  provider?: string
): void {
  const db = getDatabase()
  // 先删除旧索引（支持重新导入）
  unindexSession(sessionId)

  if (messages.length === 0) {
    // 无消息时仍索引 title
    db.prepare(
      'INSERT INTO chat_fts (session_id, title, content, provider) VALUES (?, ?, ?, ?)'
    ).run(sessionId, title, '', provider ?? '')
    return
  }

  const stmt = db.prepare(
    'INSERT INTO chat_fts (session_id, title, content, provider) VALUES (?, ?, ?, ?)'
  )
  const tx = db.transaction((rows: FtsRow[]) => {
    for (const row of rows) {
      stmt.run(row.session_id, row.title, row.content, row.provider)
    }
  })

  const rows: FtsRow[] = messages.map((m) => ({
    session_id: sessionId,
    title,
    content: m.content,
    provider: provider ?? ''
  }))

  tx(rows)
}

/** 删除会话的 FTS 索引 */
export function unindexSession(sessionId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM chat_fts WHERE session_id = ?').run(sessionId)
}
