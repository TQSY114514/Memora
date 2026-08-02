import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '../../stores/appStore'
import { useDialog, PromptDialog } from '../PromptDialog'
import type {
  KnowledgeEntry,
  KnowledgeType,
  Workspace
} from '@shared/types'
import { KnowledgeGraph } from './KnowledgeGraph'

interface KnowledgePanelProps {
  onClose: () => void
}

type FilterType = 'all' | KnowledgeType | 'open-task'

const TYPE_META: Record<KnowledgeType, { label: string; icon: string; color: string; badge: string }> = {
  knowledge: { label: '知识', icon: '💡', color: '#6d5dfc', badge: 'bg-purple-500/15 text-purple-500' },
  decision: { label: '决策', icon: '⚖️', color: '#d97757', badge: 'bg-orange-500/15 text-orange-500' },
  task: { label: '任务', icon: '☐', color: '#10a37f', badge: 'bg-emerald-500/15 text-emerald-500' }
}

const SOURCE_META: Record<string, string> = {
  manual: '手动',
  'ai-extract': 'AI 提炼',
  mcp: 'MCP'
}

export function KnowledgePanel({ onClose }: KnowledgePanelProps) {
  const { activeWorkspaceId, activeSessionId, setActiveSession, setActiveSessionData } = useStore()
  const dialog = useDialog()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWsId, setCurrentWsId] = useState<string>(activeWorkspaceId ?? '')
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [counts, setCounts] = useState<{ total: number; knowledge: number; decision: number; task: number; openTask: number } | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [viewMode] = useState<'list' | 'graph'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  // 搜索防抖：避免每输入一个字符就触发 FTS 查询
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [searchQuery])

  // 加载工作区列表
  useEffect(() => {
    window.Memora.workspace.list().then((ws) => {
      setWorkspaces(ws)
      if (!currentWsId && ws.length > 0) {
        setCurrentWsId(activeWorkspaceId ?? ws[0].id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次加载工作区列表
  }, [])

  const refresh = useCallback(async () => {
    if (!currentWsId) return
    setLoading(true)
    setError(null)
    try {
      const [list, c] = await Promise.all([
        debouncedSearch.trim()
          ? window.Memora.knowledge.search(debouncedSearch.trim(), { workspaceId: currentWsId })
          : window.Memora.knowledge.list({ workspaceId: currentWsId, limit: 1000 }),
        window.Memora.knowledge.count(currentWsId)
      ])
      setEntries(list)
      setCounts(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [currentWsId, debouncedSearch])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 切换工作区时同步 store
  function handleSwitchWorkspace(id: string) {
    setCurrentWsId(id)
    setFilter('all')
    setSearchQuery('')
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return entries
    if (filter === 'open-task') return entries.filter((e) => e.type === 'task' && e.status === 'open')
    return entries.filter((e) => e.type === (filter as KnowledgeType))
  }, [entries, filter])

  async function handleToggleTask(entry: KnowledgeEntry) {
    try {
      const updated = await window.Memora.knowledge.toggleTask(entry.id)
      if (!updated) {
        dialog.alert('更新失败：服务端返回空结果')
        return
      }
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)))
      if (counts) {
        setCounts({
          ...counts,
          openTask: updated.status === 'done' ? counts.openTask - 1 : counts.openTask + 1
        })
      }
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDelete(entry: KnowledgeEntry) {
    const ok = await dialog.confirm(`确定删除「${entry.title}」？`)
    if (!ok) return
    try {
      await window.Memora.knowledge.delete(entry.id)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
      if (counts) setCounts({ ...counts, total: counts.total - 1 })
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleExtractFromSession() {
    if (!activeSessionId) {
      dialog.alert('请先在对话列表中选中一个对话，再回来提炼。')
      return
    }
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await window.Memora.knowledge.extractFromSession(activeSessionId)
      setExtractMsg(`✓ 已提炼 ${result.created} 条到当前工作区知识库`)
      await refresh()
    } catch (e) {
      setExtractMsg(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExtracting(false)
    }
  }

  async function handleOpenSource(sessionId: string) {
    setActiveSession(sessionId)
    const session = await window.Memora.session.get(sessionId, false)
    setActiveSessionData(session)
    onClose()
  }

  function handleSaved(updated: KnowledgeEntry) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === updated.id)
      return exists ? prev.map((e) => (e.id === updated.id ? updated : e)) : [updated, ...prev]
    })
    setEditing(null)
    setCreating(false)
    // 计数刷新
    if (counts && !entries.some((e) => e.id === updated.id)) {
      setCounts({ ...counts, total: counts.total + 1 })
    }
    refresh()
  }

  const tabs: Array<{ key: FilterType; label: string; count?: number }> = [
    { key: 'all', label: '全部', count: counts?.total },
    { key: 'knowledge', label: '知识', count: counts?.knowledge },
    { key: 'decision', label: '决策', count: counts?.decision },
    { key: 'task', label: '任务', count: counts?.task },
    { key: 'open-task', label: '待办', count: counts?.openTask }
  ]

  return (
    <div className="flex flex-col h-full bg-bg-tertiary">
      {/* 顶部 */}
      <header className="px-5 py-3 border-b border-border bg-bg-primary flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📚</span>
          <div>
            <h2 className="text-sm font-semibold">知识库</h2>
            <p className="text-[10px] text-fg-muted">决策 · 任务 · 知识一等公民实体</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workspaces.length > 1 && (
            <select
              value={currentWsId}
              onChange={(e) => handleSwitchWorkspace(e.target.value)}
              className="Memora-input text-xs py-1 max-w-[160px]"
              title="切换工作区"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
            ✕
          </button>
        </div>
      </header>

      {/* 工具栏 */}
      <div className="px-5 py-3 border-b border-border bg-bg-secondary/50 space-y-2.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索知识/决策/任务... (FTS 中文分词)"
            className="Memora-input flex-1 text-xs"
          />
          <button
            onClick={() => setCreating(true)}
            className="Memora-btn Memora-btn-primary text-xs whitespace-nowrap"
            title="新建知识条目"
          >
            + 新建
          </button>
          <button
            onClick={handleExtractFromSession}
            disabled={extracting || !activeSessionId}
            className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
            title={activeSessionId ? '把当前对话的 AI 蒸馏提炼为知识条目' : '请先在对话列表选中一个对话'}
          >
            {extracting ? '⏳ 提炼中…' : '📥 从当前对话提炼'}
          </button>
        </div>

        {/* 类型筛选 + 统计 */}
        <div className="flex items-center gap-1 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                filter === t.key
                  ? 'bg-accent text-white'
                  : 'text-fg-muted hover:bg-bg-hover'
              }`}
            >
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={`text-[10px] ${
                    filter === t.key ? 'text-white/70' : 'text-fg-muted'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {extractMsg && (
          <p className={`text-[11px] ${extractMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
            {extractMsg}
          </p>
        )}
        {error && <p className="text-[11px] text-red-500 break-all">✗ {error}</p>}
      </div>

      {/* 列表 / 图谱 */}
      {viewMode === 'graph' ? (
        <KnowledgeGraph
          workspaceId={currentWsId}
          onEntryClick={(entry) => setEditing(entry)}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-4 space-y-2.5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-fg-secondary py-8 justify-center">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>加载中...</span>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3 opacity-30">📚</div>
              <p className="text-sm text-fg-secondary mb-1">
                {searchQuery.trim() ? '未找到匹配的知识条目' : '这个工作区还没有知识条目'}
              </p>
              <p className="text-xs text-fg-muted mb-4">
                {searchQuery.trim()
                  ? '试试更换关键词，或清空搜索'
                  : '先对对话做「记忆蒸馏」，再点「从当前对话提炼」即可生成'}
              </p>
              {!searchQuery.trim() && (
                <button
                  onClick={() => setCreating(true)}
                  className="Memora-btn Memora-btn-primary text-xs"
                >
                  + 手动新建
                </button>
              )}
            </div>
          )}

          {!loading &&
            filtered.map((entry) => (
              <KnowledgeCard
                key={entry.id}
                entry={entry}
                onEdit={() => setEditing(entry)}
                onDelete={() => handleDelete(entry)}
                onToggleTask={() => handleToggleTask(entry)}
                onOpenSource={handleOpenSource}
              />
            ))}
        </div>
      </div>
      )}

      {/* 编辑/新建弹层 */}
      {(editing || creating) && (
        <EntryEditor
          entry={editing}
          workspaceId={currentWsId}
          sessionId={activeSessionId ?? undefined}
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

function KnowledgeCard({
  entry,
  onEdit,
  onDelete,
  onToggleTask,
  onOpenSource
}: {
  entry: KnowledgeEntry
  onEdit: () => void
  onDelete: () => void
  onToggleTask: () => void
  onOpenSource: (sessionId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = TYPE_META[entry.type]
  const isTask = entry.type === 'task'
  const isDone = isTask && entry.status === 'done'
  const isSuperseded = entry.type === 'decision' && entry.status === 'superseded'

  return (
    <div
      className={`rounded-lg border border-border bg-bg-primary p-3.5 transition-colors hover:border-accent/40 ${
        isDone ? 'opacity-55' : ''
      } ${isSuperseded ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        {/* 类型图标 / 任务勾选 */}
        {isTask ? (
          <button
            onClick={onToggleTask}
            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 transition-colors ${
              isDone
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-border hover:border-emerald-500'
            }`}
            title={isDone ? '标记为未完成' : '标记为已完成'}
          >
            {isDone ? '✓' : ''}
          </button>
        ) : (
          <span className="mt-0.5 text-sm flex-shrink-0">{meta.icon}</span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={`text-sm font-medium text-fg-primary leading-snug ${
                isDone ? 'line-through' : ''
              }`}
            >
              {entry.title}
            </h3>
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <button
                onClick={onEdit}
                className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                title="编辑"
              >
                ✎
              </button>
              <button
                onClick={onDelete}
                className="text-fg-muted hover:text-red-500 text-xs px-1 py-0.5"
                title="删除"
              >
                🗑
              </button>
            </div>
          </div>

          {entry.content && (
            <p
              className={`text-xs text-fg-secondary mt-1 whitespace-pre-wrap leading-relaxed ${
                expanded ? '' : 'line-clamp-3'
              }`}
              onClick={() => entry.content && entry.content.length > 120 && setExpanded(!expanded)}
              style={{ cursor: entry.content && entry.content.length > 120 ? 'pointer' : 'default' }}
            >
              {entry.content}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px] text-fg-muted">
            <span className={`px-1.5 py-0.5 rounded font-medium ${meta.badge}`}>
              {meta.label}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-bg-hover">
              {SOURCE_META[entry.source] ?? entry.source}
            </span>
            {isTask && (
              <span className={`px-1.5 py-0.5 rounded ${isDone ? 'bg-bg-hover text-fg-muted' : 'bg-emerald-500/15 text-emerald-500'}`}>
                {isDone ? '已完成' : '待办'}
              </span>
            )}
            {isSuperseded && (
              <span className="px-1.5 py-0.5 rounded bg-bg-hover text-fg-muted">已废弃</span>
            )}
            <span>{new Date(entry.createdAt).toLocaleDateString('zh-CN')}</span>
            {entry.sessionId && (
              <button
                onClick={() => onOpenSource(entry.sessionId!)}
                className="px-1.5 py-0.5 rounded text-accent hover:bg-accent-muted transition-colors"
                title="跳转到来源对话"
              >
                ↗ 来源对话
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EntryEditor({
  entry,
  workspaceId,
  sessionId,
  onCancel,
  onSaved
}: {
  entry: KnowledgeEntry | null
  workspaceId: string
  sessionId?: string
  onCancel: () => void
  onSaved: (entry: KnowledgeEntry) => void
}) {
  const isEdit = !!entry
  const [type, setType] = useState<KnowledgeType>(entry?.type ?? 'knowledge')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [status, setStatus] = useState(entry?.status ?? (entry?.type === 'task' ? 'open' : 'active'))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) {
      setErr('标题不能为空')
      return
    }
    if (!workspaceId) {
      setErr('未选择工作区')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      let result: KnowledgeEntry | null
      if (isEdit && entry) {
        result = await window.Memora.knowledge.update(entry.id, {
          title: title.trim(),
          content: content.trim() || undefined,
          type,
          status: type === 'task' ? status : type === 'decision' ? status : 'active'
        })
      } else {
        result = await window.Memora.knowledge.create({
          workspaceId,
          sessionId,
          type,
          title: title.trim(),
          content: content.trim() || undefined,
          status: type === 'task' ? status : type === 'decision' ? status : undefined,
          source: 'manual'
        })
      }
      if (result) onSaved(result)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-bg-primary rounded-lg shadow-xl p-5 w-[480px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-4">{isEdit ? '编辑条目' : '新建知识条目'}</h3>

        <label className="block text-xs text-fg-secondary mb-1">类型</label>
        <div className="flex items-center gap-1.5 mb-3">
          {(Object.keys(TYPE_META) as KnowledgeType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t)
                if (t === 'task' && status === 'active') setStatus('open')
                if (t !== 'task' && status === 'open') setStatus('active')
              }}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                type === t ? 'bg-accent text-white' : 'bg-bg-hover text-fg-secondary hover:bg-bg-tertiary'
              }`}
            >
              <span>{TYPE_META[t].icon}</span>
              <span>{TYPE_META[t].label}</span>
            </button>
          ))}
        </div>

        <label className="block text-xs text-fg-secondary mb-1">标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="Memora-input w-full text-sm mb-3"
          placeholder="一句话概括（如：选用 SQLite 而非 IndexedDB）"
          autoFocus
        />

        <label className="block text-xs text-fg-secondary mb-1">内容（可选）</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="Memora-input w-full text-sm mb-3"
          rows={5}
          placeholder="详细描述：背景、理由、影响范围..."
        />

        {type === 'task' && (
          <div className="mb-3">
            <label className="block text-xs text-fg-secondary mb-1">状态</label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setStatus('open')}
                className={`text-xs px-2.5 py-1 rounded-md ${
                  status === 'open' ? 'bg-accent text-white' : 'bg-bg-hover text-fg-secondary'
                }`}
              >
                待办
              </button>
              <button
                onClick={() => setStatus('done')}
                className={`text-xs px-2.5 py-1 rounded-md ${
                  status === 'done' ? 'bg-accent text-white' : 'bg-bg-hover text-fg-secondary'
                }`}
              >
                已完成
              </button>
            </div>
          </div>
        )}

        {type === 'decision' && (
          <div className="mb-3">
            <label className="block text-xs text-fg-secondary mb-1">状态</label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setStatus('active')}
                className={`text-xs px-2.5 py-1 rounded-md ${
                  status === 'active' ? 'bg-accent text-white' : 'bg-bg-hover text-fg-secondary'
                }`}
              >
                生效中
              </button>
              <button
                onClick={() => setStatus('superseded')}
                className={`text-xs px-2.5 py-1 rounded-md ${
                  status === 'superseded' ? 'bg-accent text-white' : 'bg-bg-hover text-fg-secondary'
                }`}
              >
                已废弃
              </button>
            </div>
          </div>
        )}

        {err && <p className="text-xs text-red-500 mb-2 break-all">✗ {err}</p>}

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onCancel} className="Memora-btn Memora-btn-ghost text-xs">
            取消
          </button>
          <button onClick={handleSave} disabled={saving} className="Memora-btn Memora-btn-primary text-xs">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
