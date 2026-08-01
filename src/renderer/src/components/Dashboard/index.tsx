import { useEffect, useState } from 'react'
import { useStore } from '../../stores/appStore'
import { PROVIDER_META } from '@shared/constants'
import type { Provider, DashboardStats } from '@shared/types'

interface DashboardProps {
  onOpenImportCenter?: () => void
  onOpenAiSettings?: () => void
}

export function Dashboard({ onOpenImportCenter, onOpenAiSettings }: DashboardProps = {}) {
  const { setActiveSession, setActiveSessionData } = useStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.Memora.stats.get().then(setStats).catch(console.error).finally(() => setLoading(false))
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  async function handleOpenSession(id: string) {
    setActiveSession(id)
    const session = await window.Memora.session.get(id, true)
    setActiveSessionData(session)
  }

  if (loading) {
    return (
      <div className="flex-1 bg-bg-tertiary flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex-1 bg-bg-tertiary flex items-center justify-center text-fg-muted">
        加载失败
      </div>
    )
  }

  return (
    <div className="flex-1 bg-bg-tertiary overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-fg-primary mb-1">{greeting} 👋</h1>
          <p className="text-sm text-fg-muted">你的 AI 记忆库</p>
        </div>

        {/* 空状态引导：没有任何对话时引导用户导入 */}
        {stats.sessionCount === 0 && stats.messageCount === 0 && (
          <div className="bg-bg-primary border border-border rounded-lg p-8 mb-8 text-center">
            <div className="text-4xl mb-3 opacity-30">📥</div>
            <h2 className="text-base font-semibold text-fg-primary mb-1">还没有 AI 对话记录</h2>
            <p className="text-xs text-fg-muted mb-4">导入你与 AI 的对话，让它们变成可搜索的长期记忆</p>
            <div className="flex items-center justify-center gap-2">
              {onOpenImportCenter && (
                <button onClick={onOpenImportCenter} className="Memora-btn Memora-btn-primary text-xs">
                  📥 开始导入
                </button>
              )}
              {onOpenAiSettings && (
                <button onClick={onOpenAiSettings} className="Memora-btn Memora-btn-ghost text-xs">
                  ⚙️ 配置 AI
                </button>
              )}
            </div>
          </div>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon="💬" label="消息总数" value={stats.messageCount} color="text-blue-500" />
          <StatCard icon="📋" label="对话数" value={stats.sessionCount} color="text-green-500" />
          <StatCard icon="🔌" label="AI 平台" value={stats.providerCount} color="text-purple-500" />
          <StatCard icon="🧠" label="已索引" value={stats.indexedCount} color="text-orange-500" />
          <StatCard icon="🧠" label="偏好记忆" value={stats.preferenceCount} color="text-pink-500" />
          <StatCard icon="📌" label="决策" value={stats.decisionCount} color="text-indigo-500" />
          <StatCard icon="✅" label="任务" value={stats.taskCount} color="text-teal-500" />
        </div>

        {/* 平台分布 */}
        {stats.providerBreakdown.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3">平台分布</h2>
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
            <h2 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3">最近活动</h2>
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

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="bg-bg-primary border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-fg-muted">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
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
