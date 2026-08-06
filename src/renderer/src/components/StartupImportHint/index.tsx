import { useEffect, useState } from 'react'
import type { DetectedApp } from '@shared/types'

const DISMISS_KEY = 'memora:startup-import-hint-dismissed'

/**
 * 启动时自动检测已安装的 AI 应用，弹轻量导入提示
 *
 * 仅当：
 * - 存在 canExtract=true 的应用（Cursor/ClaudeCode/OpenCode/Windsurf/Cline）
 * - 用户此前未关闭过该提示（localStorage 标记）
 *
 * 非阻塞：右下角小卡片，点击「导入」打开导入中心，「稍后」永久关闭。
 */
export function StartupImportHint({ onOpenImportCenter }: { onOpenImportCenter: () => void }) {
  const [apps, setApps] = useState<DetectedApp[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    let cancelled = false
    window.Memora.scanner
      .detectApps()
      .then((result) => {
        if (cancelled) return
        // 仅可扒取的应用才提示
        const extractable = result.filter((a) => a.canExtract && a.installed)
        if (extractable.length > 0) {
          setApps(extractable)
          setVisible(true)
        }
      })
      .catch(() => {
        // 检测失败静默忽略，不打扰用户
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleImport() {
    setVisible(false)
    onOpenImportCenter()
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  const names = apps.map((a) => a.name).join(' · ')

  return (
    <div className="absolute bottom-4 right-4 z-40 bg-bg-primary border border-border rounded-lg shadow-lg p-4 min-w-[300px] max-w-[360px]">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-accent leading-none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fg-primary">检测到已安装的 AI 应用</p>
          <p className="text-xs text-fg-muted mt-0.5 truncate" title={names}>
            {names}
          </p>
        </div>
      </div>
      <p className="text-xs text-fg-muted mb-3">一键扒取本地对话记录，导入到 Memora 知识库。</p>
      <div className="flex gap-2">
        <button
          onClick={handleImport}
          className="Memora-btn Memora-btn-primary text-xs flex-1"
        >
          导入
        </button>
        <button
          onClick={handleDismiss}
          className="Memora-btn Memora-btn-ghost text-xs"
        >
          稍后
        </button>
      </div>
    </div>
  )
}
