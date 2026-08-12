import { useState, useEffect, useCallback } from 'react'
import type { ConflictReport, Preference } from '@shared/types'
import { SOURCE_META, formatDate, confidenceColor } from './types'

interface ConflictResolutionViewProps {
  workspaceId: string
  onResolved?: () => void
}

/** 单条偏好的紧凑展示：值 + 置信度 + 来源 + 时间 */
function PreferenceSide({
  pref,
  tag,
  tagBadge
}: {
  pref: Preference
  tag: string
  tagBadge: string
}) {
  const conf = Math.max(0, Math.min(1, pref.confidence ?? 0))
  return (
    <div className="flex-1 min-w-0 rounded-md border border-border bg-bg-secondary/60 p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${tagBadge}`}>{tag}</span>
        <span className="px-1.5 py-0.5 rounded text-xs bg-bg-hover text-fg-muted">
          {SOURCE_META[pref.source] ?? pref.source}
        </span>
      </div>
      <p className="text-sm text-fg-primary break-words leading-snug mb-1.5">{pref.value}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-bg-hover overflow-hidden">
          <div
            className={`h-full rounded-full ${confidenceColor(conf)}`}
            style={{ width: `${Math.round(conf * 100)}%` }}
          />
        </div>
        <span className="text-xs text-fg-muted tabular-nums">{(conf * 100).toFixed(0)}%</span>
      </div>
      <p className="text-xs text-fg-muted mt-1.5">{formatDate(pref.createdAt)}</p>
    </div>
  )
}

/** 单个冲突项：A vs B + 三个操作按钮 + 内联合并表单 */
function ConflictItem({
  report,
  prefA,
  prefB,
  reason,
  onResolve,
  onMerge
}: {
  report: ConflictReport
  prefA: Preference
  prefB: Preference
  reason: string
  onResolve: (action: 'keepNew' | 'keepOld', prefA: Preference, prefB: Preference) => Promise<void>
  onMerge: (
    prefA: Preference,
    prefB: Preference,
    mergedValue: string,
    confidence: number
  ) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergedValue, setMergedValue] = useState('')
  const [mergedConf, setMergedConf] = useState(0.8)
  const [err, setErr] = useState<string | null>(null)

  async function run(action: 'keepNew' | 'keepOld') {
    setBusy(true)
    setErr(null)
    try {
      await onResolve(action, prefA, prefB)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function submitMerge() {
    if (!mergedValue.trim()) {
      setErr('合并后的值不能为空')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onMerge(prefA, prefB, mergedValue.trim(), mergedConf)
      setMerging(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-primary p-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-accent-muted text-accent">
          {report.subject}
        </span>
        <span className="text-xs text-fg-muted">冲突原因：{reason}</span>
      </div>

      <div className="flex items-stretch gap-2 mb-2.5">
        <PreferenceSide pref={prefA} tag="新的 (A)" tagBadge="bg-accent-muted text-accent" />
        <div className="flex items-center text-fg-muted text-xs">vs</div>
        <PreferenceSide pref={prefB} tag="旧的 (B)" tagBadge="bg-bg-hover text-fg-muted" />
      </div>

      {!merging ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => run('keepNew')}
            disabled={busy}
            className="Memora-btn Memora-btn-primary text-xs"
            title="归档旧的 (B)，保留新的 (A)"
          >
            保留新的
          </button>
          <button
            onClick={() => run('keepOld')}
            disabled={busy}
            className="Memora-btn Memora-btn-ghost text-xs"
            title="归档新的 (A)，保留旧的 (B)"
          >
            保留旧的
          </button>
          <button
            onClick={() => {
              setMergedValue(`${prefA.value} / ${prefB.value}`)
              setMerging(true)
              setErr(null)
            }}
            disabled={busy}
            className="Memora-btn Memora-btn-ghost text-xs"
            title="合并为一条新值"
          >
            合并
          </button>
          {busy && <span className="text-xs text-fg-muted">处理中…</span>}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-bg-secondary/60 p-2.5 space-y-2">
          <label className="block text-xs text-fg-secondary">合并后的值</label>
          <input
            type="text"
            value={mergedValue}
            onChange={(e) => setMergedValue(e.target.value)}
            className="Memora-input w-full text-xs"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-fg-secondary flex-shrink-0">置信度</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={mergedConf}
              onChange={(e) => setMergedConf(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs text-fg-muted tabular-nums w-8 text-right">
              {(mergedConf * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => {
                setMerging(false)
                setErr(null)
              }}
              disabled={busy}
              className="Memora-btn Memora-btn-ghost text-xs"
            >
              取消
            </button>
            <button
              onClick={submitMerge}
              disabled={busy}
              className="Memora-btn Memora-btn-primary text-xs"
            >
              {busy ? '保存中…' : '保存合并'}
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-red-500 mt-2 break-all">✗ {err}</p>}
    </div>
  )
}

/** 冲突解决视图：列出所有冲突，提供保留新/旧/合并操作 */
export function ConflictResolutionView({ workspaceId, onResolved }: ConflictResolutionViewProps) {
  const [reports, setReports] = useState<ConflictReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setReports([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await window.Memora.preference.conflicts(workspaceId)
      setReports(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** conflictKey 用于标识单个冲突项的 busy 状态 */
  function conflictKey(report: ConflictReport, prefA: Preference, prefB: Preference): string {
    return `${report.subject}::${prefA.id}::${prefB.id}`
  }

  async function handleResolve(
    action: 'keepNew' | 'keepOld',
    report: ConflictReport,
    prefA: Preference,
    prefB: Preference
  ) {
    const key = conflictKey(report, prefA, prefB)
    setBusyId(key)
    try {
      if (action === 'keepNew') {
        // 保留新的 (A)，归档旧的 (B)
        const archived = await window.Memora.preference.archive(prefB.id)
        if (!archived) throw new Error('归档旧的偏好失败：服务端返回空结果')
      } else {
        // 保留旧的 (B)，归档新的 (A)
        const archived = await window.Memora.preference.archive(prefA.id)
        if (!archived) throw new Error('归档新的偏好失败：服务端返回空结果')
      }
      await refresh()
      onResolved?.()
    } finally {
      setBusyId(null)
    }
  }

  async function handleMerge(
    report: ConflictReport,
    prefA: Preference,
    prefB: Preference,
    mergedValue: string,
    confidence: number
  ) {
    const key = conflictKey(report, prefA, prefB)
    setBusyId(key)
    try {
      // 将新值写入 preferenceA，并归档 preferenceB
      const updated = await window.Memora.preference.update(prefA.id, {
        value: mergedValue,
        confidence
      })
      if (!updated) throw new Error('合并更新失败：服务端返回空结果')
      await window.Memora.preference.archive(prefB.id)
      await refresh()
      onResolved?.()
    } finally {
      setBusyId(null)
    }
  }

  const totalConflicts = reports.reduce((sum, r) => sum + r.conflicts.length, 0)

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 text-sm text-fg-secondary py-16 justify-center">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>检测冲突中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-8">
          <p className="text-sm text-red-500 break-all">✗ {error}</p>
          <button onClick={refresh} className="Memora-btn Memora-btn-ghost text-xs mt-3">
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4 space-y-2.5">
        {totalConflicts === 0 ? (
          <div className="text-center py-16">
            <div className="mb-3 flex justify-center opacity-30 text-accent">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <p className="text-sm text-fg-secondary">没有检测到冲突</p>
            <p className="text-xs text-fg-muted mt-1">所有偏好记忆保持一致</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-fg-muted">
              共 {reports.length} 个类别，{totalConflicts} 处冲突待处理
            </p>
            {reports.flatMap((report) =>
              report.conflicts.map((c) => {
                const key = conflictKey(report, c.preferenceA, c.preferenceB)
                return (
                  <div key={key} className={busyId === key ? 'opacity-60 pointer-events-none' : ''}>
                    <ConflictItem
                      report={report}
                      prefA={c.preferenceA}
                      prefB={c.preferenceB}
                      reason={c.reason}
                      onResolve={(action, a, b) => handleResolve(action, report, a, b)}
                      onMerge={(a, b, v, conf) => handleMerge(report, a, b, v, conf)}
                    />
                  </div>
                )
              })
            )}
          </>
        )}
      </div>
    </div>
  )
}
