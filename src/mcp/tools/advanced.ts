/**
 * MCP 高级工具 —— memory_explain / memory_timeline / memory_diff
 *
 * 让 AI 不仅能读写记忆，还能理解"为什么"和"如何变化"。
 */

import { getDatabase } from '../../database/connection'
import { listAuditLogs } from '../../database/repositories/auditRepo'
import { searchPreferences } from '../../database/repositories/preferencesRepo'

interface TimelineEntry {
  timestamp: string
  event: string
  detail: string
  entityType: string
}

interface DiffEntry {
  subject: string
  oldValue: string | null
  newValue: string | null
  change: 'added' | 'removed' | 'modified'
  timestamp: string
}

export async function handleAdvancedMCPTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'memory_explain': {
      // 解释为什么返回了某条记忆
      const query = String(args.query ?? '')
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      if (!query) throw new Error('query 不能为空')

      // 搜索相关偏好
      const prefs = searchPreferences(query, { workspaceId, limit: 5 }) as Array<{
        id: string; subject: string; value: string; confidence: number
        status: string; source: string; accessCount: number
        createdAt: string; updatedAt: string
      }>

      // 搜索相关审计日志
      const logs = listAuditLogs({
        entityType: 'preference',
        workspaceId,
        limit: 5
      }) as Array<{
        entityId: string; entityType: string; action: string
        beforeValue: string | null; afterValue: string | null
        createdAt: string
      }>

      const explanations = prefs.map((p) => {
        const relatedLogs = logs.filter(
          (l) => l.entityId === p.id || l.beforeValue?.includes(p.subject) || l.afterValue?.includes(p.subject)
        )

        const reasons: string[] = []
        if (p.confidence >= 0.8) reasons.push('高置信度（多次确认）')
        else if (p.confidence >= 0.5) reasons.push('中等置信度（最近刚确认）')
        else reasons.push('低置信度（可能过时）')

        if (p.accessCount > 10) reasons.push(`频繁访问（${p.accessCount} 次）`)
        if (p.status === 'constitution') reasons.push('用户宪法级偏好（最高优先级）')
        if (p.status === 'superseded') reasons.push('已被新偏好取代')

        // 从审计日志中提取来源
        const createLog = relatedLogs.find((l) => l.action === 'create')
        if (createLog) {
          reasons.push(`最初记录于 ${new Date(createLog.createdAt).toLocaleDateString()}`)
        }

        return {
          subject: p.subject,
          value: p.value,
          confidence: p.confidence,
          reasons,
          source: p.source,
          status: p.status,
          firstSeen: createLog?.createdAt ?? p.createdAt,
          lastUpdated: p.updatedAt
        }
      })

      return {
        query,
        matchCount: explanations.length,
        explanations,
        summary: explanations.length > 0
          ? `找到 ${explanations.length} 条相关记忆。${explanations[0]?.reasons.join('；')}`
          : '未找到相关记忆。'
      }
    }

    case 'memory_timeline': {
      // 展示用户偏好/知识随时间的变化
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const limit = Number(args.limit ?? 50)

      const logs = listAuditLogs({
        workspaceId,
        limit
      }) as Array<{
        entityId: string; entityType: string; action: string
        beforeValue: string | null; afterValue: string | null
        createdAt: string
      }>

      const timeline: TimelineEntry[] = logs.map((l) => ({
        timestamp: l.createdAt,
        event: l.action,
        detail: l.entityType === 'preference'
          ? `${l.afterValue ?? l.beforeValue ?? ''}`
          : l.entityType === 'knowledge'
            ? `知识条目 ${l.entityId.slice(0, 8)}...`
            : `会话 ${l.entityId.slice(0, 8)}...`,
        entityType: l.entityType
      }))

      return {
        workspaceId,
        totalEvents: logs.length,
        timeline,
        note: '按时间倒序排列，展示记忆库的演变过程'
      }
    }

    case 'memory_diff': {
      // 对比过去和现在的偏好变化
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const since = args.since ? String(args.since) : undefined

      const db = getDatabase()

      // 获取当前活跃偏好
      let currentPrefs: Array<{ subject: string; value: string }>
      if (workspaceId) {
        currentPrefs = db
          .prepare(
            `SELECT subject, value FROM preferences
             WHERE workspaceId = ? AND status = 'active'
             ORDER BY subject`
          )
          .all(workspaceId) as Array<{ subject: string; value: string }>
      } else {
        currentPrefs = db
          .prepare(
            `SELECT subject, value FROM preferences
             WHERE status = 'active'
             ORDER BY subject`
          )
          .all() as Array<{ subject: string; value: string }>
      }

      // 获取 superseded/archived 的旧偏好
      let oldPrefs: Array<{ subject: string; value: string }>
      if (workspaceId) {
        oldPrefs = db
          .prepare(
            `SELECT subject, value FROM preferences
             WHERE workspaceId = ? AND status IN ('superseded', 'archived')
             ORDER BY subject`
          )
          .all(workspaceId) as Array<{ subject: string; value: string }>
      } else {
        oldPrefs = db
          .prepare(
            `SELECT subject, value FROM preferences
             WHERE status IN ('superseded', 'archived')
             ORDER BY subject`
          )
          .all() as Array<{ subject: string; value: string }>
      }

      const diffs: DiffEntry[] = []
      const currentMap = new Map(currentPrefs.map((p) => [p.subject, p.value]))
      const oldMap = new Map(oldPrefs.map((p) => [p.subject, p.value]))

      // 新增的
      for (const [subject, value] of currentMap) {
        if (!oldMap.has(subject)) {
          diffs.push({
            subject,
            oldValue: null,
            newValue: value,
            change: 'added',
            timestamp: new Date().toISOString()
          })
        }
      }

      // 已移除的
      for (const [subject, value] of oldMap) {
        if (!currentMap.has(subject)) {
          diffs.push({
            subject,
            oldValue: value,
            newValue: null,
            change: 'removed',
            timestamp: new Date().toISOString()
          })
        }
      }

      // 修改的
      for (const [subject, newValue] of currentMap) {
        const oldValue = oldMap.get(subject)
        if (oldValue && oldValue !== newValue) {
          diffs.push({
            subject,
            oldValue,
            newValue,
            change: 'modified',
            timestamp: new Date().toISOString()
          })
        }
      }

      // 从审计日志中获取更精确的时间戳
      if (since) {
        const logs = listAuditLogs({
          entityType: 'preference',
          workspaceId,
          limit: 200
        }) as Array<{
          entityId: string; entityType: string; action: string
          beforeValue: string | null; afterValue: string | null
          createdAt: string
        }>
        for (const diff of diffs) {
          const relatedLog = logs.find(
            (l) =>
              l.afterValue?.includes(diff.subject) &&
              l.createdAt >= since
          )
          if (relatedLog) {
            diff.timestamp = relatedLog.createdAt
          }
        }
      }

      return {
        workspaceId,
        since: since ?? 'all time',
        currentCount: currentPrefs.length,
        diffCount: diffs.length,
        summary: `${diffs.length} 项变化：${diffs.filter((d) => d.change === 'added').length} 新增，${diffs.filter((d) => d.change === 'removed').length} 移除，${diffs.filter((d) => d.change === 'modified').length} 修改`,
        diffs
      }
    }

    default:
      throw new Error(`未知高级工具: ${name}`)
  }
}