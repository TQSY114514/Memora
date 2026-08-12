import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../../stores/appStore'
import { PROVIDER_META } from '@shared/constants'
import type { Provider, DashboardStats } from '@shared/types'

interface DashboardProps {
  onOpenImportCenter?: () => void
  onOpenAiSettings?: () => void
}

export function Dashboard({ onOpenImportCenter, onOpenAiSettings }: DashboardProps = {}) {
  const { setActiveSession, setActiveSessionData, dataVersion } = useStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(false)
      try {
        const s = await window.Memora.stats.get()
        if (!cancelled) setStats(s)
      } catch (e) {
        console.error(e)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [dataVersion])

  function handleRetry() {
    setLoading(true)
    setLoadError(false)
    window.Memora.stats
      .get()
      .then(setStats)
      .catch((e) => {
        console.error(e)
        setLoadError(true)
      })
      .finally(() => setLoading(false))
  }

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  async function handleOpenSession(id: string) {
    setActiveSession(id)
    const session = await window.Memora.session.get(id, false)
    setActiveSessionData(session)
  }

  async function handleManualImport() {
    const filePaths = await window.Memora.openFileDialog({
      multiple: true,
      filters: [
        { name: 'AI 对话文件', extensions: ['json', 'md', 'markdown', 'txt'] }
      ]
    })
    if (!filePaths || filePaths.length === 0) return

    let errorCount = 0
    for (const path of filePaths) {
      const result = await window.Memora.import.file(path, {})
      errorCount += result.errors.length
    }
    if (errorCount > 0) {
      alert(`导入完成，但有 ${errorCount} 处错误，请在导入中心查看详情`)
    }
    // 刷新统计
    window.Memora.stats.get().then(setStats).catch(console.error)
  }

  if (loading) {
    return (
      <div className="flex-1 bg-bg-tertiary overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
          <div className="space-y-2">
            <div className="Memora-skeleton h-7 w-40" />
            <div className="Memora-skeleton h-4 w-56" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="Memora-skeleton h-24" />
            <div className="Memora-skeleton h-24" />
            <div className="Memora-skeleton h-24" />
            <div className="Memora-skeleton h-24" />
          </div>
          <div className="Memora-skeleton h-32" />
        </div>
      </div>
    )
  }

  if (!stats || loadError) {
    return (
      <div className="flex-1 bg-bg-tertiary flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-fg-secondary">统计加载失败</p>
        <p className="text-xs text-fg-muted">请确认数据库可访问后重试</p>
        <button onClick={handleRetry} className="Memora-btn Memora-btn-ghost">重试</button>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-bg-tertiary overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-fg-primary mb-1">{greeting}</h1>
          <p className="text-sm text-fg-muted">你的 AI 记忆库</p>
        </div>

        {/* 空状态引导：没有任何对话时引导用户导入 */}
        {stats.sessionCount === 0 && stats.messageCount === 0 && (
          <div className="bg-bg-primary border border-border rounded-lg p-8 mb-8 text-center">
            <div className="mb-3 flex justify-center opacity-30 text-accent">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </div>
            <h2 className="text-base font-semibold text-fg-primary mb-1">还没有 AI 对话记录</h2>
            <p className="text-xs text-fg-muted mb-4">导入你与 AI 的对话，让它们变成可搜索的长期记忆</p>
            <div className="flex items-center justify-center gap-2">
              {onOpenImportCenter && (
                <button onClick={onOpenImportCenter} className="Memora-btn Memora-btn-primary">
                  开始导入
                </button>
              )}
              {onOpenAiSettings && (
                <button onClick={onOpenAiSettings} className="Memora-btn Memora-btn-ghost">
                  配置 AI
                </button>
              )}
            </div>
          </div>
        )}

        {/* 快捷入口 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <QuickAction
            icon={<IconImport />}
            title="导入中心"
            desc="检测本地 AI 应用，一键导入对话记录"
            onClick={onOpenImportCenter}
          />
          <QuickAction
            icon={<IconUpload />}
            title="手动导入"
            desc="选择 JSON / Markdown 文件导入对话"
            onClick={handleManualImport}
          />
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<IconMessage />} label="消息总数" value={stats.messageCount} />
          <StatCard icon={<IconFile />} label="对话数" value={stats.sessionCount} />
          <StatCard icon={<IconPlug />} label="AI 平台" value={stats.providerCount} />
          <StatCard icon={<IconBrain />} label="偏好记忆" value={stats.preferenceCount} />
        </div>

        {/* 平台分布 */}
        {stats.providerBreakdown.length > 0 && (
          <div className="mb-8">
            <h2 className="Memora-label mb-3">平台分布</h2>
            <div className="space-y-2">
              {stats.providerBreakdown.map(({ provider, count }) => {
                const meta = PROVIDER_META[provider as Provider] || PROVIDER_META.Unknown
                const pct = stats.sessionCount > 0 ? Math.round((count / stats.sessionCount) * 100) : 0
                return (
                  <div key={provider} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-24 truncate" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <div className="flex-1 h-2 bg-bg-hover rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                    </div>
                    <span className="text-xs text-fg-muted w-12 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 最近活动 */}
        {stats.recentSessions.length > 0 && (
          <div>
            <h2 className="Memora-label mb-3">最近活动</h2>
            <div className="space-y-2">
              {stats.recentSessions.map((session) => {
                const meta = PROVIDER_META[session.provider as Provider] || PROVIDER_META.Unknown
                return (
                  <button
                    key={session.id}
                    onClick={() => handleOpenSession(session.id)}
                    className="w-full text-left p-3 rounded-lg border border-border bg-bg-primary hover:bg-bg-hover transition-colors flex items-center gap-3"
                  >
                    <span
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                      style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg-primary truncate">{session.title}</p>
                      <p className="text-xs text-fg-muted">{session.messageCount} 条消息</p>
                    </div>
                    <span className="text-xs text-fg-muted flex-shrink-0">{formatDate(session.updatedAt)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="bg-bg-primary border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-accent">{icon}</span>
        <span className="text-xs text-fg-muted">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-fg-primary">{value.toLocaleString()}</p>
    </div>
  )
}

function QuickAction({ icon, title, desc, onClick }: { icon: ReactNode; title: string; desc: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-lg border border-border bg-bg-primary hover:bg-bg-hover transition-colors text-left"
    >
      <span className="text-accent flex-shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg-primary">{title}</span>
        <span className="block text-xs text-fg-muted truncate">{desc}</span>
      </span>
    </button>
  )
}

function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

function IconMessage() {
  return (
    <IconBase>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </IconBase>
  )
}

function IconFile() {
  return (
    <IconBase>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </IconBase>
  )
}

function IconPlug() {
  return (
    <IconBase>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </IconBase>
  )
}

function IconImport() {
  return (
    <IconBase>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </IconBase>
  )
}

function IconUpload() {
  return (
    <IconBase>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </IconBase>
  )
}

function IconBrain() {
  return (
    <IconBase>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M12 5v14" />
    </IconBase>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    if (days < 30) return `${Math.floor(days / 7)}周前`
    return `${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return ''
  }
}
