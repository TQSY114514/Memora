import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '../../stores/appStore'
import { useDialog, PromptDialog } from '../PromptDialog'
import type { Preference, PreferenceStatus, Workspace } from '@shared/types'
import { PreferenceCard } from './PreferenceCard'
import { PreferenceEditor } from './PreferenceEditor'
import { ProfileView } from './ProfileView'
import { MemoryHealthView } from './MemoryHealthView'
import { ConflictResolutionView } from './ConflictResolutionView'
import { MemoryExplainDrawer } from './MemoryExplainDrawer'
import { ConstitutionView } from './ConstitutionView'
import { FeedbackDialog } from './FeedbackDialog'

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
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'profile' | 'health' | 'conflicts' | 'constitution'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Preference | null>(null)
  const [creating, setCreating] = useState(false)
  const [explaining, setExplaining] = useState<Preference | null>(null)
  const [decaying, setDecaying] = useState(false)
  const [decayMsg, setDecayMsg] = useState<string | null>(null)
  const [conflictCount, setConflictCount] = useState(0)
  // 自然语言修正记忆（v1.15 行动项 5）
  const [showFeedback, setShowFeedback] = useState(false)
  // 搜索防抖：避免每输入一个字符就触发 FTS 查询
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // MMF 导出/导入
  const [exporting, setExporting] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importJsonText, setImportJsonText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  const refreshConflictCount = useCallback(async () => {
    if (!currentWsId) {
      setConflictCount(0)
      return
    }
    try {
      const reports = await window.Memora.preference.conflicts(currentWsId)
      setConflictCount(reports.reduce((sum, r) => sum + r.conflicts.length, 0))
    } catch {
      setConflictCount(0)
    }
  }, [currentWsId])

  // 首次加载及切换工作区时获取冲突数量
  useEffect(() => {
    refreshConflictCount()
  }, [refreshConflictCount])

  // 切换工作区时同步状态
  function handleSwitchWorkspace(id: string) {
    setCurrentWsId(id)
    setFilter('all')
    setSubjectFilter('all')
    setSearchQuery('')
    setViewMode('list')
  }

  // 按 subject 分类（v1.15 行动项 5）：从当前列表去重提取类别
  const subjects = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) set.add(e.subject)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [entries])

  const filtered = useMemo(() => {
    let list = entries
    if (filter !== 'all') list = list.filter((e) => e.status === filter)
    if (subjectFilter !== 'all') list = list.filter((e) => e.subject === subjectFilter)
    return list
  }, [entries, filter, subjectFilter])

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

  // ===== 自然语言修正记忆（v1.15 行动项 5） =====
  function openFeedback() {
    setShowFeedback(true)
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

  // ===== MMF 导出 =====
  async function handleExport() {
    if (!currentWsId) return
    setExporting(true)
    try {
      const json = await window.Memora.memory.exportMemory(currentWsId)
      const wsName = workspaces.find((ws) => ws.id === currentWsId)?.name || 'workspace'
      const dateStr = new Date().toISOString().slice(0, 10)
      await window.Memora.saveFileDialog({
        defaultName: `memora-${wsName}-${dateStr}.json`,
        content: json
      })
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  // ===== MMF 导入 =====
  function openImportModal() {
    setImportJsonText('')
    setImportResult(null)
    setShowImportModal(true)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setImportJsonText(text)
    } catch (err) {
      setImportResult(`✗ 读取文件失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      // 重置 input 以便同一文件可再次选择
      e.target.value = ''
    }
  }

  async function handleImport() {
    if (!currentWsId || !importJsonText.trim()) return
    setImporting(true)
    setImportResult(null)
    try {
      const result = await window.Memora.memory.importMemory(importJsonText.trim(), currentWsId)
      const { preferences, constitution, knowledge } = result.imported
      setImportResult(
        `✓ 导入成功：${preferences} 条偏好，${knowledge} 条知识，${constitution} 条宪法` +
          (result.skipped > 0 ? `（跳过 ${result.skipped} 条重复）` : '') +
          (result.errors.length > 0 ? `\n${result.errors.length} 条错误` : '')
      )
      await refresh()
    } catch (e) {
      setImportResult(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
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
          <span className="text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M12 5v14" /></svg>
          </span>
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
              列表
            </button>
            <button
              onClick={() => setViewMode('profile')}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                viewMode === 'profile' ? 'bg-accent text-white' : 'text-fg-muted hover:bg-bg-hover'
              }`}
              title="画像视图（按类别分组）"
            >
              画像
            </button>
            <button
              onClick={() => setViewMode('health')}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                viewMode === 'health' ? 'bg-accent text-white' : 'text-fg-muted hover:bg-bg-hover'
              }`}
              title="记忆健康视图（分层记忆与健康评分）"
            >
              健康
            </button>
            <button
              onClick={() => setViewMode('conflicts')}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                viewMode === 'conflicts' ? 'bg-accent text-white' : 'text-fg-muted hover:bg-bg-hover'
              }`}
              title="冲突解决视图（检测并处理偏好冲突）"
            >
              <span>冲突</span>
              {conflictCount > 0 && (
                <span
                  className={`text-[10px] px-1 rounded-full ${
                    viewMode === 'conflicts'
                      ? 'bg-white/30 text-white'
                      : 'bg-red-500/15 text-red-500'
                  }`}
                >
                  {conflictCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('constitution')}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                viewMode === 'constitution'
                  ? 'bg-amber-500 text-white'
                  : 'text-fg-muted hover:bg-bg-hover'
              }`}
              title="AI 宪法（所有 AI 工具都应遵循的核心原则）"
            >
              宪法
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
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
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
            onClick={openFeedback}
            disabled={!currentWsId || entries.length === 0}
            className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
            title="用自然语言修正记忆（如：我其实更喜欢 Vim 而不是 VS Code）"
          >
            修正记忆
          </button>
          <button
            onClick={handleDecay}
            disabled={decaying || !currentWsId}
            className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
            title="对长期未访问的偏好进行置信度衰减"
          >
            {decaying ? '衰减中…' : '运行衰减'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !currentWsId}
            className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
            title="导出当前工作区的全部记忆（偏好 + 宪法 + 知识 + 审计日志）为 MMF JSON 文件"
          >
            {exporting ? '导出中…' : '导出记忆'}
          </button>
          <button
            onClick={openImportModal}
            disabled={!currentWsId}
            className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
            title="从 MMF JSON 文件导入记忆到当前工作区"
          >
            导入记忆
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

        {/* 按类别分组过滤（v1.15 行动项 5） */}
        {viewMode === 'list' && subjects.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-fg-muted mr-0.5">类别:</span>
            <button
              onClick={() => setSubjectFilter('all')}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                subjectFilter === 'all'
                  ? 'bg-accent-muted text-accent'
                  : 'text-fg-muted hover:bg-bg-hover'
              }`}
            >
              全部
            </button>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setSubjectFilter(subjectFilter === s ? 'all' : s)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  subjectFilter === s
                    ? 'bg-accent-muted text-accent'
                    : 'text-fg-muted hover:bg-bg-hover'
                }`}
              >
                {s}
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

      {/* 列表 / 画像 / 健康 / 冲突 / 宪法 */}
      {viewMode === 'profile' ? (
        <ProfileView workspaceId={currentWsId} onEdit={(p) => setEditing(p)} />
      ) : viewMode === 'health' ? (
        <MemoryHealthView
          workspaceId={currentWsId}
          onNavigateConflicts={() => setViewMode('conflicts')}
        />
      ) : viewMode === 'conflicts' ? (
        <ConflictResolutionView
          workspaceId={currentWsId}
          onResolved={() => {
            refresh()
            refreshConflictCount()
          }}
        />
      ) : viewMode === 'constitution' ? (
        <ConstitutionView workspaceId={currentWsId} />
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
                <div className="mb-3 flex justify-center opacity-30 text-accent">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M12 5v14" /></svg>
                </div>
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

      {/* MMF 导入弹层 */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !importing && setShowImportModal(false)}
        >
          <div
            className="bg-bg-primary rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">导入记忆（MMF）</h3>
                <button
                  onClick={() => !importing && setShowImportModal(false)}
                  className="text-fg-muted hover:text-fg-primary text-sm"
                  disabled={importing}
                  title="关闭"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
                >
                  选择文件…
                </button>
                <span className="text-[11px] text-fg-muted">
                  选择 .json 文件，或直接在下方粘贴 MMF JSON 内容
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='粘贴 MMF JSON 内容（含 "format": "memora-memory-format" ...）'
                disabled={importing}
                className="Memora-input w-full text-xs font-mono"
                rows={10}
              />
              {importResult && (
                <p
                  className={`text-[11px] whitespace-pre-wrap break-all ${
                    importResult.startsWith('✓') ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {importResult}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button
                onClick={() => setShowImportModal(false)}
                disabled={importing}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importJsonText.trim()}
                className="Memora-btn Memora-btn-primary text-xs"
              >
                {importing ? '导入中…' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自然语言修正记忆弹层（v1.15 行动项 5） */}
      {showFeedback && (
        <FeedbackDialog
          entries={entries}
          workspaceId={currentWsId}
          onClose={() => setShowFeedback(false)}
          onApplied={() => refresh()}
        />
      )}

      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </div>
  )
}
