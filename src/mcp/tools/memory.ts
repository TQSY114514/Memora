/**
 * MCP 工具域 —— memory（记忆 / 偏好）
 *
 * 处理记忆与偏好相关工具：memory_recall / memory_write / memory_save_preference /
 * memory_profile / memory_forget / preference_search。
 */

import { createEntry } from '../../database/repositories/knowledgeRepo'
import { createSession } from '../../database/repositories/sessionRepo'
import {
  getUserProfile,
  createPreference,
  archivePreference,
  searchPreferences
} from '../../database/repositories/preferencesRepo'
import { semanticSearch } from '../../search/semantic'
import { v4 as uuidv4 } from 'uuid'
import { loadAiConfigForTool } from './shared'

export async function handleMemoryTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'memory_recall': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 5)
      const threshold = Number(args.threshold ?? 0.25)

      // 从主进程文件 + secretStore 组装 AiConfig
      const config = loadAiConfigForTool({
        missingConfigMessage: '未配置 AI 供应商或未设置 API Key。请在 Memora UI 的「设置 → AI 配置」中配置供应商和密钥后再使用 memory_recall。',
        missingKeyMessage: 'API Key 未在加密存储中找到，请在 Memora UI 重新配置 API Key。'
      })

      const results = await semanticSearch(query, config, { limit, threshold })
      return results.map((r) => ({
        sessionId: r.session.id,
        title: r.session.title,
        provider: r.session.provider,
        snippet: r.snippet,
        score: r.score
      }))
    }

    case 'memory_write': {
      const title = String(args.title ?? '')
      const content = String(args.content ?? '')
      if (!title) throw new Error('title 不能为空')
      if (!content) throw new Error('content 不能为空')
      const provider = String(args.provider ?? 'Unknown')
      const folderId = args.folderId ? String(args.folderId) : undefined
      const type = (String(args.type ?? 'knowledge') as 'knowledge' | 'decision' | 'task')
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined

      // 优先写入 knowledge_entries（结构化知识条目）
      let entryId: string | undefined
      if (workspaceId) {
        const entry = createEntry({
          workspaceId,
          type,
          title,
          content,
          source: 'mcp',
          status: type === 'task' ? 'open' : 'active'
        })
        entryId = entry.id
      }

      // 若提供 folderId，同时创建一条对话记录（保留旧行为）
      let sessionId: string | undefined
      if (folderId) {
        const messages = [
          {
            id: uuidv4(),
            sessionId: '',
            role: 'user' as const,
            content: title,
            order: 0,
            createdAt: new Date().toISOString()
          },
          {
            id: uuidv4(),
            sessionId: '',
            role: 'assistant' as const,
            content,
            order: 1,
            createdAt: new Date().toISOString()
          }
        ]
        const session = createSession(
          {
            provider: provider as any,
            title,
            folderId,
            isFavorite: false,
            messageCount: messages.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: []
          },
          messages
        )
        sessionId = session.id
      }

      return {
        entryId,
        sessionId,
        title,
        type,
        written: true,
        note: workspaceId
          ? `已写入 knowledge_entries（type=${type}）`
          : folderId
            ? '已写入对话记录（未提供 workspaceId，跳过 knowledge_entries）'
            : '未提供 workspaceId 或 folderId，未持久化（请至少提供一个）'
      }
    }

    case 'memory_profile': {
      const workspaceId = String(args.workspaceId ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      return getUserProfile(workspaceId)
    }

    case 'memory_save_preference': {
      const workspaceId = String(args.workspaceId ?? '')
      const subject = String(args.subject ?? '')
      const value = String(args.value ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      if (!subject) throw new Error('subject 不能为空')
      if (!value) throw new Error('value 不能为空')
      const sessionId = args.sessionId ? String(args.sessionId) : undefined
      const confidence = args.confidence ? Number(args.confidence) : undefined
      const pref = createPreference({
        workspaceId,
        sessionId,
        subject,
        value,
        confidence,
        source: 'mcp'
      })
      return {
        preferenceId: pref.id,
        subject: pref.subject,
        value: pref.value,
        confidence: pref.confidence,
        status: pref.status,
        note: pref.status === 'active' ? '新偏好已保存' : '已更新已有偏好（复现增强）'
      }
    }

    case 'memory_forget': {
      const preferenceId = String(args.preferenceId ?? '')
      if (!preferenceId) throw new Error('preferenceId 不能为空')
      const pref = archivePreference(preferenceId)
      if (!pref) throw new Error('偏好不存在')
      return { preferenceId, status: 'archived', note: '偏好已遗忘（archived）' }
    }

    case 'preference_search': {
      const query = String(args.query ?? '')
      if (!query) throw new Error('query 不能为空')
      const limit = Number(args.limit ?? 10)
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const results = searchPreferences(query, { workspaceId, limit })
      return results.map((p) => ({
        id: p.id,
        subject: p.subject,
        value: p.value,
        confidence: p.confidence,
        status: p.status,
        source: p.source,
        createdAt: p.createdAt,
        lastAccessedAt: p.lastAccessedAt,
        accessCount: p.accessCount
      }))
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}
