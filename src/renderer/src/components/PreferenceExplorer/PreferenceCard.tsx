import type { Preference } from '@shared/types'
import { STATUS_META, SOURCE_META, formatDate, confidenceColor } from './types'

export function PreferenceCard({
  pref,
  onEdit,
  onArchive,
  onDelete,
  onExplain
}: {
  pref: Preference
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onExplain: () => void
}) {
  const meta = STATUS_META[pref.status]
  const isInactive = pref.status !== 'active'
  const conf = Math.max(0, Math.min(1, pref.confidence ?? 0))

  return (
    <div
      className={`rounded-lg border border-border bg-bg-primary p-3.5 transition-colors hover:border-accent/40 ${
        isInactive ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
                  {pref.subject}
                </span>
              </div>
              <h3 className="text-sm font-medium text-fg-primary leading-snug break-words">
                {pref.value}
              </h3>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <button
                onClick={onExplain}
                className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                title="记忆溯源"
              >
                🔍
              </button>
              <button
                onClick={onEdit}
                className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                title="编辑值"
              >
                ✎
              </button>
              {pref.status !== 'archived' && (
                <button
                  onClick={onArchive}
                  className="text-fg-muted hover:text-yellow-500 text-xs px-1 py-0.5"
                  title="归档（遗忘）"
                >
                  🗇
                </button>
              )}
              <button
                onClick={onDelete}
                className="text-fg-muted hover:text-red-500 text-xs px-1 py-0.5"
                title="删除"
              >
                🗑
              </button>
            </div>
          </div>

          {/* 置信度条 */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-bg-hover overflow-hidden">
              <div
                className={`h-full rounded-full ${confidenceColor(conf)}`}
                style={{ width: `${Math.round(conf * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-fg-muted flex-shrink-0 tabular-nums">
              {(conf * 100).toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px] text-fg-muted">
            <span className={`px-1.5 py-0.5 rounded font-medium ${meta.badge}`}>
              {meta.label}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-bg-hover">
              {SOURCE_META[pref.source] ?? pref.source}
            </span>
            <span title="访问次数">↻ {pref.accessCount ?? 0}</span>
            {pref.lastAccessedAt && (
              <span title="最后访问">⏱ {formatDate(pref.lastAccessedAt)}</span>
            )}
            <span title="创建时间">📅 {formatDate(pref.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
