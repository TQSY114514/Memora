/**
 * MCP 高级工具 —— memory_explain / memory_timeline / memory_diff / memory_consolidate
 *
 * 让 AI 不仅能读写记忆，还能理解"为什么"和"如何变化"。
 *
 * v2.0: memory_explain 增强 — 来源对话摘要 + 关联记忆
 *       memory_timeline 增强 — 按月份分组 + 趋势分析
 *       新增 memory_consolidate — 记忆合并去重
 */

import { getDatabase } from '../../database/connection'
import { listAuditLogs } from '../../database/repositories/auditRepo'
import { searchPreferences } from '../../database/repositories/preferencesRepo'
import { scanConsolidationCandidates, executeConsolidation } from '../../memoryAgent/consolidation'
import { logger } from '../../main/logger'

interface TimelineEntry {
  timestamp: string
  event: string
  detail: string
  entityType: string
}

interface TimelineGroup {
  period: string
  entries: TimelineEntry[]
  summary: string
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

      const db = getDatabase()

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
        limit: 10
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
        else if (p.confidence >= 0.5) reasons.push('中等置信度')
        else reasons.push('低置信度（可能过时）')

        if (p.accessCount > 10) reasons.push(`频繁访问（${p.accessCount} 次）`)
        if (p.status === 'constitution') reasons.push('用户宪法级偏好（最高优先级）')
        if (p.status === 'superseded') reasons.push('已被新偏好取代')

        // 从审计日志中提取来源
        const createLog = relatedLogs.find((l) => l.action === 'create')
        if (createLog) {
          reasons.push(`最初记录于 ${new Date(createLog.createdAt).toLocaleDateString()}`)
        }

        // v2.0: 查找来源对话
        let sourceSession: { title: string; provider: string; createdAt: string } | null = null
        try {
          if (p.source && p.source.startsWith('session:')) {
            const sessionId = p.source.replace('session:', '')
            const session = db
              .prepare('SELECT title, provider, createdAt FROM chat_sessions WHERE id = ?')
              .get(sessionId) as { title: string; provider: string; createdAt: string } | undefined
            if (session) {
              sourceSession = session
              reasons.push(`来源: ${session.title} (${session.provider}, ${new Date(session.createdAt).toLocaleDateString()})`)
            }
          }
        } catch {
          // 来源查询失败不影响
        }

        // v2.0: 查找关联记忆（同 subject 的其他 value）
        let relatedMemories: Array<{ subject: string; value: string; confidence: number; status: string }> = []
        try {
          const related = db
            .prepare(
              `SELECT subject, value, confidence, status FROM preferences
               WHERE subject = ? AND id != ?
               ORDER BY updatedAt DESC LIMIT 5`
            )
            .all(p.subject, p.id) as Array<{ subject: string; value: string; confidence: number; status: string }>
          relatedMemories = related
        } catch {
          // 忽略
        }

        return {
          subject: p.subject,
          value: p.value,
          confidence: p.confidence,
          reasons,
          source: p.source,
          sourceSession: sourceSession ? {
            title: sourceSession.title,
            provider: sourceSession.provider,
            createdAt: sourceSession.createdAt
          } : null,
          status: p.status,
          firstSeen: createLog?.createdAt ?? p.createdAt,
          lastUpdated: p.updatedAt,
          relatedMemories: relatedMemories.length > 0 ? relatedMemories : undefined
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
      // 展示用户偏好/知识随时间的变化（v2.0: 按月份分组 + 趋势）
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const limit = Number(args.limit ?? 100)

      const logs = listAuditLogs({
        workspaceId,
        limit
      }) as Array<{
        entityId: string; entityType: string; action: string
        beforeValue: string | null; afterValue: string | null
        createdAt: string
      }>

      // v2.0: 按月份分组
      const groups = new Map<string, TimelineEntry[]>()
      for (const l of logs) {
        const date = new Date(l.createdAt)
        const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

        const entry: TimelineEntry = {
          timestamp: l.createdAt,
          event: l.action,
          detail: l.entityType === 'preference'
            ? `${l.afterValue ?? l.beforeValue ?? ''}`
            : l.entityType === 'knowledge'
              ? `知识条目 ${l.entityId.slice(0, 8)}...`
              : `会话 ${l.entityId.slice(0, 8)}...`,
          entityType: l.entityType
        }

        const group = groups.get(period) || []
        group.push(entry)
        groups.set(period, group)
      }

      const timelineGroups: TimelineGroup[] = []
      for (const [period, entries] of groups) {
        // 生成摘要
        const actions = new Map<string, number>()
        for (const e of entries) {
          actions.set(e.event, (actions.get(e.event) ?? 0) + 1)
        }
        const summaryParts: string[] = []
        for (const [action, count] of actions) {
          const actionName = action === 'create' ? '新增' : action === 'update' ? '更新' : action === 'delete' ? '删除' : action
          summaryParts.push(`${actionName} ${count} 条`)
        }

        timelineGroups.push({
          period,
          entries: entries.slice(0, 20), // 每组最多 20 条
          summary: summaryParts.join('，')
        })
      }

      // 倒序排列
      timelineGroups.sort((a, b) => b.period.localeCompare(a.period))

      // v2.0: 趋势分析
      const trend = analyzeTrend(timelineGroups)

      return {
        workspaceId,
        totalEvents: logs.length,
        periodCount: timelineGroups.length,
        timelineGroups,
        trend,
        note: '按月份分组，倒序排列。trend 字段展示记忆库的演变趋势。'
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

    case 'memory_consolidate': {
      // v2.0: 记忆合并去重
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const dryRun = args.dry_run !== false // 默认预览模式

      const candidates = scanConsolidationCandidates(workspaceId)

      if (dryRun) {
        return {
          dryRun: true,
          ...candidates,
          note: '预览模式。设置 dry_run=false 执行实际合并。'
        }
      }

      if (!workspaceId) {
        throw new Error('执行合并需要指定 workspaceId')
      }

      if (candidates.candidates.length === 0) {
        return { dryRun: false, ...candidates }
      }

      try {
        const result = executeConsolidation(workspaceId, candidates.candidates)
        logger.info('[memory_consolidate] executed', result)
        return {
          dryRun: false,
          candidates: candidates.candidates,
          totalMerged: result.merged,
          errors: result.errors.length > 0 ? result.errors : undefined,
          summary: `成功合并 ${result.merged} 条偏好${result.errors.length > 0 ? `，${result.errors.length} 条失败` : ''}`
        }
      } catch (e) {
        logger.error('[memory_consolidate] error:', e as Record<string, unknown>)
        throw new Error(`合并失败: ${String(e)}`)
      }
    }

    default:
      throw new Error(`未知高级工具: ${name}`)
  }
}

/** 分析趋势 */
function analyzeTrend(groups: TimelineGroup[]): string {
  if (groups.length < 2) return '数据不足，无法分析趋势'

  const total = groups.reduce((sum, g) => sum + g.entries.length, 0)
  const recent = groups.slice(0, Math.ceil(groups.length / 2))
  const recentTotal = recent.reduce((sum, g) => sum + g.entries.length, 0)

  if (recentTotal > total * 0.6) {
    return '近期记忆库活跃度上升，可能有较多新知识被记录'
  } else if (recentTotal < total * 0.3) {
    return '近期记忆库活跃度下降，建议多回顾和更新知识'
  }

  // 检查是否有偏好变化
  const preferenceChanges = groups.flatMap((g) =>
    g.entries.filter((e) => e.entityType === 'preference')
  )
  if (preferenceChanges.length > 5) {
    return `检测到 ${preferenceChanges.length} 次偏好变化，你的偏好正在演化中`
  }

  return '记忆库保持稳定，持续积累中'
}