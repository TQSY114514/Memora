import { memo } from 'react'
import type { Preference } from '@shared/types'
import { STATUS_META, SOURCE_META, formatDate, confidenceColor } from './types'

// memo + 回调参数化（传 pref 而非闭包捕获），父列表重渲染时未变化的卡片可直接复用
export const PreferenceCard = memo(function PreferenceCard({
  pref,
  onEdit,
  onArchive,
  onDelete,
  onExplain
}: {
  pref: Preference
  onEdit: (pref: Preference) => void
  onArchive: (pref: Preference) => void
  onDelete: (pref: Preference) => void
  onExplain: (pref: Preference) => void
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
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-accent-muted text-accent">
                  {pref.subject}
                </span>
              </div>
              <h3 className="text-sm font-medium text-fg-primary leading-snug break-words">
                {pref.value}
              </h3>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <button
                onClick={() => onExplain(pref)}
                className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                title="记忆溯源"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              </button>
              <button
                onClick={() => onEdit(pref)}
                className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                title="编辑值"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              </button>
              {pref.status !== 'archived' && (
                <button
                  onClick={() => onArchive(pref)}
                  className="text-fg-muted hover:text-yellow-500 text-xs px-1 py-0.5"
                  title="归档（遗忘）"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" /></svg>
                </button>
              )}
              <button
                onClick={() => onDelete(pref)}
                className="text-fg-muted hover:text-red-500 text-xs px-1 py-0.5"
                title="删除"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
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
            <span className="text-xs text-fg-muted flex-shrink-0 tabular-nums">
              {(conf * 100).toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-fg-muted">
            <span className={`px-1.5 py-0.5 rounded font-medium ${meta.badge}`}>
              {meta.label}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-bg-hover">
              {SOURCE_META[pref.source] ?? pref.source}
            </span>
            <span title="访问次数">{pref.accessCount ?? 0} 次</span>
            {pref.lastAccessedAt && (
              <span title="最后访问">{formatDate(pref.lastAccessedAt)}</span>
            )}
            <span title="创建时间">{formatDate(pref.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
})
