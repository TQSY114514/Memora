import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '../../stores/appStore'
import { useDialog, PromptDialog } from '../PromptDialog'
import type {
  Preference,
  PreferenceStatus,
  PreferenceSource,
  UserProfile,
  Workspace
} from '@shared/types'

interface PreferenceExplorerProps {
  onClose: () => void
}

type FilterType = 'all' | PreferenceStatus

const STATUS_META: Record<PreferenceStatus, { label: string; badge: string }> = {
  active: { label: '生效中', badge: 'bg-emerald-500/15 text-emerald-500' },
  superseded: { label: '已取代', badge: 'bg-yellow-500/15 text-yellow-500' },
  archived: { label: '已归档', badge: 'bg-bg-hover text-fg-muted' }
}

const SOURCE_META: Record<PreferenceSource, string> = {
  manual: '手动',
  conversation: '对话提取',
  mcp: 'MCP',
  inferred: '推断'
}

/** 相对时间格式化：今天 / 昨天 / N天前 / N月N日 */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 30) return `${days}天前`
    return `${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return ''
  }
}

/** 置信度对应颜色：>0.7 绿、>0.3 黄、<=0.3 红 */
function confidenceColor(c: number): string {
  if (c > 0.7) return 'bg-green-500'
  if (c > 0.3) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function PreferenceExplorer({ onClose }: PreferenceExplorerProps) {
  const { activeWorkspaceId, activeSessionId } = useStore()
  const dialog = useDialog()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWsId, setCurrentWsId] = useState<string>(activeWorkspaceId ?? '')
  const [entries, setEntries] = useState<Preference[]>([])
  const [counts, setCounts] = useState<{
    total: number
    active: number
    superseded: number
    archived: number
  } | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [viewMode, setViewMode] = useState<'list' | 'profile'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Preference | null>(null)
  const [creating, setCreating] = useState(false)
  const [decaying, setDecaying] = useState(false)
  const [decayMsg, setDecayMsg] = useState<string | null>(null)
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
  }, [])

  const refresh = useCallback(async () => {
    if (!currentWsId) return
    setLoading(true)
    setError(null)
    try {
      const [list, c] = await Promise.all([
        debouncedSearch.trim()
          ? window.Memora.preference.search(debouncedSearch.trim(), { workspaceId: currentWsId })
          : window.Memora.preference.list({ workspaceId: currentWsId, limit: 1000 }),
        window.Memora.preference.count(currentWsId)
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

  // 切换工作区时同步状态
  function handleSwitchWorkspace(id: string) {
    setCurrentWsId(id)
    setFilter('all')
    setSearchQuery('')
    setViewMode('list')
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return entries
    return entries.filter((e) => e.status === filter)
  }, [entries, filter])

  async function handleArchive(pref: Preference) {
    const ok = await dialog.confirm(`确定归档（遗忘）「${pref.subject}: ${pref.value}」？`)
    if (!ok) return
    try {
      const updated = await window.Memora.preference.archive(pref.id)
      if (!updated) {
        dialog.alert('归档失败：服务端返回空结果')
        return
      }
      setEntries((prev) => prev.map((e) => (e.id === pref.id ? updated : e)))
      if (counts) {
        setCounts({
          ...counts,
          active: pref.status === 'active' ? counts.active - 1 : counts.active,
          superseded: pref.status === 'superseded' ? counts.superseded - 1 : counts.superseded,
          archived: counts.archived + 1
        })
      }
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDelete(pref: Preference) {
    const ok = await dialog.confirm(`确定删除「${pref.subject}: ${pref.value}」？`)
    if (!ok) return
    try {
      await window.Memora.preference.delete(pref.id)
      setEntries((prev) => prev.filter((e) => e.id !== pref.id))
      if (counts) setCounts({ ...counts, total: counts.total - 1 })
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDecay() {
    if (!currentWsId) return
    setDecaying(true)
    setDecayMsg(null)
    try {
      const decayed = await window.Memora.preference.decay(currentWsId)
      setDecayMsg(`✓ 已衰减 ${decayed} 条偏好`)
      await refresh()
    } catch (e) {
      setDecayMsg(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDecaying(false)
    }
  }

  function handleSaved(updated: Preference) {
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
    { key: 'active', label: '生效中', count: counts?.active },
    { key: 'superseded', label: '已取代', count: counts?.superseded },
    { key: 'archived', label: '已归档', count: counts?.archived }
  ]

  return (
    <div className="flex flex-col h-full bg-bg-tertiary">
      {/* 顶部 */}
      <header className="px-5 py-3 border-b border-border bg-bg-primary flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🧠</span>
          <div>
            <h2 className="text-sm font-semibold">偏好记忆</h2>
            <p className="text-[10px] text-fg-muted">用户偏好 · 喜恶 · 工具习惯</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <div className="flex items-center gap-0.5 mr-1">
            <button
              onClick={() => setViewMode('list')}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-accent text-white' : 'text-fg-muted hover:bg-bg-hover'
              }`}
              title="列表视图"
            >
              ☰ 列表
            </button>
            <button
              onClick={() => setViewMode('profile')}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                viewMode === 'profile' ? 'bg-accent text-white' : 'text-fg-muted hover:bg-bg-hover'
              }`}
              title="画像视图（按类别分组）"
            >
              📋 画像
            </button>
          </div>
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
            placeholder="搜索偏好 (FTS 中文分词)..."
            className="Memora-input flex-1 text-xs"
          />
          <button
            onClick={() => setCreating(true)}
            className="Memora-btn Memora-btn-primary text-xs whitespace-nowrap"
            title="新建偏好"
          >
            + 新建
          </button>
          <button
            onClick={handleDecay}
            disabled={decaying || !currentWsId}
            className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
            title="对长期未访问的偏好进行置信度衰减"
          >
            {decaying ? '⏳ 衰减中…' : '⏬ 运行衰减'}
          </button>
        </div>

        {/* 状态筛选 + 统计 */}
        {viewMode === 'list' && (
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
        )}

        {decayMsg && (
          <p
            className={`text-[11px] ${
              decayMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {decayMsg}
          </p>
        )}
        {error && <p className="text-[11px] text-red-500 break-all">✗ {error}</p>}
      </div>

      {/* 列表 / 画像 */}
      {viewMode === 'profile' ? (
        <ProfileView workspaceId={currentWsId} onEdit={(p) => setEditing(p)} />
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
                <div className="text-4xl mb-3 opacity-30">🧠</div>
                <p className="text-sm text-fg-secondary mb-1">
                  {searchQuery.trim() ? '未找到匹配的偏好' : '这个工作区还没有偏好记忆'}
                </p>
                <p className="text-xs text-fg-muted mb-4">
                  {searchQuery.trim()
                    ? '试试更换关键词，或清空搜索'
                    : '在对话中提及喜好/工具，系统会自动提炼；也可手动新建'}
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
              filtered.map((pref) => (
                <PreferenceCard
                  key={pref.id}
                  pref={pref}
                  onEdit={() => setEditing(pref)}
                  onArchive={() => handleArchive(pref)}
                  onDelete={() => handleDelete(pref)}
                />
              ))}
          </div>
        </div>
      )}

      {/* 编辑/新建弹层 */}
      {(editing || creating) && (
        <PreferenceEditor
          pref={editing}
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

function PreferenceCard({
  pref,
  onEdit,
  onArchive,
  onDelete
}: {
  pref: Preference
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const meta = STATUS_META[pref.status]
  const isInactive = pref.status !== 'active'
  const conf = Math.max(0, Math.min(1, pref.confidence ?? 0))

  return (
    <div
      className={`rounded-lg border border-border bg-bg-primary p-3.5 transition-colors hover:border-accent/40 ${
        isInactive ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
                  {pref.subject}
                </span>
              </div>
              <h3 className="text-sm font-medium text-fg-primary leading-snug break-words">
                {pref.value}
              </h3>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <button
                onClick={onEdit}
                className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                title="编辑值"
              >
                ✎
              </button>
              {pref.status !== 'archived' && (
                <button
                  onClick={onArchive}
                  className="text-fg-muted hover:text-yellow-500 text-xs px-1 py-0.5"
                  title="归档（遗忘）"
                >
                  🗇
                </button>
              )}
              <button
                onClick={onDelete}
                className="text-fg-muted hover:text-red-500 text-xs px-1 py-0.5"
                title="删除"
              >
                🗑
              </button>
            </div>
          </div>

          {/* 置信度条 */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-bg-hover overflow-hidden">
              <div
                className={`h-full rounded-full ${confidenceColor(conf)}`}
                style={{ width: `${Math.round(conf * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-fg-muted flex-shrink-0 tabular-nums">
              {(conf * 100).toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px] text-fg-muted">
            <span className={`px-1.5 py-0.5 rounded font-medium ${meta.badge}`}>
              {meta.label}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-bg-hover">
              {SOURCE_META[pref.source] ?? pref.source}
            </span>
            <span title="访问次数">↻ {pref.accessCount ?? 0}</span>
            {pref.lastAccessedAt && (
              <span title="最后访问">⏱ {formatDate(pref.lastAccessedAt)}</span>
            )}
            <span title="创建时间">📅 {formatDate(pref.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreferenceEditor({
  pref,
  workspaceId,
  sessionId,
  onCancel,
  onSaved
}: {
  pref: Preference | null
  workspaceId: string
  sessionId?: string
  onCancel: () => void
  onSaved: (pref: Preference) => void
}) {
  const isEdit = !!pref
  const [subject, setSubject] = useState(pref?.subject ?? '')
  const [value, setValue] = useState(pref?.value ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!subject.trim()) {
      setErr('类别（subject）不能为空')
      return
    }
    if (!value.trim()) {
      setErr('偏好值不能为空')
      return
    }
    if (!workspaceId) {
      setErr('未选择工作区')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      let result: Preference | null
      if (isEdit && pref) {
        result = await window.Memora.preference.update(pref.id, {
          subject: subject.trim(),
          value: value.trim()
        })
      } else {
        result = await window.Memora.preference.create({
          workspaceId,
          sessionId,
          subject: subject.trim(),
          value: value.trim(),
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
        <h3 className="text-sm font-semibold mb-4">{isEdit ? '编辑偏好' : '新建偏好'}</h3>

        <label className="block text-xs text-fg-secondary mb-1">类别（subject）</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="Memora-input w-full text-sm mb-3"
          placeholder="如：music / phone / language / editor / framework"
          autoFocus
        />

        <label className="block text-xs text-fg-secondary mb-1">偏好值（value）</label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="Memora-input w-full text-sm mb-3"
          rows={3}
          placeholder="如：初音未来 / android / Python"
        />

        {err && <p className="text-xs text-red-500 mb-2 break-all">✗ {err}</p>}

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onCancel} className="Memora-btn Memora-btn-ghost text-xs">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="Memora-btn Memora-btn-primary text-xs"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 画像视图：按 subject 分组展示偏好（调用 preference.profile） */
function ProfileView({
  workspaceId,
  onEdit
}: {
  workspaceId: string
  onEdit: (pref: Preference) => void
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    window.Memora.preference
      .profile(workspaceId)
      .then((p) => setProfile(p))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-fg-secondary py-8">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
        <span>加载中...</span>
      </div>
    )
  }
  if (error) {
    return <div className="text-center py-8 text-sm text-red-500">✗ {error}</div>
  }
  if (!profile || profile.bySubject.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3 opacity-30">🧠</div>
        <p className="text-sm text-fg-secondary">还没有偏好数据，无法生成画像</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
        <div className="text-xs text-fg-muted">
          共 {profile.totalPreferences} 条偏好，生效中 {profile.activePreferences} 条
        </div>
        {profile.bySubject.map((group) => (
          <div
            key={group.subject}
            className="rounded-lg border border-border bg-bg-primary p-3.5"
          >
            <h3 className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">
              {group.subject}
            </h3>
            <div className="space-y-1.5">
              {group.preferences.map((p) => {
                const conf = Math.max(0, Math.min(1, p.confidence ?? 0))
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <button
                      onClick={() => onEdit(p)}
                      className="text-fg-primary hover:text-accent text-left break-all"
                      title="编辑"
                    >
                      {p.value}
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] text-fg-muted tabular-nums">
                        {(conf * 100).toFixed(0)}%
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          STATUS_META[p.status].badge
                        }`}
                      >
                        {STATUS_META[p.status].label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
