import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { useStore } from '../../stores/appStore'
import { useDialog, PromptDialog } from '../PromptDialog'
import type {
  Preference,
  PreferenceStatus,
  PreferenceSource,
  UserProfile,
  Workspace,
  ChatSession,
  MemoryHealth,
  ProfileSummary,
  TieredMemory
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

/** 状态变迁说明（记忆溯源用） */
const STATUS_EXPLAIN: Record<PreferenceStatus, string> = {
  active: '生效中：当前参与用户画像与记忆召回',
  superseded: '已被新偏好取代：同类别下出现了更新的偏好',
  archived: '已归档（遗忘）：不再参与记忆召回'
}

/** 绝对时间格式化：YYYY-MM-DD HH:mm */
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
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
  const [viewMode, setViewMode] = useState<'list' | 'profile' | 'health'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Preference | null>(null)
  const [creating, setCreating] = useState(false)
  const [explaining, setExplaining] = useState<Preference | null>(null)
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
            <button
              onClick={() => setViewMode('health')}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                viewMode === 'health' ? 'bg-accent text-white' : 'text-fg-muted hover:bg-bg-hover'
              }`}
              title="记忆健康视图（分层记忆与健康评分）"
            >
              📊 健康
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

      {/* 列表 / 画像 / 健康 */}
      {viewMode === 'profile' ? (
        <ProfileView workspaceId={currentWsId} onEdit={(p) => setEditing(p)} />
      ) : viewMode === 'health' ? (
        <MemoryHealthView workspaceId={currentWsId} />
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
                  onExplain={() => setExplaining(pref)}
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

      {/* 记忆溯源抽屉 */}
      {explaining && (
        <MemoryExplainDrawer pref={explaining} onClose={() => setExplaining(null)} />
      )}

      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </div>
  )
}

function PreferenceCard({
  pref,
  onEdit,
  onArchive,
  onDelete,
  onExplain
}: {
  pref: Preference
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onExplain: () => void
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
                onClick={onExplain}
                className="text-fg-muted hover:text-accent text-xs px-1 py-0.5"
                title="记忆溯源"
              >
                🔍
              </button>
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

/** 溯源抽屉中的键值行 */
function ExplainRow({
  icon,
  label,
  children
}: {
  icon: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-fg-muted w-20 flex-shrink-0 text-[11px] flex items-center gap-1">
        <span>{icon}</span>
        {label}
      </span>
      <span className="text-[11px] text-fg-secondary break-all flex-1 min-w-0">{children}</span>
    </div>
  )
}

/** 记忆溯源抽屉：展示单条偏好的完整来源与生命周期信息 */
function MemoryExplainDrawer({
  pref,
  onClose
}: {
  pref: Preference
  onClose: () => void
}) {
  const [session, setSession] = useState<ChatSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!pref.sessionId) return
    let cancelled = false
    setSessionLoading(true)
    setSessionError(null)
    setNotFound(false)
    window.Memora.session
      .get(pref.sessionId, false)
      .then((s) => {
        if (cancelled) return
        if (!s) setNotFound(true)
        setSession(s)
      })
      .catch((e) => {
        if (cancelled) return
        setSessionError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pref.sessionId])

  const conf = Math.max(0, Math.min(1, pref.confidence ?? 0))
  const meta = STATUS_META[pref.status]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between sticky top-0 bg-bg-primary z-10">
          <div className="flex items-center gap-2">
            <span className="text-base">🔍</span>
            <h3 className="text-sm font-semibold">记忆溯源</h3>
          </div>
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 基本信息 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              基本信息
            </h4>
            <div className="rounded-lg border border-border bg-bg-secondary/40 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
                  {pref.subject}
                </span>
              </div>
              <h3 className="text-sm font-medium text-fg-primary leading-snug break-words mb-2.5">
                {pref.value}
              </h3>
              {/* 置信度 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-fg-muted w-14 flex-shrink-0">置信度</span>
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
              {/* 状态 + 来源 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.badge}`}>
                  {meta.label}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-bg-hover text-fg-secondary">
                  {SOURCE_META[pref.source] ?? pref.source}
                </span>
              </div>
            </div>
          </section>

          {/* 状态变迁说明 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              状态说明
            </h4>
            <p className="text-[11px] text-fg-secondary leading-relaxed">
              {STATUS_EXPLAIN[pref.status]}
            </p>
            {pref.status === 'superseded' && pref.supersededBy && (
              <p className="text-[10px] text-fg-muted mt-1 break-all">
                取代者 ID：{pref.supersededBy}
              </p>
            )}
          </section>

          {/* 时间线 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1">
              时间线
            </h4>
            <div className="rounded-lg border border-border bg-bg-secondary/40 px-3 py-1">
              <ExplainRow icon="📅" label="提取时间">
                <span>{formatDate(pref.createdAt) || '—'}</span>
                {formatDateTime(pref.createdAt) && (
                  <span className="text-fg-muted"> · {formatDateTime(pref.createdAt)}</span>
                )}
              </ExplainRow>
              <ExplainRow icon="✏" label="更新时间">
                <span>{formatDate(pref.updatedAt) || '—'}</span>
                {formatDateTime(pref.updatedAt) && (
                  <span className="text-fg-muted"> · {formatDateTime(pref.updatedAt)}</span>
                )}
              </ExplainRow>
              <ExplainRow icon="⏱" label="最后访问">
                {pref.lastAccessedAt ? (
                  <>
                    <span>{formatDate(pref.lastAccessedAt)}</span>
                    {formatDateTime(pref.lastAccessedAt) && (
                      <span className="text-fg-muted">
                        {' '}
                        · {formatDateTime(pref.lastAccessedAt)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-fg-muted">从未访问</span>
                )}
              </ExplainRow>
            </div>
          </section>

          {/* 访问统计 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              访问统计
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-fg-secondary">
              <span className="px-2 py-1 rounded bg-bg-hover">
                ↻ 出现次数：{pref.accessCount ?? 0}
              </span>
            </div>
          </section>

          {/* 来源对话 */}
          <section>
            <h4 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-2">
              来源对话
            </h4>
            {!pref.sessionId ? (
              <p className="text-[11px] text-fg-muted">无来源对话记录（手动创建的偏好）</p>
            ) : sessionLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-fg-secondary">
                <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span>加载来源对话…</span>
              </div>
            ) : sessionError ? (
              <p className="text-[11px] text-red-500 break-all">✗ {sessionError}</p>
            ) : notFound || !session ? (
              <p className="text-[11px] text-fg-muted break-all">
                来源对话已删除（ID：{pref.sessionId}）
              </p>
            ) : (
              <div className="rounded-lg border border-border bg-bg-secondary/40 p-3">
                <h3 className="text-sm font-medium text-fg-primary leading-snug break-words mb-1.5">
                  {session.title || '（无标题）'}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-fg-muted">
                  <span className="px-1.5 py-0.5 rounded bg-bg-hover">{session.provider}</span>
                  <span>💬 {session.messageCount} 条消息</span>
                  <span>📅 {formatDate(session.createdAt)}</span>
                </div>
                {session.description && (
                  <p className="text-[11px] text-fg-secondary mt-2 break-words">
                    {session.description}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** 记忆层级元信息：标签 + 颜色 */
const TIER_META: Record<
  TieredMemory['tier'],
  { label: string; bar: string; badge: string }
> = {
  working: {
    label: '工作记忆',
    bar: 'bg-blue-500',
    badge: 'bg-blue-500/15 text-blue-500'
  },
  short_term: {
    label: '短期记忆',
    bar: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-500'
  },
  long_term: {
    label: '长期记忆',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-500'
  }
}

/** 记忆健康视图：分层记忆概览 + 健康评分 + 风险/稳定记忆 + 画像摘要 + 维护操作 */
function MemoryHealthView({ workspaceId }: { workspaceId: string }) {
  const [health, setHealth] = useState<MemoryHealth | null>(null)
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{
    maintained: number
    archived: number
    promoted: number
    demoted: number
  } | null>(null)
  const [runMsg, setRunMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const [h, s] = await Promise.all([
        window.Memora.memoryLifecycle.health(workspaceId),
        window.Memora.memoryLifecycle.profileSummary(workspaceId)
      ])
      setHealth(h)
      setSummary(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  async function handleRun() {
    if (!workspaceId) return
    setRunning(true)
    setRunMsg(null)
    try {
      const result = await window.Memora.memoryLifecycle.run(workspaceId)
      setRunResult(result)
      setRunMsg(
        `✓ 维护完成：维护 ${result.maintained} · 归档 ${result.archived} · 提升 ${result.promoted} · 降级 ${result.demoted}`
      )
      await load()
    } catch (e) {
      setRunMsg(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(false)
    }
  }

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
  if (!health || health.total === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3 opacity-30">📊</div>
        <p className="text-sm text-fg-secondary">还没有偏好数据，无法生成记忆健康报告</p>
      </div>
    )
  }

  const total = health.total
  const pct = (n: number): number => (total > 0 ? (n / total) * 100 : 0)

  // 健康评分：长期记忆权重最高，工作记忆最低；atRisk 数量扣分
  const longevityScore =
    (health.longTerm * 1.0 + health.shortTerm * 0.6 + health.working * 0.3) / total * 100
  const atRiskPenalty = (health.atRisk.length / total) * 25
  const score = Math.max(0, Math.min(100, Math.round(longevityScore - atRiskPenalty)))
  const scoreColor =
    score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-red-500'
  const scoreStroke =
    score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  // 圆环进度（SVG）
  const R = 34
  const C = 2 * Math.PI * R
  const dashOffset = C * (1 - score / 100)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
        {/* 健康概览 + 评分 */}
        <div className="rounded-lg border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
                记忆分层概览
              </h3>
              <div className="text-xs text-fg-secondary mb-3">
                共 <span className="text-fg-primary font-medium">{total}</span> 条记忆
              </div>
              {/* 横向条形图 */}
              <div className="flex h-3 w-full rounded-full overflow-hidden bg-bg-hover mb-2">
                <div
                  className={`${TIER_META.working.bar} transition-all`}
                  style={{ width: `${pct(health.working)}%` }}
                  title={`${TIER_META.working.label}：${health.working}`}
                />
                <div
                  className={`${TIER_META.short_term.bar} transition-all`}
                  style={{ width: `${pct(health.shortTerm)}%` }}
                  title={`${TIER_META.short_term.label}：${health.shortTerm}`}
                />
                <div
                  className={`${TIER_META.long_term.bar} transition-all`}
                  style={{ width: `${pct(health.longTerm)}%` }}
                  title={`${TIER_META.long_term.label}：${health.longTerm}`}
                />
              </div>
              {/* 图例 */}
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-fg-muted">
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${TIER_META.working.bar}`} />
                  {TIER_META.working.label}
                  <span className="text-fg-secondary tabular-nums">{health.working}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${TIER_META.short_term.bar}`} />
                  {TIER_META.short_term.label}
                  <span className="text-fg-secondary tabular-nums">{health.shortTerm}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${TIER_META.long_term.bar}`} />
                  {TIER_META.long_term.label}
                  <span className="text-fg-secondary tabular-nums">{health.longTerm}</span>
                </span>
              </div>
            </div>

            {/* 健康评分圆环 */}
            <div className="flex flex-col items-center flex-shrink-0">
              <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
                <circle
                  cx="42"
                  cy="42"
                  r={R}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  className="text-bg-hover"
                />
                <circle
                  cx="42"
                  cy="42"
                  r={R}
                  fill="none"
                  stroke={scoreStroke}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="-mt-[58px] flex flex-col items-center pointer-events-none">
                <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{score}</span>
                <span className="text-[9px] text-fg-muted">分</span>
              </div>
              <span className="text-[10px] text-fg-muted mt-7">记忆健康评分</span>
            </div>
          </div>
        </div>

        {/* 风险记忆 */}
        {health.atRisk.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <h3 className="text-xs font-semibold text-yellow-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>⚠️</span> 即将遗忘的记忆 ({health.atRisk.length})
            </h3>
            <div className="space-y-1.5">
              {health.atRisk.map((m) => (
                <TieredMemoryRow key={m.preference.id} mem={m} variant="risk" />
              ))}
            </div>
          </div>
        )}

        {/* 最稳定记忆 */}
        {health.strongest.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>💪</span> 最稳定的长期记忆 ({health.strongest.length})
            </h3>
            <div className="space-y-1.5">
              {health.strongest.map((m) => (
                <TieredMemoryRow key={m.preference.id} mem={m} variant="strong" />
              ))}
            </div>
          </div>
        )}

        {/* 画像摘要 */}
        {summary && summary.summary && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>📝</span> 用户画像摘要
            </h3>
            <p className="text-[12px] text-fg-secondary leading-relaxed whitespace-pre-wrap break-words">
              {summary.summary}
            </p>
          </div>
        )}

        {/* 趋势 */}
        {summary && summary.trends && summary.trends.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>📈</span> 偏好趋势
            </h3>
            <div className="space-y-2">
              {summary.trends.map((t, i) => (
                <div
                  key={`${t.subject}-${i}`}
                  className="flex items-start gap-2 text-[12px]"
                >
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent flex-shrink-0">
                    {t.subject}
                  </span>
                  <span className="text-fg-secondary break-words flex-1 min-w-0">
                    <span className="text-fg-muted">从 </span>
                    <span className="line-through opacity-70">{t.from || '—'}</span>
                    <span className="text-accent mx-1">→</span>
                    <span className="text-fg-primary font-medium">{t.to || '—'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 记忆维护操作 */}
        <div className="rounded-lg border border-border bg-bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
                <span>🔧</span> 记忆维护
              </h3>
              <p className="text-[11px] text-fg-muted">
                执行一次生命周期维护：衰减、归档、层级升降
              </p>
            </div>
            <button
              onClick={handleRun}
              disabled={running || !workspaceId}
              className="Memora-btn Memora-btn-primary text-xs whitespace-nowrap"
              title="运行记忆维护"
            >
              {running ? '⏳ 维护中…' : '⚙ 运行维护'}
            </button>
          </div>
          {runMsg && (
            <p
              className={`text-[11px] mt-2.5 break-words ${
                runMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {runMsg}
            </p>
          )}
          {runResult && (
            <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px]">
              <span className="px-2 py-1 rounded bg-bg-hover text-fg-secondary">
                维护 <span className="text-fg-primary font-medium">{runResult.maintained}</span>
              </span>
              <span className="px-2 py-1 rounded bg-bg-hover text-fg-secondary">
                归档 <span className="text-fg-primary font-medium">{runResult.archived}</span>
              </span>
              <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-500">
                提升 <span className="font-medium">{runResult.promoted}</span>
              </span>
              <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-500">
                降级 <span className="font-medium">{runResult.demoted}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 分层记忆行：subject + value + 强度百分比 */
function TieredMemoryRow({
  mem,
  variant
}: {
  mem: TieredMemory
  variant: 'risk' | 'strong'
}) {
  const { preference, tier, strength } = mem
  const str = Math.max(0, Math.min(1, strength))
  const strPct = Math.round(str * 100)
  const tierMeta = TIER_META[tier]
  const barColor =
    variant === 'risk'
      ? 'bg-red-500'
      : str > 0.7
        ? 'bg-emerald-500'
        : str > 0.3
          ? 'bg-amber-500'
          : 'bg-red-500'

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tierMeta.badge}`}>
            {tierMeta.label}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent">
            {preference.subject}
          </span>
        </div>
        <div className="text-fg-primary break-words leading-snug">{preference.value}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-14 h-1.5 rounded-full bg-bg-hover overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${strPct}%` }}
          />
        </div>
        <span className="text-[10px] text-fg-muted tabular-nums w-8 text-right">
          {strPct}%
        </span>
      </div>
    </div>
  )
}
