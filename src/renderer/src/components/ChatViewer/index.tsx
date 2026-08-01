import { useEffect, useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../../stores/appStore'
import { useAiConfigStore, isAiConfigured, getActiveAiConfig } from '../../stores/aiConfigStore'
import { PROVIDER_META } from '@shared/constants'
import type { Provider, Message, SessionSummary, RelatedSession } from '@shared/types'
import { Dashboard } from '../Dashboard'
import { ExportMenu } from './ExportMenu'

interface ChatViewerProps {
  onOpenAiSettings: () => void
  onOpenImportCenter?: () => void
}

export function ChatViewer({ onOpenAiSettings, onOpenImportCenter }: ChatViewerProps) {
  // selector 订阅：仅 activeSession 变化才重渲染，避免搜索击键等无关 state 触发 ReactMarkdown 重解析
  const activeSession = useStore((s) => s.activeSession)

  if (!activeSession) {
    return <Dashboard onOpenImportCenter={onOpenImportCenter} onOpenAiSettings={onOpenAiSettings} />
  }

  return <ChatViewerContent onOpenAiSettings={onOpenAiSettings} />
}

function ChatViewerContent({ onOpenAiSettings }: { onOpenAiSettings: () => void }) {
  // selector 订阅：仅 activeSession 变化才重渲染，搜索击键不再触发 ReactMarkdown 重解析
  const activeSession = useStore((s) => s.activeSession)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const setActiveSessionData = useStore((s) => s.setActiveSessionData)
  const { config } = useAiConfigStore()

  const session = activeSession!
  const meta = PROVIDER_META[session.provider as Provider] || PROVIDER_META.Unknown
  const messages = session.messages || []
  const aiConfigured = isAiConfigured(config)

  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  const [embedStatus, setEmbedStatus] = useState<{ total: number; embedded: number; complete: boolean } | null>(null)
  const [embedLoading, setEmbedLoading] = useState(false)
  const [embedError, setEmbedError] = useState<string | null>(null)

  const [relatedSessions, setRelatedSessions] = useState<RelatedSession[]>([])
  const [showRelated, setShowRelated] = useState(false)
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [editSummaryText, setEditSummaryText] = useState('')
  const [editKeyPoints, setEditKeyPoints] = useState('')
  const [editTodos, setEditTodos] = useState('')
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)

  // 虚拟列表
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200, // 消息高度差异大，初始估值 200，动态测量修正
    overscan: 4
  })

  // 切换会话时加载总结和嵌入状态，并滚动到顶部
  useEffect(() => {
    setSummary(null)
    setSummaryError(null)
    setShowSummary(false)
    setEmbedStatus(null)
    setEmbedError(null)
    setRelatedSessions([])
    setShowRelated(false)
    setExtractMsg(null)

    if (!session) return
    // 用 cancelled 标志避免快速切换会话时旧请求覆盖新会话状态（race condition）
    let cancelled = false
    window.Memora.ai.getSummary(session.id).then((s) => { if (!cancelled) setSummary(s) }).catch((e) => { if (!cancelled) console.warn('[ChatViewer] 加载总结失败:', e) })
    window.Memora.ai.getEmbedStatus(session.id).then((s) => { if (!cancelled) setEmbedStatus(s) }).catch((e) => { if (!cancelled) console.warn('[ChatViewer] 加载嵌入状态失败:', e) })
    // 切换会话时滚动到顶部
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    return () => { cancelled = true }
  }, [session?.id])

  async function handleToggleFavorite() {
    if (!session) return
    await window.Memora.session.toggleFavorite(session.id)
    const updated = await window.Memora.session.get(session.id, true)
    setActiveSessionData(updated)
  }

  async function handleGenerateSummary() {
    if (!session) return
    if (!aiConfigured) {
      onOpenAiSettings()
      return
    }
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const result = await window.Memora.ai.generateSummary(session.id, getActiveAiConfig())
      setSummary(result)
      setShowSummary(true)
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e))
    } finally {
      setSummaryLoading(false)
    }
  }

  async function handleEmbed() {
    if (!session) return
    if (!aiConfigured) {
      onOpenAiSettings()
      return
    }
    setEmbedLoading(true)
    setEmbedError(null)
    try {
      await window.Memora.ai.embedSession(session.id, getActiveAiConfig())
      const status = await window.Memora.ai.getEmbedStatus(session.id)
      setEmbedStatus(status)
    } catch (e) {
      setEmbedError(e instanceof Error ? e.message : String(e))
    } finally {
      setEmbedLoading(false)
    }
  }

  async function handleExportKnowledge() {
    if (!session) return
    const md = await window.Memora.ai.generateKnowledgeMd(session.id)
    await window.Memora.saveFileDialog({
      defaultName: `${session.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.md`,
      content: md
    })
  }

  async function handleExtractToKnowledge() {
    if (!session) return
    setExtractLoading(true)
    setExtractMsg(null)
    try {
      const result = await window.Memora.knowledge.extractFromSession(session.id)
      setExtractMsg(`✓ 已提炼 ${result.created} 条到知识库`)
    } catch (e) {
      setExtractMsg(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExtractLoading(false)
    }
  }

  function handleEditSummary() {
    if (!summary) return
    setEditSummaryText(summary.summary)
    setEditKeyPoints(summary.keyPoints.join('\n'))
    setEditTodos(summary.todos.join('\n'))
    setEditingSummary(true)
  }

  async function handleSaveSummary() {
    if (!session) return
    try {
      const updated = await window.Memora.ai.updateSummary(session.id, {
        summary: editSummaryText,
        keyPoints: editKeyPoints.split('\n').map(s => s.trim()).filter(Boolean),
        todos: editTodos.split('\n').map(s => s.trim()).filter(Boolean)
      })
      setSummary(updated)
      setEditingSummary(false)
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteSummary() {
    if (!session) return
    if (!confirm('确定删除这份蒸馏记录？')) return
    try {
      await window.Memora.ai.deleteSummary(session.id)
      setSummary(null)
      setShowSummary(false)
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleLoadRelated() {
    if (!session) return
    if (showRelated) {
      setShowRelated(false)
      return
    }
    if (relatedSessions.length > 0) {
      setShowRelated(true)
      return
    }
    setShowRelated(true)
    setRelatedLoading(true)
    try {
      const related = await window.Memora.memory.findRelated(session.id, { limit: 5 })
      setRelatedSessions(related)
    } catch (e) {
      setRelatedSessions([])
      console.warn('[ChatViewer] 加载相关讨论失败:', e)
    } finally {
      setRelatedLoading(false)
    }
  }

  return (
    <div className="flex-1 bg-bg-tertiary flex flex-col h-full overflow-hidden">
      {/* 顶部元信息 */}
      <header className="px-6 py-3 border-b border-border bg-bg-primary">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-base font-semibold text-fg-primary">{session.title}</h1>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleToggleFavorite}
              className="Memora-btn Memora-btn-ghost text-xs"
              title={session.isFavorite ? '取消收藏' : '收藏'}
            >
              {session.isFavorite ? '★ 已收藏' : '☆ 收藏'}
            </button>
            <ExportMenu session={session} />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-fg-muted">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
          >
            {meta.label}
          </span>
          {session.model && <span>模型: {session.model}</span>}
          <span>📅 {new Date(session.createdAt).toLocaleDateString('zh-CN')}</span>
          <span>💬 {messages.length} 条消息</span>
          {session.tags.length > 0 && (
            <span className="flex items-center gap-1">
              {session.tags.map((t) => (
                <span key={t.id} className="px-1.5 py-0.5 bg-bg-hover rounded">
                  {t.name}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* AI 工具栏 */}
        <div className="flex items-center gap-1 mt-2 -mx-1">
          <button
            onClick={handleGenerateSummary}
            disabled={summaryLoading}
            className="Memora-btn Memora-btn-ghost text-xs"
            title="蒸馏对话为知识要点"
          >
            {summaryLoading ? '⏳ 蒸馏中…' : summary ? '↻ 重新蒸馏' : '✨ 记忆蒸馏'}
          </button>
          <button
            onClick={handleEmbed}
            disabled={embedLoading}
            className="Memora-btn Memora-btn-ghost text-xs"
            title="建立向量索引（用于语义搜索）"
          >
            {embedLoading
              ? '⏳ 索引中…'
              : embedStatus?.complete
              ? '✓ 已索引'
              : '🧠 建立向量索引'}
          </button>
          {summary && (
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="Memora-btn Memora-btn-ghost text-xs"
            >
              {showSummary ? '▼ 隐藏蒸馏' : '▶ 显示蒸馏'}
            </button>
          )}
          {summary && showSummary && (
            <>
              <button
                onClick={handleEditSummary}
                className="Memora-btn Memora-btn-ghost text-xs"
                title="编辑总结"
              >
                ✎ 编辑
              </button>
              <button
                onClick={handleDeleteSummary}
                className="Memora-btn Memora-btn-ghost text-xs text-red-500"
                title="删除蒸馏"
              >
                🗑 删除
              </button>
            </>
          )}
          {summary && (
            <button
              onClick={handleExportKnowledge}
              className="Memora-btn Memora-btn-ghost text-xs"
              title="导出 knowledge.md"
            >
              ⬇ knowledge.md
            </button>
          )}
          {summary && (
            <button
              onClick={handleExtractToKnowledge}
              disabled={extractLoading}
              className="Memora-btn Memora-btn-ghost text-xs"
              title="把本次蒸馏的要点/待办/知识提炼为知识库条目（幂等）"
            >
              {extractLoading ? '⏳ 提炼中…' : '📥 提炼到知识库'}
            </button>
          )}
          {extractMsg && (
            <span className={`text-[10px] ${extractMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
              {extractMsg}
            </span>
          )}
          <button
            onClick={handleLoadRelated}
            className="Memora-btn Memora-btn-ghost text-xs"
            title="基于向量相似度推荐相关对话"
          >
            {showRelated ? '▼ 相关讨论' : '▶ 相关讨论'}
          </button>
          {embedStatus && !embedStatus.complete && (
            <span className="text-[10px] text-fg-muted ml-1">
              索引 {embedStatus.embedded}/{embedStatus.total}
            </span>
          )}
        </div>

        {summaryError && (
          <p className="text-xs text-red-500 mt-1.5 break-all">✗ {summaryError}</p>
        )}
        {embedError && (
          <p className="text-xs text-red-500 mt-1.5 break-all">✗ {embedError}</p>
        )}
      </header>

      {/* 记忆蒸馏面板 */}
      {summary && showSummary && !editingSummary && (
        <div className="px-6 py-4 border-b border-border bg-accent-muted/30">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">
              记忆蒸馏
              {summary.model && (
                <span className="ml-2 text-fg-muted normal-case font-normal">
                  · {summary.model}
                </span>
              )}
            </h3>
            <p className="text-sm text-fg-primary leading-relaxed mb-3 whitespace-pre-wrap">
              {summary.summary}
            </p>
            {summary.keyPoints.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-fg-secondary mb-1">关键要点</p>
                <ul className="text-sm text-fg-primary space-y-0.5">
                  {summary.keyPoints.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.todos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-fg-secondary mb-1">待办事项</p>
                <ul className="text-sm text-fg-primary space-y-0.5">
                  {summary.todos.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent">☐</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 记忆蒸馏编辑面板 */}
      {summary && showSummary && editingSummary && (
        <div className="px-6 py-4 border-b border-border bg-accent-muted/30">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">编辑蒸馏</h3>
            <textarea
              value={editSummaryText}
              onChange={(e) => setEditSummaryText(e.target.value)}
              className="Memora-input w-full text-sm mb-2"
              rows={4}
              placeholder="总结内容"
            />
            <label className="block text-[10px] text-fg-muted mb-1">关键要点（每行一条）</label>
            <textarea
              value={editKeyPoints}
              onChange={(e) => setEditKeyPoints(e.target.value)}
              className="Memora-input w-full text-sm mb-2"
              rows={3}
            />
            <label className="block text-[10px] text-fg-muted mb-1">待办事项（每行一条）</label>
            <textarea
              value={editTodos}
              onChange={(e) => setEditTodos(e.target.value)}
              className="Memora-input w-full text-sm mb-2"
              rows={3}
            />
            <div className="flex gap-2">
              <button onClick={handleSaveSummary} className="Memora-btn Memora-btn-primary text-xs">保存</button>
              <button onClick={() => setEditingSummary(false)} className="Memora-btn Memora-btn-ghost text-xs">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 相关讨论推荐面板 */}
      {showRelated && (
        <div className="px-6 py-3 border-b border-border bg-bg-secondary/50">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">
              相关讨论
            </h3>
            {relatedLoading ? (
              <p className="text-xs text-fg-muted py-2">加载中…</p>
            ) : relatedSessions.length === 0 ? (
              <p className="text-xs text-fg-muted py-2">
                暂无相关讨论。需要先为本对话和其他对话建立向量索引。
              </p>
            ) : (
              <div className="space-y-1.5">
                {relatedSessions.map((r, i) => {
                  const rMeta = PROVIDER_META[r.session.provider as Provider] || PROVIDER_META.Unknown
                  return (
                    <button
                      key={i}
                      onClick={async () => {
                        setActiveSession(r.session.id)
                        const s = await window.Memora.session.get(r.session.id, true)
                        setActiveSessionData(s)
                      }}
                      className="w-full text-left p-2 rounded-md border border-border hover:bg-bg-hover transition-colors flex items-start gap-2"
                    >
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: `${rMeta.color}20`, color: rMeta.color }}
                      >
                        {rMeta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-fg-primary truncate">{r.session.title}</p>
                        {r.reason && (
                          <p className="text-[10px] text-fg-muted truncate mt-0.5">{r.reason}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-fg-muted flex-shrink-0 mt-0.5">
                        {(r.score * 100).toFixed(0)}%
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 消息流（虚拟滚动） */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fg-muted">此对话没有消息</div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const msg = messages[virtualItem.index]
              return (
                <div
                  key={msg.id || virtualItem.index}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`
                  }}
                >
                  <div className="max-w-3xl mx-auto px-6 py-3">
                    <MessageBubble message={msg} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const roleLabel = isUser ? '你' : isSystem ? '系统' : 'AI'
  const containerClass = isUser
    ? 'bg-accent-muted border-accent/20'
    : isSystem
    ? 'bg-transparent border-dashed border-border text-fg-muted'
    : 'bg-bg-primary border-border'

  return (
    <article className={`rounded-lg border p-4 ${containerClass}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {roleLabel}
        </span>
        {message.model && (
          <span className="text-xs text-fg-muted opacity-70">{message.model}</span>
        )}
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none text-fg-primary">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ node, className, children, ...props }) => (
              <code className={`px-1 py-0.5 rounded text-xs ${className ?? ''}`} {...props}>
                {children}
              </code>
            ),
            pre: ({ node, children, ...props }) => (
              <pre
                className="bg-bg-primary dark:bg-black/40 rounded-md p-3 overflow-x-auto my-2 text-xs"
                {...props}
              >
                {children}
              </pre>
            )
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </article>
  )
}
