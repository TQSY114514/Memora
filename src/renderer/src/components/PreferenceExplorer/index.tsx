import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '../../stores/appStore'
import { useDialog, PromptDialog } from '../PromptDialog'
import type { Preference, PreferenceStatus, Workspace } from '@shared/types'
import { PreferenceCard } from './PreferenceCard'
import { PreferenceEditor } from './PreferenceEditor'
import { ProfileView } from './ProfileView'
import { MemoryHealthView } from './MemoryHealthView'
import { MemoryExplainDrawer } from './MemoryExplainDrawer'

interface PreferenceExplorerProps {
  onClose: () => void
}

type FilterType = 'all' | PreferenceStatus

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次加载工作区列表
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
