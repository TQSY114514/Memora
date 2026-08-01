import { ipcMain, IpcMainInvokeEvent, dialog, app } from 'electron'
import { writeFileSync } from 'fs'
import { IPC } from '@shared/constants'
import { getDatabase } from '@db/connection'
import { getSession } from '@db/repositories'
import { backupService } from '../../backup'
import type { ChatSession, BackupConfig } from '@shared/types'

function safeHandle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      console.error(`[IPC] ${channel} failed:`, err)
      throw err  // Electron 会传给 renderer 的 reject
    }
  })
}

export function registerSystemHandlers(): void {
  // ===== 系统 =====
  safeHandle(IPC.APP_GET_DATA_DIR, () => app.getPath('userData'))

  safeHandle(
    IPC.DIALOG_OPEN_FILE,
    async (_e, options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }) => {
      const result = await dialog.showOpenDialog({
        properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: options?.filters ?? [
          { name: 'AI 对话文件', extensions: ['json', 'md', 'markdown', 'txt', 'html'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      return result.canceled ? null : result.filePaths
    }
  )

  safeHandle(
    IPC.DIALOG_SAVE_FILE,
    async (_e, options: { defaultName?: string; content: string }) => {
      const result = await dialog.showSaveDialog({
        defaultPath: options.defaultName || 'Memora-export.html',
        filters: [{ name: 'HTML 文件', extensions: ['html'] }]
      })
      if (result.canceled || !result.filePath) return null
      writeFileSync(result.filePath, options.content, 'utf-8')
      return result.filePath
    }
  )

  // ===== 数据库维护 =====
  safeHandle(IPC.DB_VACUUM, () => {
    const db = getDatabase()
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
    return { ok: true }
  })

  safeHandle(IPC.DB_CLEAN_ORPHANS, () => {
    const db = getDatabase()
    let cleaned = 0
    // 清理孤儿消息（session 不存在）
    const r1 = db.prepare('DELETE FROM messages WHERE session_id NOT IN (SELECT id FROM chat_sessions)').run()
    cleaned += r1.changes
    // 清理孤儿附件
    const r2 = db.prepare('DELETE FROM attachments WHERE message_id NOT IN (SELECT id FROM messages)').run()
    cleaned += r2.changes
    // 清理孤儿总结
    const r3 = db.prepare('DELETE FROM session_summaries WHERE session_id NOT IN (SELECT id FROM chat_sessions)').run()
    cleaned += r3.changes
    // 清理孤儿嵌入
    const r4 = db.prepare('DELETE FROM message_embeddings WHERE session_id NOT IN (SELECT id FROM chat_sessions)').run()
    cleaned += r4.changes
    // 清理孤儿 session_tags
    const r5 = db.prepare('DELETE FROM session_tags WHERE session_id NOT IN (SELECT id FROM chat_sessions)').run()
    cleaned += r5.changes
    // 清理 FTS 索引中已删除的会话
    try {
      db.exec("DELETE FROM chat_fts WHERE session_id NOT IN (SELECT id FROM chat_sessions)")
    } catch {
      // FTS 清理失败不阻塞
    }
    return { cleaned }
  })

  // ===== Dashboard 统计 =====
  safeHandle(IPC.STATS_GET, () => {
    const db = getDatabase()
    const sessionCount = (db.prepare('SELECT COUNT(*) as n FROM chat_sessions').get() as { n: number }).n
    const messageCount = (db.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }).n
    const indexedCount = (db.prepare('SELECT COUNT(DISTINCT session_id) as n FROM message_embeddings').get() as { n: number }).n
    const favoriteCount = (db.prepare('SELECT COUNT(*) as n FROM chat_sessions WHERE is_favorite = 1').get() as { n: number }).n
    const providerRows = db.prepare('SELECT provider, COUNT(*) as n FROM chat_sessions GROUP BY provider ORDER BY n DESC').all() as Array<{ provider: string; n: number }>
    const recentRows = db.prepare('SELECT id FROM chat_sessions ORDER BY updated_at DESC LIMIT 5').all() as Array<{ id: string }>
    const recentSessions = recentRows.map(r => getSession(r.id, false)).filter(Boolean) as ChatSession[]
    const preferenceCount = (db.prepare("SELECT COUNT(*) as n FROM preferences WHERE status = 'active'").get() as { n: number }).n
    const decisionCount = (db.prepare("SELECT COUNT(*) as n FROM knowledge_entries WHERE type = 'decision'").get() as { n: number }).n
    const taskCount = (db.prepare("SELECT COUNT(*) as n FROM knowledge_entries WHERE type = 'task'").get() as { n: number }).n

    return {
      sessionCount,
      messageCount,
      providerCount: providerRows.length,
      indexedCount,
      favoriteCount,
      preferenceCount,
      decisionCount,
      taskCount,
      providerBreakdown: providerRows.map(r => ({ provider: r.provider, count: r.n })),
      recentSessions
    }
  })

  // ===== 数据备份与恢复 =====
  safeHandle(IPC.BACKUP_EXPORT, async () => {
    const db = getDatabase()
    const workspaces = db.prepare('SELECT * FROM workspaces').all()
    const folders = db.prepare('SELECT * FROM folders').all()
    const sessions = db.prepare('SELECT * FROM chat_sessions').all()
    const messages = db.prepare('SELECT * FROM messages').all()
    const tags = db.prepare('SELECT * FROM tags').all()
    const sessionTags = db.prepare('SELECT * FROM session_tags').all()
    const summaries = db.prepare('SELECT * FROM session_summaries').all()
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces, folders, sessions, messages, tags, sessionTags, summaries
    }
  })

  safeHandle(IPC.BACKUP_IMPORT, async (_event, data: any) => {
    if (!data || !Array.isArray(data.workspaces) || !Array.isArray(data.sessions)) {
      throw new Error('无效的备份文件：缺少 workspaces 或 sessions 数组')
    }

    // 预校验：每条记录必须是对象且含必要字段，避免写到一半才失败
    const requiredFields: Record<string, string[]> = {
      workspaces: ['id'],
      sessions: ['id', 'workspace_id'],
      folders: ['id', 'workspace_id'],
      tags: ['id'],
      messages: ['id', 'session_id'],
      session_tags: ['session_id', 'tag_id'],
      session_summaries: ['session_id']
    }
    const tablesToCheck: Array<[string, any[]]> = [
      ['workspaces', data.workspaces],
      ['folders', data.folders || []],
      ['tags', data.tags || []],
      ['sessions' as string, data.sessions],
      ['messages', data.messages || []],
      ['session_tags', data.sessionTags || []],
      ['session_summaries', data.summaries || []]
    ]
    for (const [table, rows] of tablesToCheck) {
      const realTable = table === 'sessions' ? 'chat_sessions' : table
      const reqs = requiredFields[realTable]
      if (reqs) {
        for (let i = 0; i < rows.length; i++) {
          if (!rows[i] || typeof rows[i] !== 'object') {
            throw new Error(`表 ${realTable} 第 ${i + 1} 行不是有效对象`)
          }
          for (const f of reqs) {
            if (rows[i][f] === undefined) {
              throw new Error(`表 ${realTable} 第 ${i + 1} 行缺少字段 ${f}`)
            }
          }
        }
      }
    }

    const db = getDatabase()
    const tx = db.transaction(() => {
      // 清空现有数据（按依赖顺序）
      db.prepare('DELETE FROM session_summaries').run()
      db.prepare('DELETE FROM message_embeddings').run()
      db.prepare('DELETE FROM session_tags').run()
      db.prepare('DELETE FROM messages').run()
      db.prepare('DELETE FROM chat_sessions').run()
      db.prepare('DELETE FROM tags').run()
      db.prepare('DELETE FROM folders').run()
      db.prepare('DELETE FROM workspaces').run()

      // 按依赖顺序恢复
      // 白名单校验：只允许已知表名 + 列名只含字母/数字/下划线，防止 SQL 注入
      const ALLOWED_TABLES = new Set([
        'workspaces', 'folders', 'tags', 'chat_sessions',
        'messages', 'session_tags', 'session_summaries'
      ])
      const colNameRe = /^[a-zA-Z_][a-zA-Z0-9_]*$/
      const insertRow = (table: string, row: any) => {
        if (!ALLOWED_TABLES.has(table)) {
          throw new Error(`不允许的表名: ${table}`)
        }
        const cols = Object.keys(row).filter((c) => colNameRe.test(c))
        if (cols.length === 0) {
          throw new Error(`表 ${table} 无有效列`)
        }
        const placeholders = cols.map(() => '?').join(',')
        db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`).run(...cols.map((c) => row[c]))
      }

      for (const ws of data.workspaces) insertRow('workspaces', ws)
      for (const f of (data.folders || [])) insertRow('folders', f)
      for (const t of (data.tags || [])) insertRow('tags', t)
      for (const s of data.sessions) insertRow('chat_sessions', s)
      for (const m of (data.messages || [])) insertRow('messages', m)
      for (const st of (data.sessionTags || [])) insertRow('session_tags', st)
      for (const su of (data.summaries || [])) insertRow('session_summaries', su)
    })
    tx()
    return { restored: data.sessions.length }
  })

  // ===== 自动热备份（v1.6） =====
  safeHandle(IPC.BACKUP_LIST, () => backupService.listBackups())

  safeHandle(IPC.BACKUP_CREATE, async () => backupService.backupNow())

  safeHandle(IPC.BACKUP_RESTORE, async (_e, filename: string) => backupService.restoreBackup(filename))

  safeHandle(IPC.BACKUP_DELETE, (_e, filename: string) => backupService.deleteBackup(filename))

  safeHandle(IPC.BACKUP_CONFIG_GET, () => backupService.getConfig())

  safeHandle(IPC.BACKUP_CONFIG_SET, (_e, config: Partial<BackupConfig>) => backupService.setConfig(config))
}
