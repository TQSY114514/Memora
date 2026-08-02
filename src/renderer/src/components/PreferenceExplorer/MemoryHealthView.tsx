import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  MemoryHealth,
  ProfileSummary,
  TieredMemory,
  MemoryTier
} from '@shared/types'

/** 记忆层级元信息：标签 + 颜色 */
const TIER_META: Record<
  MemoryTier,
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

/** 顶部统计卡片 */
function StatCard({
  value,
  label,
  border
}: {
  value: number
  label: string
  border: string
}) {
  return (
    <div
      className={`rounded-lg border border-border border-l-2 ${border} bg-bg-primary p-3 flex flex-col`}
    >
      <span className="text-2xl font-bold tabular-nums text-fg-primary leading-none">
        {value}
      </span>
      <span className="text-[11px] text-fg-muted mt-1">{label}</span>
    </div>
  )
}

/** 高亮记忆卡片 */
function HighlightCard({
  subject,
  value,
  confidence,
  tier
}: {
  subject: string
  value: string
  confidence: number
  tier: MemoryTier
}) {
  const tierMeta = TIER_META[tier]
  const confPct = Math.round(Math.max(0, Math.min(1, confidence)) * 100)
  return (
    <div className="rounded-md border border-border bg-bg-primary p-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
          {subject}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ml-auto ${tierMeta.badge}`}
        >
          {tierMeta.label}
        </span>
      </div>
      <div className="text-[12px] text-fg-primary break-words leading-snug">
        {value}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-12 h-1 rounded-full bg-bg-hover overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${confPct}%` }}
          />
        </div>
        <span className="text-[10px] text-fg-muted tabular-nums">{confPct}%</span>
      </div>
    </div>
  )
}

/** 衰减记忆行：强度进度条 + 预计遗忘天数 */
function DecayRow({ mem }: { mem: TieredMemory }) {
  const str = Math.max(0, Math.min(1, mem.strength))
  const strPct = Math.round(str * 100)
  const tierMeta = TIER_META[mem.tier]
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tierMeta.badge}`}
          >
            {tierMeta.label}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
            {mem.preference.subject}
          </span>
        </div>
        <div className="text-fg-primary break-words leading-snug">
          {mem.preference.value}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 rounded-full bg-bg-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400"
              style={{ width: `${strPct}%` }}
            />
          </div>
          <span className="text-[10px] text-fg-muted tabular-nums w-8 text-right">
            {strPct}%
          </span>
        </div>
        <span className="text-[10px] text-red-500/80">
          预计 {mem.estimatedRetentionDays} 天后遗忘
        </span>
      </div>
    </div>
  )
}

/** 体检建议卡片 */
type SuggestionTone = 'warning' | 'info'
interface Suggestion {
  icon: string
  text: string
  tone: SuggestionTone
  action?: { label: string; onClick: () => void }
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { icon, text, tone, action } = suggestion
  const toneClass =
    tone === 'warning'
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-border bg-bg-primary'
  return (
    <div className={`rounded-md border ${toneClass} p-2.5 flex items-center gap-2`}>
      <span className="text-sm flex-shrink-0">{icon}</span>
      <span className="text-[12px] text-fg-secondary flex-1 min-w-0 break-words">
        {text}
      </span>
      {action && (
        <button
          onClick={action.onClick}
          className="Memora-btn Memora-btn-primary text-[11px] py-1 px-2 whitespace-nowrap flex-shrink-0"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export interface MemoryHealthViewProps {
  workspaceId?: string
  onNavigateConflicts?: () => void
}

/** 记忆健康视图：统计卡片 + 分层概览 + 高亮记忆 + 衰减趋势 + 体检报告 + 维护操作 */
export function MemoryHealthView({ workspaceId, onNavigateConflicts }: MemoryHealthViewProps) {
  const [health, setHealth] = useState<MemoryHealth | null>(null)
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [tiered, setTiered] = useState<TieredMemory[]>([])
  const [counts, setCounts] = useState<{
    total: number
    active: number
    superseded: number
    archived: number
  } | null>(null)
  const [conflictCount, setConflictCount] = useState(0)
  const [constitutionCount, setConstitutionCount] = useState(0)
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
  const [decaying, setDecaying] = useState(false)
  const [decayMsg, setDecayMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const [h, s, t, c, conflicts, constitution] = await Promise.all([
        window.Memora.memoryLifecycle.health(workspaceId),
        window.Memora.memoryLifecycle.profileSummary(workspaceId),
        window.Memora.memoryLifecycle.tiered(workspaceId),
        window.Memora.preference.count(workspaceId),
        window.Memora.preference.conflicts(workspaceId),
        window.Memora.preference.constitution(workspaceId)
      ])
      setHealth(h)
      setSummary(s)
      setTiered(t)
      setCounts(c)
      setConflictCount(
        conflicts.reduce((sum, r) => sum + r.conflicts.length, 0)
      )
      setConstitutionCount(constitution.length)
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

  async function handleDecay() {
    if (!workspaceId) return
    setDecaying(true)
    setDecayMsg(null)
    try {
      const decayed = await window.Memora.preference.decay(workspaceId)
      setDecayMsg(`✓ 已衰减 ${decayed} 条偏好`)
      await load()
    } catch (e) {
      setDecayMsg(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDecaying(false)
    }
  }

  // 各层级平均预计保持天数（hooks 必须在 early return 之前调用）
  const avgRetentionByTier: Record<MemoryTier, number> = useMemo(() => {
    const sums: Record<MemoryTier, { total: number; count: number }> = {
      working: { total: 0, count: 0 },
      short_term: { total: 0, count: 0 },
      long_term: { total: 0, count: 0 }
    }
    for (const m of tiered) {
      sums[m.tier].total += m.estimatedRetentionDays
      sums[m.tier].count++
    }
    return {
      working: sums.working.count > 0 ? Math.round(sums.working.total / sums.working.count) : 0,
      short_term:
        sums.short_term.count > 0 ? Math.round(sums.short_term.total / sums.short_term.count) : 0,
      long_term:
        sums.long_term.count > 0 ? Math.round(sums.long_term.total / sums.long_term.count) : 0
    }
  }, [tiered])

  // 高亮记忆：优先用 profileSummary.highlights，否则从 tiered 派生
  const highlights = useMemo(() => {
    if (summary?.highlights && summary.highlights.length > 0) {
      return [...summary.highlights]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
        .map((h) => ({
          subject: h.subject,
          value: h.value,
          confidence: h.confidence,
          tier: h.tier
        }))
    }
    return [...tiered]
      .sort((a, b) => b.preference.confidence - a.preference.confidence)
      .slice(0, 5)
      .map((m) => ({
        subject: m.preference.subject,
        value: m.preference.value,
        confidence: m.preference.confidence,
        tier: m.tier
      }))
  }, [summary, tiered])

  // 衰减趋势：即将遗忘 (< 0.2) + 正在衰减 (0.2-0.4)
  const decayGroups = useMemo(() => {
    const critical = tiered
      .filter((m) => m.strength < 0.2)
      .sort((a, b) => a.strength - b.strength)
    const declining = tiered
      .filter((m) => m.strength >= 0.2 && m.strength < 0.4)
      .sort((a, b) => a.strength - b.strength)
    return { critical, declining }
  }, [tiered])

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

  const totalActive = health?.total ?? 0
  const totalAll = counts?.total ?? 0
  const isEmpty = !health || (totalActive === 0 && totalAll === 0)
  if (isEmpty) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3 opacity-30">📊</div>
        <p className="text-sm text-fg-secondary">还没有偏好数据，无法生成记忆健康报告</p>
      </div>
    )
  }

  const total = totalActive
  const pct = (n: number): number => (total > 0 ? (n / total) * 100 : 0)

  // 健康评分：与后端公式一致 longTerm / total * 100
  const score =
    total > 0 ? Math.round(((health!.longTerm) / total) * 100) : 0
  const scoreColor =
    score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-red-500'
  const scoreStroke =
    score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  // 圆环进度（SVG）
  const R = 34
  const C = 2 * Math.PI * R
  const dashOffset = C * (1 - score / 100)

  // 体检报告建议
  const suggestions: Suggestion[] = []
  if (conflictCount > 0) {
    suggestions.push({
      icon: '⚠️',
      text: `发现 ${conflictCount} 条冲突偏好，建议解决`,
      tone: 'warning',
      action: onNavigateConflicts
        ? { label: '去解决', onClick: onNavigateConflicts }
        : undefined
    })
  }
  if (health!.atRisk.length > 5) {
    suggestions.push({
      icon: '⚠️',
      text: `${health!.atRisk.length} 条记忆即将遗忘，建议运行维护`,
      tone: 'warning',
      action: { label: '运行维护', onClick: handleRun }
    })
  }
  if (totalAll > 0 && (counts?.archived ?? 0) > totalAll * 0.5) {
    suggestions.push({
      icon: '💡',
      text: '归档比例较高，可考虑清理',
      tone: 'info'
    })
  }
  if (constitutionCount === 0) {
    suggestions.push({
      icon: '💡',
      text: '建议设置 AI 宪法，定义你的核心原则',
      tone: 'info'
    })
  }
  if (health!.longTerm < 3) {
    suggestions.push({
      icon: '💡',
      text: '长期记忆较少，多与 AI 对话以积累',
      tone: 'info'
    })
  }

  const tierLegend: Array<{
    tier: MemoryTier
    count: number
  }> = [
    { tier: 'working', count: health!.working },
    { tier: 'short_term', count: health!.shortTerm },
    { tier: 'long_term', count: health!.longTerm }
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
        {/* A. 顶部统计卡片 */}
        <div className="grid grid-cols-4 gap-2">
          <StatCard
            value={counts?.total ?? 0}
            label="总记忆"
            border="border-l-accent"
          />
          <StatCard
            value={counts?.active ?? 0}
            label="生效中"
            border="border-l-emerald-500"
          />
          <StatCard
            value={counts?.archived ?? 0}
            label="已归档"
            border="border-l-amber-500"
          />
          <StatCard
            value={conflictCount}
            label="冲突待解决"
            border="border-l-red-500"
          />
        </div>

        {/* B. 记忆分层概览 + 健康评分 */}
        <div className="rounded-lg border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
                记忆分层概览
              </h3>
              <div className="text-xs text-fg-secondary mb-3">
                共 <span className="text-fg-primary font-medium">{total}</span> 条活跃记忆
              </div>
              {/* 横向条形图 */}
              <div className="flex h-3 w-full rounded-full overflow-hidden bg-bg-hover mb-2">
                <div
                  className={`${TIER_META.working.bar} transition-all`}
                  style={{ width: `${pct(health!.working)}%` }}
                  title={`${TIER_META.working.label}：${health!.working}`}
                />
                <div
                  className={`${TIER_META.short_term.bar} transition-all`}
                  style={{ width: `${pct(health!.shortTerm)}%` }}
                  title={`${TIER_META.short_term.label}：${health!.shortTerm}`}
                />
                <div
                  className={`${TIER_META.long_term.bar} transition-all`}
                  style={{ width: `${pct(health!.longTerm)}%` }}
                  title={`${TIER_META.long_term.label}：${health!.longTerm}`}
                />
              </div>
              {/* 图例（含平均保持天数） */}
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-fg-muted">
                {tierLegend.map(({ tier, count }) => {
                  const meta = TIER_META[tier]
                  const avg = avgRetentionByTier[tier]
                  return (
                    <span key={tier} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-sm ${meta.bar}`} />
                      {meta.label}
                      <span className="text-fg-secondary tabular-nums">
                        ({count}条 · 平均保持 {avg}天)
                      </span>
                    </span>
                  )
                })}
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

        {/* C. 高亮记忆 */}
        {highlights.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>✨</span> 高亮记忆 (Top {highlights.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {highlights.map((h, i) => (
                <HighlightCard
                  key={`${h.subject}-${i}`}
                  subject={h.subject}
                  value={h.value}
                  confidence={h.confidence}
                  tier={h.tier}
                />
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

        {/* 偏好趋势 */}
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

        {/* D. 衰减趋势 */}
        {(decayGroups.critical.length > 0 || decayGroups.declining.length > 0) && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>📉</span> 衰减趋势
            </h3>
            {decayGroups.critical.length > 0 && (
              <div className="mb-2">
                <div className="text-[11px] font-medium text-red-500 mb-1.5">
                  即将遗忘 ({decayGroups.critical.length})
                </div>
                <div className="space-y-1.5">
                  {decayGroups.critical.map((m) => (
                    <DecayRow key={m.preference.id} mem={m} />
                  ))}
                </div>
              </div>
            )}
            {decayGroups.declining.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-amber-500 mb-1.5">
                  正在衰减 ({decayGroups.declining.length})
                </div>
                <div className="space-y-1.5">
                  {decayGroups.declining.map((m) => (
                    <DecayRow key={m.preference.id} mem={m} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* E. 记忆体检报告 */}
        {suggestions.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>🩺</span> 记忆体检报告
            </h3>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <SuggestionCard key={i} suggestion={s} />
              ))}
            </div>
          </div>
        )}

        {/* F. 记忆维护操作 */}
        <div className="rounded-lg border border-border bg-bg-secondary/40 p-4">
          <div className="mb-2">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
              <span>🔧</span> 记忆维护
            </h3>
            <p className="text-[11px] text-fg-muted">
              执行记忆生命周期操作：维护、衰减、归档、层级升降
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRun}
              disabled={running || !workspaceId}
              className="Memora-btn Memora-btn-primary text-xs whitespace-nowrap"
              title="运行记忆维护（衰减 + 归档 + 层级升降）"
            >
              {running ? '⏳ 维护中…' : '⚙ 运行维护'}
            </button>
            <button
              onClick={handleDecay}
              disabled={decaying || !workspaceId}
              className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
              title="触发置信度衰减（长期未访问的偏好）"
            >
              {decaying ? '⏳ 衰减中…' : '⏬ 触发衰减'}
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
          {decayMsg && (
            <p
              className={`text-[11px] mt-1 break-words ${
                decayMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {decayMsg}
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
