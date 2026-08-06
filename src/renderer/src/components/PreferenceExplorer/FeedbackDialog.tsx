import { useState } from 'react'
import type { Preference } from '@shared/types'

/**
 * 自然语言修正记忆弹层（v1.15 行动项 5）
 *
 * 用户选择一条记忆 + 输入自然语言修正内容（修正 / 补充 / 替换），
 * 调用 preference.feedback（IPC → feedbackPreference 启发式解析），成功后通知父组件刷新。
 */
export function FeedbackDialog({
  entries,
  workspaceId,
  onClose,
  onApplied
}: {
  entries: Preference[]
  workspaceId: string
  onClose: () => void
  onApplied: () => void
}) {
  const [target, setTarget] = useState<string>(entries[0]?.id ?? '')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSubmit() {
    if (!workspaceId || !target || !text.trim()) return
    setSubmitting(true)
    setResult(null)
    try {
      const updated = await window.Memora.preference.feedback(target, text.trim(), workspaceId)
      if (!updated) {
        setResult({ ok: false, msg: '未找到对应偏好，可能已被删除' })
        return
      }
      setResult({
        ok: true,
        msg: `✓ 已更新「${updated.subject}: ${updated.value}」` +
          (updated.context ? `（补充说明：${updated.context}）` : '')
      })
      onApplied()
    } catch (e) {
      setResult({ ok: false, msg: `✗ ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-full max-w-xl mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">修正记忆</h3>
          <button
            onClick={() => !submitting && onClose()}
            className="text-fg-muted hover:text-fg-primary text-sm"
            disabled={submitting}
            title="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <p className="text-[11px] text-fg-muted">
            用自然语言告诉 Memora 你想怎么改这条记忆（修正 / 补充 / 替换）。
            例如：「其实我更喜欢 Vim 而不是 VS Code」或「补充：只在写前端时用」
          </p>
          <div>
            <label className="block text-xs text-fg-secondary mb-1">选择要修正的记忆</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="Memora-input w-full text-xs"
              disabled={submitting}
            >
              {entries.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.subject}] {p.value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-fg-secondary mb-1">自然语言修正内容</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="Memora-input w-full text-xs"
              rows={3}
              placeholder="如：其实我更喜欢 Vim 而不是 VS Code"
              disabled={submitting}
            />
          </div>
          {result && (
            <p
              className={`text-[11px] whitespace-pre-wrap break-all ${
                result.ok ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {result.msg}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            disabled={submitting}
            className="Memora-btn Memora-btn-ghost text-xs"
          >
            关闭
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !text.trim() || !target}
            className="Memora-btn Memora-btn-primary text-xs"
          >
            {submitting ? '应用中…' : '应用修正'}
          </button>
        </div>
      </div>
    </div>
  )
}