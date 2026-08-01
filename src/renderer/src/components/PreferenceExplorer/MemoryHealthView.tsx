import { useState, useEffect, useCallback } from 'react'
import type { MemoryHealth, ProfileSummary, TieredMemory } from '@shared/types'

/** 记忆层级元信息：标签 + 颜色 */
const TIER_META: Record<
  TieredMemory['tier'],
  { label: string; bar: string; badge: string }
> = {
  working: {
    label: '工作记忆',
    bar: 'bg-blue-500',
    badge: 'bg-blue-500/15 text-blue-500'
  },
  short_term: {
    label: '短期记忆',
    bar: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-500'
  },
  long_term: {
    label: '长期记忆',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-500'
  }
}

/** 分层记忆行：subject + value + 强度百分比 */
function TieredMemoryRow({
  mem,
  variant
}: {
  mem: TieredMemory
  variant: 'risk' | 'strong'
}) {
  const { preference, tier, strength } = mem
  const str = Math.max(0, Math.min(1, strength))
  const strPct = Math.round(str * 100)
  const tierMeta = TIER_META[tier]
  const barColor =
    variant === 'risk'
      ? 'bg-red-500'
      : str > 0.7
        ? 'bg-emerald-500'
        : str > 0.3
          ? 'bg-amber-500'
          : 'bg-red-500'

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tierMeta.badge}`}>
            {tierMeta.label}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
            {preference.subject}
          </span>
        </div>
        <div className="text-fg-primary break-words leading-snug">{preference.value}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-14 h-1.5 rounded-full bg-bg-hover overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${strPct}%` }}
          />
        </div>
        <span className="text-[10px] text-fg-muted tabular-nums w-8 text-right">
          {strPct}%
        </span>
      </div>
    </div>
  )
}

/** 记忆健康视图：分层记忆概览 + 健康评分 + 风险/稳定记忆 + 画像摘要 + 维护操作 */
export function MemoryHealthView({ workspaceId }: { workspaceId: string }) {
  const [health, setHealth] = useState<MemoryHealth | null>(null)
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{
    maintained: number
    archived: number
    promoted: number
    demoted: number
  } | null>(null)
  const [runMsg, setRunMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const [h, s] = await Promise.all([
        window.Memora.memoryLifecycle.health(workspaceId),
        window.Memora.memoryLifecycle.profileSummary(workspaceId)
      ])
      setHealth(h)
      setSummary(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  async function handleRun() {
    if (!workspaceId) return
    setRunning(true)
    setRunMsg(null)
    try {
      const result = await window.Memora.memoryLifecycle.run(workspaceId)
      setRunResult(result)
      setRunMsg(
        `✓ 维护完成：维护 ${result.maintained} · 归档 ${result.archived} · 提升 ${result.promoted} · 降级 ${result.demoted}`
      )
      await load()
    } catch (e) {
      setRunMsg(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-fg-secondary py-8">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
        <span>加载中...</span>
      </div>
    )
  }
  if (error) {
    return <div className="text-center py-8 text-sm text-red-500">✗ {error}</div>
  }
  if (!health || health.total === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3 opacity-30">📊</div>
        <p className="text-sm text-fg-secondary">还没有偏好数据，无法生成记忆健康报告</p>
      </div>
    )
  }

  const total = health.total
  const pct = (n: number): number => (total > 0 ? (n / total) * 100 : 0)

  // 健康评分：长期记忆权重最高，工作记忆最低；atRisk 数量扣分
  const longevityScore =
    (health.longTerm * 1.0 + health.shortTerm * 0.6 + health.working * 0.3) / total * 100
  const atRiskPenalty = (health.atRisk.length / total) * 25
  const score = Math.max(0, Math.min(100, Math.round(longevityScore - atRiskPenalty)))
  const scoreColor =
    score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-red-500'
  const scoreStroke =
    score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  // 圆环进度（SVG）
  const R = 34
  const C = 2 * Math.PI * R
  const dashOffset = C * (1 - score / 100)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
        {/* 健康概览 + 评分 */}
        <div className="rounded-lg border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
                记忆分层概览
              </h3>
              <div className="text-xs text-fg-secondary mb-3">
                共 <span className="text-fg-primary font-medium">{total}</span> 条记忆
              </div>
              {/* 横向条形图 */}
              <div className="flex h-3 w-full rounded-full overflow-hidden bg-bg-hover mb-2">
                <div
                  className={`${TIER_META.working.bar} transition-all`}
                  style={{ width: `${pct(health.working)}%` }}
                  title={`${TIER_META.working.label}：${health.working}`}
                />
                <div
                  className={`${TIER_META.short_term.bar} transition-all`}
                  style={{ width: `${pct(health.shortTerm)}%` }}
                  title={`${TIER_META.short_term.label}：${health.shortTerm}`}
                />
                <div
                  className={`${TIER_META.long_term.bar} transition-all`}
                  style={{ width: `${pct(health.longTerm)}%` }}
                  title={`${TIER_META.long_term.label}：${health.longTerm}`}
                />
              </div>
              {/* 图例 */}
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-fg-muted">
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${TIER_META.working.bar}`} />
                  {TIER_META.working.label}
                  <span className="text-fg-secondary tabular-nums">{health.working}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${TIER_META.short_term.bar}`} />
                  {TIER_META.short_term.label}
                  <span className="text-fg-secondary tabular-nums">{health.shortTerm}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${TIER_META.long_term.bar}`} />
                  {TIER_META.long_term.label}
                  <span className="text-fg-secondary tabular-nums">{health.longTerm}</span>
                </span>
              </div>
            </div>

            {/* 健康评分圆环 */}
            <div className="flex flex-col items-center flex-shrink-0">
              <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
                <circle
                  cx="42"
                  cy="42"
                  r={R}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  className="text-bg-hover"
                />
                <circle
                  cx="42"
                  cy="42"
                  r={R}
                  fill="none"
                  stroke={scoreStroke}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="-mt-[58px] flex flex-col items-center pointer-events-none">
                <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{score}</span>
                <span className="text-[9px] text-fg-muted">分</span>
              </div>
              <span className="text-[10px] text-fg-muted mt-7">记忆健康评分</span>
            </div>
          </div>
        </div>

        {/* 风险记忆 */}
        {health.atRisk.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <h3 className="text-xs font-semibold text-yellow-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>⚠️</span> 即将遗忘的记忆 ({health.atRisk.length})
            </h3>
            <div className="space-y-1.5">
              {health.atRisk.map((m) => (
                <TieredMemoryRow key={m.preference.id} mem={m} variant="risk" />
              ))}
            </div>
          </div>
        )}

        {/* 最稳定记忆 */}
        {health.strongest.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>💪</span> 最稳定的长期记忆 ({health.strongest.length})
            </h3>
            <div className="space-y-1.5">
              {health.strongest.map((m) => (
                <TieredMemoryRow key={m.preference.id} mem={m} variant="strong" />
              ))}
            </div>
          </div>
        )}

        {/* 画像摘要 */}
        {summary && summary.summary && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>📝</span> 用户画像摘要
            </h3>
            <p className="text-[12px] text-fg-secondary leading-relaxed whitespace-pre-wrap break-words">
              {summary.summary}
            </p>
          </div>
        )}

        {/* 趋势 */}
        {summary && summary.trends && summary.trends.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>📈</span> 偏好趋势
            </h3>
            <div className="space-y-2">
              {summary.trends.map((t, i) => (
                <div
                  key={`${t.subject}-${i}`}
                  className="flex items-start gap-2 text-[12px]"
                >
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent flex-shrink-0">
                    {t.subject}
                  </span>
                  <span className="text-fg-secondary break-words flex-1 min-w-0">
                    <span className="text-fg-muted">从 </span>
                    <span className="line-through opacity-70">{t.from || '—'}</span>
                    <span className="text-accent mx-1">→</span>
                    <span className="text-fg-primary font-medium">{t.to || '—'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 记忆维护操作 */}
        <div className="rounded-lg border border-border bg-bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
                <span>🔧</span> 记忆维护
              </h3>
              <p className="text-[11px] text-fg-muted">
                执行一次生命周期维护：衰减、归档、层级升降
              </p>
            </div>
            <button
              onClick={handleRun}
              disabled={running || !workspaceId}
              className="Memora-btn Memora-btn-primary text-xs whitespace-nowrap"
              title="运行记忆维护"
            >
              {running ? '⏳ 维护中…' : '⚙ 运行维护'}
            </button>
          </div>
          {runMsg && (
            <p
              className={`text-[11px] mt-2.5 break-words ${
                runMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {runMsg}
            </p>
          )}
          {runResult && (
            <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px]">
              <span className="px-2 py-1 rounded bg-bg-hover text-fg-secondary">
                维护 <span className="text-fg-primary font-medium">{runResult.maintained}</span>
              </span>
              <span className="px-2 py-1 rounded bg-bg-hover text-fg-secondary">
                归档 <span className="text-fg-primary font-medium">{runResult.archived}</span>
              </span>
              <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-500">
                提升 <span className="font-medium">{runResult.promoted}</span>
              </span>
              <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-500">
                降级 <span className="font-medium">{runResult.demoted}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
