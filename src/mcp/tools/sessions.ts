/**
 * MCP 工具域 —— sessions（会话）
 *
 * 处理会话相关工具：search_sessions / get_session / list_sessions /
 * get_session_summary / add_session / add_message / update_session /
 * delete_session / export_session / summarize_session。
 */

import { listSessions, getSession, createSession, updateSession, deleteSession } from '../../database/repositories/sessionRepo'
import { indexSessionForSearch } from '../../search/indexer'
import { getSummary } from '../../database/repositories/summaryRepo'
import { getDatabase } from '../../database/connection'
import { generateSummary } from '../../ai/summarizer'
import { search } from '../../search/query'
import { v4 as uuidv4 } from 'uuid'
import { loadAiConfigForTool } from './shared'

export async function handleSessionsTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'search_sessions': {
      const query = String(args.query ?? '')
      const limit = Number(args.limit ?? 10)
      if (!query) throw new Error('query 不能为空')
      const results = search(query, { limit })
      return results.map((r) => ({
        sessionId: r.session.id,
        title: r.session.title,
        provider: r.session.provider,
        snippets: r.snippets.map((s) => s.snippet),
        rank: r.rank
      }))
    }

    case 'get_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const session = getSession(sessionId, true)
      if (!session) throw new Error('对话不存在')
      return {
        id: session.id,
        title: session.title,
        provider: session.provider,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages?.length ?? 0,
        messages: (session.messages ?? []).map((m) => ({
          role: m.role,
          content: m.content,
          model: m.model,
          createdAt: m.createdAt
        }))
      }
    }

    case 'list_sessions': {
      const folderId = args.folderId ? String(args.folderId) : undefined
      const limit = Number(args.limit ?? 20)
      const offset = Number(args.offset ?? 0)
      const sessions = listSessions({ folderId })
        .slice(offset, offset + limit)
        .map((s) => ({
          id: s.id,
          title: s.title,
          provider: s.provider,
          model: s.model,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
          isFavorite: s.isFavorite,
          tags: s.tags.map((t) => t.name)
        }))
      return { sessions, count: sessions.length }
    }

    case 'get_session_summary': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      return getSummary(sessionId)
    }

    case 'add_session': {
      const title = String(args.title ?? '')
      const provider = String(args.provider ?? 'Unknown')
      if (!title) throw new Error('title 不能为空')
      const folderId = args.folderId ? String(args.folderId) : undefined
      const rawMessages = (args.messages ?? []) as Array<Record<string, unknown>>
      const messages = rawMessages.map((m, idx) => ({
        id: uuidv4(),
        sessionId: '',
        role: String(m.role ?? 'user') as any,
        content: String(m.content ?? ''),
        model: m.model ? String(m.model) : undefined,
        order: idx,
        createdAt: m.createdAt ? String(m.createdAt) : new Date().toISOString()
      }))
      const session = createSession({
        provider: provider as any,
        title,
        folderId,
        isFavorite: false,
        messageCount: messages.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: []
      }, messages)
      return { sessionId: session.id, title: session.title }
    }

    case 'add_message': {
      const sessionId = String(args.sessionId ?? '')
      const role = String(args.role ?? 'user')
      const content = String(args.content ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      if (!content) throw new Error('content 不能为空')
      const session = getSession(sessionId, false)
      if (!session) throw new Error('对话不存在')
      const db = getDatabase()
      const msgId = uuidv4()
      const now = new Date().toISOString()
      // 用 MAX(msg_order)+1 而非 COUNT(*)，避免删除消息后序号重复
      const order = (db.prepare('SELECT COALESCE(MAX(msg_order), -1) + 1 as n FROM messages WHERE session_id = ?').get(sessionId) as { n: number }).n

      const tx = db.transaction(() => {
        db.prepare(
          'INSERT INTO messages (id, session_id, role, content, model, tokens, msg_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(msgId, sessionId, role, content, args.model ? String(args.model) : null, null, order, now)
        db.prepare('UPDATE chat_sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?').run(now, sessionId)
      })
      tx()
      // 更新 FTS 索引（事务外，与 createSession 保持一致：FTS 失败不应阻塞消息写入）
      try {
        indexSessionForSearch(sessionId, session.title, [{ content }], session.provider)
      } catch (e) {
        console.warn('[MCP] add_message: 重建 FTS 索引失败（不影响消息写入）:', e)
      }
      return { messageId: msgId, sessionId, order }
    }

    case 'update_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = String(args.title)
      if (args.description !== undefined) patch.description = String(args.description)
      if (args.folderId !== undefined) patch.folderId = args.folderId === '' ? null : String(args.folderId)
      if (args.isFavorite !== undefined) patch.isFavorite = Boolean(args.isFavorite)
      updateSession(sessionId, patch as any)
      const updated = getSession(sessionId, false)
      return { sessionId, updated: !!updated }
    }

    case 'delete_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const session = getSession(sessionId, false)
      if (!session) throw new Error('对话不存在')
      deleteSession(sessionId)
      return { sessionId, deleted: true }
    }

    case 'export_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const format = String(args.format ?? 'markdown')
      const session = getSession(sessionId, true)
      if (!session) throw new Error('对话不存在')
      const messages = session.messages || []
      // html 导出不受支持，使用 markdown 导出
      if (format !== 'markdown') {
        // 只支持 markdown 格式
      }
      let md = `# ${session.title}\n\n`
      md += `> 来源: ${session.provider} | ${new Date(session.createdAt).toLocaleString('zh-CN')}\n\n`
      md += `---\n\n`
      for (const m of messages) {
        const role = m.role === 'user' ? '**👤 用户**' : m.role === 'assistant' ? '**🤖 AI**' : `**${m.role}**`
        md += `${role}:\n\n${m.content}\n\n---\n\n`
      }
      md += `*导出时间: ${new Date().toLocaleString('zh-CN')}*\n`
      return { format: 'markdown', content: md, sessionId, title: session.title }
    }

    case 'summarize_session': {
      const sessionId = String(args.sessionId ?? '')
      if (!sessionId) throw new Error('sessionId 不能为空')
      const config = loadAiConfigForTool({
        missingConfigMessage: '未配置 AI 供应商。请在 Memora UI 的「设置 → AI 配置」中配置供应商后再使用 summarize_session。',
        missingKeyMessage: 'API Key 未在加密存储中找到'
      })
      const summary = await generateSummary(sessionId, config)
      return {
        sessionId,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        todos: summary.todos,
        knowledge: summary.knowledge,
        suggestedTags: summary.suggestedTags,
        model: summary.model
      }
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}
