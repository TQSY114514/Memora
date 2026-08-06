import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../stores/appStore'

interface MemoryAgentPanelProps {
  onClose: () => void
}

interface AgentStatus {
  running: boolean
  intervalMinutes: number
  lastScanAt: string | null
  nextScanAt: string | null
  gapsFound: number
  reviewItems: number
}

interface KnowledgeGap {
  entryId: string
  entryTitle: string
  gapType: string
  description: string
  severity: string
  suggestion: string
}

interface ReviewItem {
  entryId: string
  entryTitle: string
  entryType: string
  daysSinceLastReview: number
  priority: string
  reason: string
}

const GAP_TYPE_LABELS: Record<string, string> = {
  missing_connection: '缺少关联',
  stale_knowledge: '陈旧知识',
  orphan_entry: '孤立条目',
  sparse_topic: '知识稀疏'
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/15 text-red-500',
  medium: 'bg-orange-500/15 text-orange-500',
  low: 'bg-blue-500/15 text-blue-500'
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-orange-500',
  low: 'text-blue-500'
}

export function MemoryAgentPanel({ onClose }: MemoryAgentPanelProps) {
  const { activeWorkspaceId } = useStore()
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [gaps, setGaps] = useState<KnowledgeGap[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [activeTab, setActiveTab] = useState<'gaps' | 'review'>('gaps')
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await window.Memora.memoryAgent.status()
      setStatus(s)
    } catch {
      // ignore
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, r, s] = await Promise.all([
        window.Memora.memoryAgent.scan(activeWorkspaceId ?? undefined),
        window.Memora.memoryAgent.reviewQueue(activeWorkspaceId ?? undefined),
        window.Memora.memoryAgent.status()
      ])
      setGaps(g)
      setReviewQueue(r)
      setStatus(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 定期刷新状态
  useEffect(() => {
    const timer = setInterval(loadStatus, 5000)
    return () => clearInterval(timer)
  }, [loadStatus])

  async function handleScan() {
    setScanning(true)
    setError(null)
    try {
      const [g, r, s] = await Promise.all([
        window.Memora.memoryAgent.scan(activeWorkspaceId ?? undefined),
        window.Memora.memoryAgent.reviewQueue(activeWorkspaceId ?? undefined),
        window.Memora.memoryAgent.status()
      ])
      setGaps(g)
      setReviewQueue(r)
      setStatus(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  async function handleToggleAgent() {
    try {
      if (status?.running) {
        const s = await window.Memora.memoryAgent.stop()
        setStatus(s)
      } else {
        const s = await window.Memora.memoryAgent.start(60)
        setStatus(s)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">记忆智能体</h3>
            <p className="text-[10px] text-fg-muted mt-0.5">主动发现知识缺口 · 间隔重复提醒</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {/* 状态栏 + 操作 */}
        <div className="px-5 py-3 border-b border-border bg-bg-secondary/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-xs text-fg-secondary">
                {status?.running ? '运行中' : '已停止'}
              </span>
              {status?.running && status.nextScanAt && (
                <span className="text-[10px] text-fg-muted">
                  下次扫描: {new Date(status.nextScanAt).toLocaleTimeString('zh-CN')}
                </span>
              )}
              {status?.lastScanAt && (
                <span className="text-[10px] text-fg-muted">
                  上次扫描: {new Date(status.lastScanAt).toLocaleTimeString('zh-CN')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleScan}
                disabled={scanning}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                {scanning ? '扫描中…' : '立即扫描'}
              </button>
              <button
                onClick={handleToggleAgent}
                className={`Memora-btn text-xs ${status?.running ? 'Memora-btn-ghost' : 'Memora-btn-primary'}`}
              >
                {status?.running ? '停止' : '启动定期扫描'}
              </button>
            </div>
          </div>
        </div>

        {/* 标签切换 */}
        <div className="flex items-center border-b border-border">
          <button
            onClick={() => setActiveTab('gaps')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'gaps'
                ? 'text-accent border-b-2 border-accent'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            知识缺口 ({gaps.length})
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'review'
                ? 'text-accent border-b-2 border-accent'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            待复习 ({reviewQueue.length})
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <div className="p-5 text-center text-red-500 text-sm">{error}</div>}

          {!loading && !error && activeTab === 'gaps' && (
            <div className="p-4">
              {gaps.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mb-2 opacity-30 text-emerald-500">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
                  </div>
                  <p className="text-sm text-fg-muted">未发现知识缺口</p>
                  <p className="text-xs text-fg-muted mt-1">知识库状态良好</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {gaps.map((gap, idx) => (
                    <div key={idx} className="border border-border rounded-lg bg-bg-secondary p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{gap.entryTitle || '全局'}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${SEVERITY_COLORS[gap.severity] ?? ''}`}>
                              {gap.severity === 'high' ? '高' : gap.severity === 'medium' ? '中' : '低'}
                            </span>
                            <span className="text-[10px] text-fg-muted">
                              {GAP_TYPE_LABELS[gap.gapType] ?? gap.gapType}
                            </span>
                          </div>
                          <p className="text-xs text-fg-secondary">{gap.description}</p>
                          <p className="text-[10px] text-accent mt-1">{gap.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'review' && (
            <div className="p-4">
              {reviewQueue.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mb-2 opacity-30 text-accent">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                  </div>
                  <p className="text-sm text-fg-muted">暂无待复习条目</p>
                  <p className="text-xs text-fg-muted mt-1">所有知识条目都较新，无需复习</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {reviewQueue.slice(0, 30).map((item) => (
                    <div key={item.entryId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-secondary border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-medium ${PRIORITY_COLORS[item.priority] ?? ''}`}>
                          {item.priority === 'high' ? '!!' : item.priority === 'medium' ? '!' : '·'}
                        </span>
                        <span className="text-xs truncate">{item.entryTitle}</span>
                        <span className="text-[10px] text-fg-muted flex-shrink-0">
                          {item.daysSinceLastReview}天前
                        </span>
                      </div>
                      <span className="text-[10px] text-fg-muted ml-2 flex-shrink-0">{item.reason}</span>
                    </div>
                  ))}
                  {reviewQueue.length > 30 && (
                    <p className="text-center text-[10px] text-fg-muted py-2">
                      还有 {reviewQueue.length - 30} 条待复习...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}