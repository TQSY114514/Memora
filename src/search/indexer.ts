import { getDatabase } from '../database/connection'
import { segment } from './segmenter'

/**
 * FTS5 索引器
 * 每条消息作为一行写入 chat_fts，便于按消息级别返回高亮片段
 * title 字段在每行重复（用于 title 匹配时检索到消息）
 *
 * 中文分词：写入前对 title/content 用 Intl.Segmenter 分词（空格分隔），
 * 这样 unicode61 tokenizer 按空格切分就能正确命中中文词组。
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
  messages: Array<{ content: string }>,
  provider?: string
): void {
  const db = getDatabase()
  // 中文分词预处理：让 FTS5 能正确命中中文词组
  const segmentedTitle = segment(title)

  // DELETE + INSERT 并入同一事务，消除崩溃导致的索引丢失窗口
  const delStmt = db.prepare('DELETE FROM chat_fts WHERE session_id = ?')
  const insStmt = db.prepare(
    'INSERT INTO chat_fts (session_id, title, content, provider) VALUES (?, ?, ?, ?)'
  )

  const rows: FtsRow[] = messages.length === 0
    ? [{ session_id: sessionId, title: segmentedTitle, content: '', provider: provider ?? '' }]
    : messages.map((m) => ({
        session_id: sessionId,
        title: segmentedTitle,
        content: segment(m.content),
        provider: provider ?? ''
      }))

  const tx = db.transaction(() => {
    delStmt.run(sessionId)
    for (const row of rows) {
      insStmt.run(row.session_id, row.title, row.content, row.provider)
    }
  })
  tx()
}

/** 删除会话的 FTS 索引 */
export function unindexSession(sessionId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM chat_fts WHERE session_id = ?').run(sessionId)
}
