import { useEffect, useRef, useState } from 'react'
import { useBgImportStore } from '../../stores/backgroundImportStore'
import type { BackgroundImportRunResult } from '@shared/types'

const PHASE_LABEL: Record<string, string> = {
  detecting: '检测中',
  extracting: '扒取中',
  importing: '导入中',
  idle: '空闲'
}

/**
 * 后台静默导入浮动指示器
 * 右下角非阻塞小卡片：运行中显示进度，完成后显示「+N 新对话」3 秒后淡出。
 */
export function BackgroundImportIndicator() {
  const status = useBgImportStore((s) => s.status)

  const [showDone, setShowDone] = useState(false)
  const [fading, setFading] = useState(false)
  const [doneResult, setDoneResult] = useState<BackgroundImportRunResult | null>(null)
  const prevLastRunAt = useRef<string | null>(null)

  // 监听 lastRunAt 变化 → 弹出完成卡片，2.7s 后淡出，3s 后卸载
  useEffect(() => {
    const cur = status?.lastRunAt ?? null
    if (!cur || cur === prevLastRunAt.current) {
      prevLastRunAt.current = cur
      return
    }
    prevLastRunAt.current = cur
    setDoneResult(status?.lastResult ?? null)
    setFading(false)
    setShowDone(true)
    const t1 = window.setTimeout(() => setFading(true), 2700)
    const t2 = window.setTimeout(() => setShowDone(false), 3000)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [status?.lastRunAt, status?.lastResult])

  const running = status?.running
  const progress = status?.currentProgress

  if (!running && !showDone) return null

  const doneAnim = fading
    ? 'animate-[fadeOut_0.3s_ease_forwards]'
    : 'animate-[fadeIn_0.2s_ease]'

  // ===== 运行中：进度卡片 =====
  if (running && progress) {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <div className="absolute bottom-4 right-4 z-50 bg-bg-primary border border-border rounded-lg shadow-lg p-3 min-w-[240px] max-w-[280px] animate-[fadeIn_0.2s_ease]">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2 h-2 rounded-full bg-accent Memora-pulse" />
          <span className="text-xs font-medium">
            {PHASE_LABEL[progress.phase] ?? progress.phase}
            {progress.provider ? ` · ${progress.provider}` : ''}
          </span>
        </div>
        <p className="text-xs text-fg-muted mb-2 truncate">{progress.message}</p>
        {progress.total > 0 && (
          <div className="h-1 rounded-full bg-bg-hover overflow-hidden">
            <div
              className="h-full bg-accent transition-colors duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    )
  }

  // ===== 完成：结果卡片 =====
  if (showDone && doneResult) {
    const r = doneResult
    const noChange = r.imported === 0 && r.skipped === 0 && r.failed === 0
    return (
      <div className={`absolute bottom-4 right-4 z-50 bg-bg-primary border border-border rounded-lg shadow-lg p-3 min-w-[240px] max-w-[280px] ${doneAnim}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium">
            {noChange ? '后台导入完成（无新对话）' : '后台导入完成'}
          </span>
        </div>
        <div className="text-xs space-y-0.5">
          {r.imported > 0 && <p className="text-green-600">+{r.imported} 新对话</p>}
          {r.skipped > 0 && <p className="text-fg-muted">⊘ 跳过 {r.skipped}（重复）</p>}
          {r.failed > 0 && <p className="text-red-500">✗ 失败 {r.failed}</p>}
          {r.errors.length > 0 && (
            <p className="text-red-500 text-xs truncate" title={r.errors.join('\n')}>
              {r.errors[0]}
            </p>
          )}
          <p className="text-xs text-fg-muted">耗时 {(r.durationMs / 1000).toFixed(1)}s</p>
        </div>
      </div>
    )
  }

  return null
}
