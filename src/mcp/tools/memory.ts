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
  searchPreferences,
  getConstitution,
  feedbackPreference
} from '../../database/repositories/preferencesRepo'
import { listAuditLogs } from '../../database/repositories/auditRepo'
import {
  listBlocks,
  getBlock,
  saveBlock,
  deleteBlock,
  listBlockHistory,
  rollbackBlock
} from '../../database/repositories/memoryBlocksRepo'
import { semanticSearch } from '../../search/semantic'
import { v4 as uuidv4 } from 'uuid'
import { loadAiConfigForTool } from './shared'

/**
 * 构建 L0 层级摘要（一句话，~100 token）
 * 借鉴 OpenViking 分层记忆架构：L0 = 摘要层
 */
function buildL0Summary(snippet: string): string {
  if (!snippet) return ''
  // 取前 100 字符作为摘要（可通过 AI 压缩进一步优化，但保持简单）
  const trimmed = snippet.trim()
  if (trimmed.length <= 100) return trimmed
  return trimmed.slice(0, 97) + '…'
}

/**
 * 构建 L1 层级概览（要点，~2k token）
 * 借鉴 OpenViking 分层记忆架构：L1 = 概览层
 */
function buildL1Overview(snippet: string): string {
  if (!snippet) return ''
  // 取前 2000 字符作为概览
  const trimmed = snippet.trim()
  if (trimmed.length <= 2000) return trimmed
  return trimmed.slice(0, 1997) + '…'
}

/**
 * 把 MemoryBlock 映射为 MCP 返回 DTO（memory_block_* 工具共用，去重字段映射）
 */
function toBlockDto(block: {
  id: string
  workspaceId: string
  label: string
  value: string
  readOnly: boolean
  createdAt: string
  updatedAt: string
}): Record<string, unknown> {
  return {
    id: block.id,
    workspaceId: block.workspaceId,
    label: block.label,
    value: block.value,
    readOnly: block.readOnly,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt
  }
}

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
      const tiered = args.tiered === true // 是否启用分层返回（借鉴 OpenViking）

      // 从主进程文件 + secretStore 组装 AiConfig
      const config = loadAiConfigForTool({
        missingConfigMessage: '未配置 AI 供应商或未设置 API Key。请在 Memora UI 的「设置 → AI 配置」中配置供应商和密钥后再使用 memory_recall。',
        missingKeyMessage: 'API Key 未在加密存储中找到，请在 Memora UI 重新配置 API Key。'
      })

      const results = await semanticSearch(query, config, { limit, threshold })
      return tiered ? results.map((r) => ({
        sessionId: r.session.id,
        title: r.session.title,
        provider: r.session.provider,
        l0: buildL0Summary(r.snippet),
        l1: buildL1Overview(r.snippet),
        l2: r.snippet,
        score: r.score
      })) : results.map((r) => ({
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

    case 'memory_get_constitution': {
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const constitution = getConstitution(workspaceId)
      return constitution.map((p) => ({
        id: p.id,
        subject: p.subject,
        value: p.value,
        confidence: p.confidence,
        status: p.status,
        source: p.source,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
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

    case 'memory_feedback': {
      // 自然语言记忆反馈（借鉴 MemOS 记忆纠错闭环）
      const preferenceId = String(args.preferenceId ?? '')
      const feedback = String(args.feedback ?? '')
      const workspaceId = String(args.workspaceId ?? '')
      if (!preferenceId) throw new Error('preferenceId 不能为空')
      if (!feedback) throw new Error('feedback 不能为空')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      const updated = feedbackPreference({ preferenceId, feedback, workspaceId })
      if (!updated) throw new Error('偏好不存在')
      return {
        preferenceId: updated.id,
        subject: updated.subject,
        value: updated.value,
        context: updated.context,
        confidence: updated.confidence,
        status: updated.status,
        note: '反馈已应用，偏好已更新（记忆纠错闭环）'
      }
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

    case 'memory_audit_log': {
      const entityType = args.entityType ? String(args.entityType) : undefined
      const entityId = args.entityId ? String(args.entityId) : undefined
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const limit = Number(args.limit ?? 10)
      const offset = Number(args.offset ?? 0)
      const logs = listAuditLogs({ entityType, entityId, workspaceId, limit, offset })
      return logs.map((l) => ({
        id: l.id,
        entityType: l.entityType,
        entityId: l.entityId,
        action: l.action,
        beforeValue: l.beforeValue,
        afterValue: l.afterValue,
        workspaceId: l.workspaceId,
        sessionId: l.sessionId,
        reason: l.reason,
        createdAt: l.createdAt
      }))
    }

// ===== memory blocks 域（v1.15 结构化记忆块）=====

    case 'memory_block_list': {
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const blocks = listBlocks(workspaceId)
      return blocks.map((b) => toBlockDto(b))
    }

    case 'memory_block_get': {
      const blockId = String(args.blockId ?? '')
      if (!blockId) throw new Error('blockId 不能为空')
      const block = getBlock(blockId)
      if (!block) throw new Error(`[BLOCK] memory block ${blockId} 不存在`)
      return toBlockDto(block)
    }

    case 'memory_block_save': {
      const workspaceId = String(args.workspaceId ?? '')
      const label = String(args.label ?? '')
      const value = String(args.value ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      if (!label) throw new Error('label 不能为空')
      if (!value) throw new Error('value 不能为空')
      const block = saveBlock({
        workspaceId,
        label,
        value,
        readOnly: args.readOnly === true,
        changedBy: 'mcp',
        reason: args.reason ? String(args.reason) : undefined
      })
      return {
        ...toBlockDto(block),
        note: '已通过 MCP 保存记忆块（upsert by label）'
      }
    }

    case 'memory_block_delete': {
      const blockId = String(args.blockId ?? '')
      if (!blockId) throw new Error('blockId 不能为空')
      deleteBlock(blockId, 'mcp')
      return { deleted: true, blockId, note: '记忆块已删除（含级联历史）' }
    }

    case 'memory_block_history': {
      const blockId = String(args.blockId ?? '')
      if (!blockId) throw new Error('blockId 不能为空')
      const limit = Number(args.limit ?? 10)
      return listBlockHistory(blockId, limit)
    }

    case 'memory_block_rollback': {
      const blockId = String(args.blockId ?? '')
      const historyId = String(args.historyId ?? '')
      if (!blockId) throw new Error('blockId 不能为空')
      if (!historyId) throw new Error('historyId 不能为空')
      const block = rollbackBlock(blockId, historyId, 'mcp')
      return {
        ...toBlockDto(block),
        note: `已回滚到历史版本 ${historyId}`
      }
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}
