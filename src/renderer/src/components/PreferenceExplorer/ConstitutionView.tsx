import { useState, useEffect, useCallback } from 'react'
import type { Preference } from '@shared/types'
import { useDialog, PromptDialog } from '../PromptDialog'
import { PreferenceEditor } from './PreferenceEditor'
import { formatDate } from './types'

interface ConstitutionViewProps {
  workspaceId: string
}

export function ConstitutionView({ workspaceId }: ConstitutionViewProps) {
  const dialog = useDialog()
  const [entries, setEntries] = useState<Preference[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Preference | null>(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.Memora.preference.constitution(workspaceId || undefined)
      setEntries(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  function handleSaved(updated: Preference) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === updated.id)
      return exists ? prev.map((e) => (e.id === updated.id ? updated : e)) : [...prev, updated]
    })
    setEditing(null)
    setCreating(false)
    refresh()
  }

  async function handleDelete(pref: Preference) {
    const ok = await dialog.confirm(`确定删除宪法条目「${pref.subject}: ${pref.value}」？`)
    if (!ok) return
    try {
      await window.Memora.preference.delete(pref.id)
      setEntries((prev) => prev.filter((e) => e.id !== pref.id))
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleArchive(pref: Preference) {
    const ok = await dialog.confirm(`确定归档（遗忘）宪法条目「${pref.subject}: ${pref.value}」？`)
    if (!ok) return
    try {
      const updated = await window.Memora.preference.archive(pref.id)
      if (!updated) {
        dialog.alert('归档失败：服务端返回空结果')
        return
      }
      setEntries((prev) => prev.filter((e) => e.id !== pref.id))
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
        {/* 头部说明 */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🛡</span>
            <h3 className="text-sm font-semibold text-amber-700">AI 宪法</h3>
          </div>
          <p className="text-[11px] text-fg-secondary leading-relaxed">
            定义你的核心原则，所有 AI 工具都会优先读取这些规则。宪法条目永不衰减、不参与冲突检测。
          </p>
        </div>

        {/* 添加按钮 */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-fg-muted">
            {entries.length > 0 ? `共 ${entries.length} 条原则` : ''}
          </span>
          <button
            onClick={() => setCreating(true)}
            className="Memora-btn Memora-btn-primary text-xs whitespace-nowrap"
            title="添加宪法条目"
          >
            🛡 添加宪法条目
          </button>
        </div>

        {/* 加载中 */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-fg-secondary py-8 justify-center">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>加载中...</span>
          </div>
        )}

        {/* 错误 */}
        {error && <p className="text-[11px] text-red-500 break-all">✗ {error}</p>}

        {/* 空状态 */}
        {!loading && entries.length === 0 && !error && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 opacity-30">🛡</div>
            <p className="text-sm text-fg-secondary mb-1">还没有宪法条目</p>
            <p className="text-xs text-fg-muted mb-4 max-w-md mx-auto">
              AI 宪法 — 定义你的核心原则，所有 AI 工具都会优先读取这些规则
            </p>
            <button
              onClick={() => setCreating(true)}
              className="Memora-btn Memora-btn-primary text-xs"
            >
              🛡 添加第一条原则
            </button>
          </div>
        )}

        {/* 宪法条目列表 */}
        {!loading &&
          entries.map((pref, idx) => (
            <div
              key={pref.id}
              className="rounded-lg border border-amber-500/30 bg-bg-primary p-3.5 transition-colors hover:border-amber-500/50"
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-600 text-[11px] font-semibold tabular-nums">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600">
                          {pref.subject}
                        </span>
                      </div>
                      <h3 className="text-sm font-medium text-fg-primary leading-snug break-words whitespace-pre-wrap">
                        {pref.value}
                      </h3>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditing(pref)}
                        className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                        title="编辑"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleArchive(pref)}
                        className="text-fg-muted hover:text-yellow-500 text-xs px-1 py-0.5"
                        title="归档（遗忘）"
                      >
                        🗇
                      </button>
                      <button
                        onClick={() => handleDelete(pref)}
                        className="text-fg-muted hover:text-red-500 text-xs px-1 py-0.5"
                        title="删除"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px] text-fg-muted">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">
                      宪法
                    </span>
                    <span title="创建时间">📅 {formatDate(pref.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* 编辑/新建弹层 */}
      {(editing || creating) && (
        <PreferenceEditor
          pref={editing}
          workspaceId={workspaceId}
          presetSource="constitution"
          onCancel={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={handleSaved}
        />
      )}

      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </div>
  )
}
