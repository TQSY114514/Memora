import { useState, useEffect, type ReactNode } from 'react'
import type { Preference, PreferenceStatus, ChatSession } from '@shared/types'
import { STATUS_META, SOURCE_META, formatDate, confidenceColor } from './types'

/** 状态变迁说明（记忆溯源用） */
const STATUS_EXPLAIN: Record<PreferenceStatus, string> = {
  active: '生效中：当前参与用户画像与记忆召回',
  superseded: '已被新偏好取代：同类别下出现了更新的偏好',
  archived: '已归档（遗忘）：不再参与记忆召回'
}

/** 绝对时间格式化：YYYY-MM-DD HH:mm */
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

/** 溯源抽屉中的键值行 */
function ExplainRow({
  label,
  children
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-fg-muted w-20 flex-shrink-0 text-[11px] flex items-center gap-1">
        {label}
      </span>
      <span className="text-[11px] text-fg-secondary break-all flex-1 min-w-0">{children}</span>
    </div>
  )
}

/** 记忆溯源抽屉：展示单条偏好的完整来源与生命周期信息 */
export function MemoryExplainDrawer({
  pref,
  onClose
}: {
  pref: Preference
  onClose: () => void
}) {
  const [session, setSession] = useState<ChatSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!pref.sessionId) return
    let cancelled = false
    setSessionLoading(true)
    setSessionError(null)
    setNotFound(false)
    window.Memora.session
      .get(pref.sessionId, false)
      .then((s) => {
        if (cancelled) return
        if (!s) setNotFound(true)
        setSession(s)
      })
      .catch((e) => {
        if (cancelled) return
        setSessionError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pref.sessionId])

  const conf = Math.max(0, Math.min(1, pref.confidence ?? 0))
  const meta = STATUS_META[pref.status]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between sticky top-0 bg-bg-primary z-10">
          <div className="flex items-center gap-2">
            <span className="text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          </span>
            <h3 className="text-sm font-semibold">记忆溯源</h3>
          </div>
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 基本信息 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              基本信息
            </h4>
            <div className="rounded-lg border border-border bg-bg-secondary/40 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
                  {pref.subject}
                </span>
              </div>
              <h3 className="text-sm font-medium text-fg-primary leading-snug break-words mb-2.5">
                {pref.value}
              </h3>
              {/* 置信度 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-fg-muted w-14 flex-shrink-0">置信度</span>
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
              {/* 状态 + 来源 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.badge}`}>
                  {meta.label}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-bg-hover text-fg-secondary">
                  {SOURCE_META[pref.source] ?? pref.source}
                </span>
              </div>
            </div>
          </section>

          {/* 状态变迁说明 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              状态说明
            </h4>
            <p className="text-[11px] text-fg-secondary leading-relaxed">
              {STATUS_EXPLAIN[pref.status]}
            </p>
            {pref.status === 'superseded' && pref.supersededBy && (
              <p className="text-[10px] text-fg-muted mt-1 break-all">
                取代者 ID：{pref.supersededBy}
              </p>
            )}
          </section>

          {/* 时间线 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1">
              时间线
            </h4>
            <div className="rounded-lg border border-border bg-bg-secondary/40 px-3 py-1">
              <ExplainRow label="提取时间">
                <span>{formatDate(pref.createdAt) || '—'}</span>
                {formatDateTime(pref.createdAt) && (
                  <span className="text-fg-muted"> · {formatDateTime(pref.createdAt)}</span>
                )}
              </ExplainRow>
              <ExplainRow label="更新时间">
                <span>{formatDate(pref.updatedAt) || '—'}</span>
                {formatDateTime(pref.updatedAt) && (
                  <span className="text-fg-muted"> · {formatDateTime(pref.updatedAt)}</span>
                )}
              </ExplainRow>
              <ExplainRow label="最后访问">
                {pref.lastAccessedAt ? (
                  <>
                    <span>{formatDate(pref.lastAccessedAt)}</span>
                    {formatDateTime(pref.lastAccessedAt) && (
                      <span className="text-fg-muted">
                        {' '}
                        · {formatDateTime(pref.lastAccessedAt)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-fg-muted">从未访问</span>
                )}
              </ExplainRow>
            </div>
          </section>

          {/* 访问统计 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              访问统计
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-fg-secondary">
              <span className="px-2 py-1 rounded bg-bg-hover">
                出现次数：{pref.accessCount ?? 0}
              </span>
            </div>
          </section>

          {/* 来源对话 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              来源对话
            </h4>
            {!pref.sessionId ? (
              <p className="text-[11px] text-fg-muted">无来源对话记录（手动创建的偏好）</p>
            ) : sessionLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-fg-secondary">
                <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span>加载来源对话…</span>
              </div>
            ) : sessionError ? (
              <p className="text-[11px] text-red-500 break-all">✗ {sessionError}</p>
            ) : notFound || !session ? (
              <p className="text-[11px] text-fg-muted break-all">
                来源对话已删除（ID：{pref.sessionId}）
              </p>
            ) : (
              <div className="rounded-lg border border-border bg-bg-secondary/40 p-3">
                <h3 className="text-sm font-medium text-fg-primary leading-snug break-words mb-1.5">
                  {session.title || '（无标题）'}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-fg-muted">
                  <span className="px-1.5 py-0.5 rounded bg-bg-hover">{session.provider}</span>
                  <span>{session.messageCount} 条消息</span>
                  <span>{formatDate(session.createdAt)}</span>
                </div>
                {session.description && (
                  <p className="text-[11px] text-fg-secondary mt-2 break-words">
                    {session.description}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
