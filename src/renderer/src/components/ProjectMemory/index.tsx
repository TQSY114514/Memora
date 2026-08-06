import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAiConfigStore, isAiConfigured, getActiveAiConfig } from '../../stores/aiConfigStore'
import { useStore } from '../../stores/appStore'
import { PROVIDER_META } from '@shared/constants'
import type { Provider, ProjectMemoryAnswer } from '@shared/types'

interface ProjectMemoryPanelProps {
  onClose: () => void
}

/**
 * Project Memory 智能问答面板
 * 基于 RAG：把问题向量化 → 检索相关对话片段 → LLM 生成答案
 */
export function ProjectMemoryPanel({ onClose }: ProjectMemoryPanelProps) {
  const { config } = useAiConfigStore()
  const { setActiveSession, setActiveSessionData } = useStore()
  const aiConfigured = isAiConfigured(config)

  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<ProjectMemoryAnswer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ProjectMemoryAnswer[]>([])

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleAsk(e?: React.FormEvent) {
    e?.preventDefault()
    const q = question.trim()
    if (!q || loading) return
    if (!aiConfigured) {
      setError('请先配置 AI（点击左上角 ⚙ AI）')
      return
    }

    setLoading(true)
    setError(null)
    setQuestion('')

    try {
      const result = await window.Memora.memory.ask(q, getActiveAiConfig(), { topK: 8, threshold: 0.2 })
      setAnswer(result)
      setHistory((h) => [result, ...h].slice(0, 20))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenSession(sessionId: string) {
    setActiveSession(sessionId)
    const session = await window.Memora.session.get(sessionId, false)
    setActiveSessionData(session)
    onClose()
  }

  return (
    <div className="flex flex-col h-full bg-bg-tertiary">
      {/* 顶部 */}
      <header className="px-5 py-3 border-b border-border bg-bg-primary flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🧠</span>
          <div>
            <h2 className="text-sm font-semibold">Project Memory</h2>
            <p className="text-[10px] text-fg-muted">基于历史对话的智能问答</p>
          </div>
        </div>
        <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
          ✕
        </button>
      </header>

      {/* 问答区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-5 space-y-4">
          {/* 空状态引导 */}
          {!answer && !loading && !error && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3 opacity-40">🧠</div>
              <p className="text-sm text-fg-secondary mb-1">问任何关于你项目的问题</p>
              <p className="text-xs text-fg-muted mb-6">
                Memora 会从你的历史 AI 对话中检索相关内容并回答
              </p>
              <div className="flex flex-col gap-2 max-w-md mx-auto">
                {[
                  '这个项目为什么用 SQLite？',
                  '之前讨论过哪些架构方案？',
                  '导入器是怎么设计的？',
                  '语义搜索的实现思路是什么？'
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setQuestion(s)}
                    className="text-left px-3 py-2 rounded-md bg-bg-hover hover:bg-accent-muted text-xs text-fg-secondary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 加载中 */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-fg-secondary">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>正在检索历史对话...</span>
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-500 break-all">{error}</p>
            </div>
          )}

          {/* 当前答案 */}
          {answer && !loading && (
            <AnswerCard answer={answer} onOpenSession={handleOpenSession} />
          )}

          {/* 历史记录 */}
          {history.length > 1 && (
            <div className="pt-4 border-t border-border">
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">
                历史问答
              </p>
              {history.slice(1).map((h, i) => (
                <button
                  key={i}
                  onClick={() => setAnswer(h)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-bg-hover mb-1"
                >
                  <p className="text-xs text-fg-secondary truncate">{h.question}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部输入框 */}
      <form onSubmit={handleAsk} className="px-5 py-3 border-t border-border bg-bg-primary">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="问一个关于你项目的问题..."
            disabled={loading}
            className="Memora-input flex-1"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="Memora-btn Memora-btn-primary text-sm"
          >
            {loading ? '...' : '提问'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AnswerCard({
  answer,
  onOpenSession
}: {
  answer: ProjectMemoryAnswer
  onOpenSession: (sessionId: string) => void
}) {
  return (
    <div className="space-y-4">
      {/* 问题 */}
      <div className="px-3 py-2 rounded-md bg-bg-hover">
        <p className="text-xs text-fg-muted mb-0.5">问题</p>
        <p className="text-sm text-fg-primary">{answer.question}</p>
      </div>

      {/* 答案 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-fg-secondary uppercase tracking-wider">
            答案
          </span>
          {answer.model && (
            <span className="text-[10px] text-fg-muted">{answer.model}</span>
          )}
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none text-fg-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer.answer}</ReactMarkdown>
        </div>
      </div>

      {/* 引用来源 */}
      {answer.citations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-fg-secondary uppercase tracking-wider mb-2">
            引用来源（{answer.citations.length}）
          </p>
          <div className="space-y-2">
            {answer.citations.map((c, i) => {
              const meta = PROVIDER_META[c.provider as Provider] || PROVIDER_META.Unknown
              return (
                <button
                  key={i}
                  onClick={() => onOpenSession(c.sessionId)}
                  className="w-full text-left p-2.5 rounded-md border border-border hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-fg-muted">#{i + 1}</span>
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs text-fg-secondary truncate flex-1">
                      {c.sessionTitle}
                    </span>
                    <span className="text-[10px] text-fg-muted">
                      {(c.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted line-clamp-2">{c.snippet}</p>
                  {c.reason && (
                    <p className="text-[10px] text-fg-muted mt-1 opacity-80">
                      为何引用: {c.reason}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
