import { useState, useEffect } from 'react'
import type { PreferenceTimeline, PreferenceTimelineEvent } from '@shared/types'

/** 操作 → 展示文案与颜色 */
const ACTION_META: Record<string, { label: string; color: string }> = {
  create: { label: '新增', color: 'text-emerald-500' },
  update: { label: '更新', color: 'text-sky-500' },
  supersede: { label: '取代', color: 'text-amber-500' },
  archive: { label: '归档', color: 'text-fg-muted' },
  feedback: { label: '反馈修正', color: 'text-violet-500' }
}

function actionLabel(action: string): string {
  return ACTION_META[action]?.label ?? action
}

function actionColor(action: string): string {
  return ACTION_META[action]?.color ?? 'text-fg-muted'
}

/** 时间格式化：HH:mm */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

/** 日期标题：今天 / 昨天 / 2026年08月07日 */
function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const today = new Date()
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  if (ymd(d) === ymd(today)) return '今天'
  const yesterday = new Date(today.getTime() - 86400000)
  if (ymd(d) === ymd(yesterday)) return '昨天'
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function EventItem({ ev }: { ev: PreferenceTimelineEvent }) {
  return (
    <div className="flex items-start gap-2.5">
      {/* 圆点 + 时间线 */}
      <div className="flex flex-col items-center pt-1.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${actionColor(ev.action)}`} style={{ background: 'currentColor' }} />
        <span className="w-px flex-1 bg-border mt-1" />
      </div>
      {/* 内容 */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className={`font-medium ${actionColor(ev.action)}`}>{actionLabel(ev.action)}</span>
          <span className="text-fg-muted">{formatTime(ev.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-sm text-fg-primary break-all">
          <span className="text-fg-muted">{ev.subject}:</span>{' '}
          {ev.beforeValue && ev.beforeValue !== ev.value ? (
            <span>
              <span className="line-through text-fg-muted">{ev.beforeValue}</span>{' '}
              <span className="text-accent">→</span>{' '}
              <span>{ev.value || '（已清空）'}</span>
            </span>
          ) : (
            <span>{ev.value || '—'}</span>
          )}
        </div>
        {ev.reason && <div className="mt-0.5 text-[11px] text-fg-muted break-all">「{ev.reason}」</div>}
      </div>
    </div>
  )
}

/** 时间线视图：展示偏好随时间演化的轨迹（v1.15 P2-1 Memory Timeline） */
export function TimelineView({ workspaceId }: { workspaceId: string }) {
  const [timeline, setTimeline] = useState<PreferenceTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    window.Memora.preference
      .timeline(workspaceId)
      .then((t) => setTimeline(t))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId])

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
  if (!timeline || timeline.byDay.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mb-3 flex justify-center opacity-30 text-accent">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M12 5v14" /></svg>
        </div>
        <p className="text-sm text-fg-secondary">还没有偏好演化记录</p>
        <p className="text-xs text-fg-muted mt-1">偏好的新增、更新、取代、归档会在这里形成时间线</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4">
        <div className="text-xs text-fg-muted mb-4">
          共 {timeline.total} 次变化——记忆是演化的，随时间沉淀与修正
        </div>
        <div className="space-y-4">
          {timeline.byDay.map((day) => (
            <div key={day.date}>
              <div className="text-[11px] font-semibold text-accent mb-1.5">{formatDay(day.date)}</div>
              <div className="pl-0">
                {day.events.map((ev) => (
                  <EventItem key={ev.id} ev={ev} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}