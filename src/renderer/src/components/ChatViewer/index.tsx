import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../../stores/appStore'
import { useAiConfigStore, isAiConfigured } from '../../stores/aiConfigStore'
import { PROVIDER_META } from '@shared/constants'
import type { Provider, Message, SessionSummary, RelatedSession } from '@shared/types'

interface ChatViewerProps {
  onOpenAiSettings: () => void
}

export function ChatViewer({ onOpenAiSettings }: ChatViewerProps) {
  const { activeSession, setActiveSessionData } = useStore()

  if (!activeSession) {
    return (
      <div className="flex-1 bg-bg-tertiary flex items-center justify-center text-fg-muted">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40">💬</div>
          <p className="text-sm">选择一段对话查看内容</p>
        </div>
      </div>
    )
  }

  return <ChatViewerContent onOpenAiSettings={onOpenAiSettings} />
}

function ChatViewerContent({ onOpenAiSettings }: { onOpenAiSettings: () => void }) {
  const { activeSession, setActiveSession, setActiveSessionData } = useStore()
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

  // 切换会话时加载总结和嵌入状态
  useEffect(() => {
    setSummary(null)
    setSummaryError(null)
    setShowSummary(false)
    setEmbedStatus(null)
    setEmbedError(null)
    setRelatedSessions([])
    setShowRelated(false)

    if (!session) return
    window.Memora.ai.getSummary(session.id).then(setSummary).catch(() => {})
    window.Memora.ai.getEmbedStatus(session.id).then(setEmbedStatus).catch(() => {})
  }, [session?.id])

  async function handleShare() {
    if (!session) return
    const html = await window.Memora.share.exportHtml(session.id)
    if (!html) return
    await window.Memora.saveFileDialog({
      defaultName: `${session.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.html`,
      content: html
    })
  }

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
      const result = await window.Memora.ai.generateSummary(session.id, config)
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
      await window.Memora.ai.embedSession(session.id, config)
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
    // 动态加载
    setShowRelated(true)
    try {
      const related = await window.Memora.memory.findRelated(session.id, { limit: 5 })
      setRelatedSessions(related)
    } catch {
      setRelatedSessions([])
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
            <button
              onClick={handleShare}
              className="Memora-btn Memora-btn-ghost text-xs"
              title="导出为自包含 HTML 分享"
            >
              ⤴ 分享
            </button>
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
            title="生成 AI 总结"
          >
            {summaryLoading ? '⏳ 总结中…' : summary ? '↻ 重新总结' : '✨ AI 总结'}
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
              {showSummary ? '▼ 隐藏总结' : '▶ 显示总结'}
            </button>
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

      {/* AI 总结面板 */}
      {summary && showSummary && (
        <div className="px-6 py-4 border-b border-border bg-accent-muted/30">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">
              AI 总结
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

      {/* 相关讨论推荐面板 */}
      {showRelated && (
        <div className="px-6 py-3 border-b border-border bg-bg-secondary/50">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">
              相关讨论
            </h3>
            {relatedSessions.length === 0 ? (
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

      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {messages.map((msg, idx) => (
            <MessageBubble key={msg.id || idx} message={msg} />
          ))}
        </div>
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
