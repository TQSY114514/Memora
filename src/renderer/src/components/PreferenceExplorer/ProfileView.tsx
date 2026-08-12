import { useState, useEffect } from 'react'
import type { Preference, UserProfile } from '@shared/types'
import { STATUS_META } from './types'

/** 画像视图：按 subject 分组展示偏好（调用 preference.profile） */
export function ProfileView({
  workspaceId,
  onEdit
}: {
  workspaceId: string
  onEdit: (pref: Preference) => void
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    window.Memora.preference
      .profile(workspaceId)
      .then((p) => setProfile(p))
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
  if (!profile || profile.bySubject.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mb-3 flex justify-center opacity-30 text-accent">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M12 5v14" /></svg>
        </div>
        <p className="text-sm text-fg-secondary">还没有偏好数据，无法生成画像</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
        <div className="text-xs text-fg-muted">
          共 {profile.totalPreferences} 条偏好，生效中 {profile.activePreferences} 条
        </div>
        {profile.bySubject.map((group) => (
          <div
            key={group.subject}
            className="rounded-lg border border-border bg-bg-primary p-3.5"
          >
            <h3 className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">
              {group.subject}
            </h3>
            <div className="space-y-1.5">
              {group.preferences.map((p) => {
                const conf = Math.max(0, Math.min(1, p.confidence ?? 0))
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <button
                      onClick={() => onEdit(p)}
                      className="text-fg-primary hover:text-accent text-left break-all"
                      title="编辑"
                    >
                      {p.value}
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-fg-muted tabular-nums">
                        {(conf * 100).toFixed(0)}%
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          STATUS_META[p.status].badge
                        }`}
                      >
                        {STATUS_META[p.status].label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
