import { useEffect, useState, useRef } from 'react'
import { useStore } from '../../stores/appStore'
import { useAiConfigStore, isAiConfigured, getActiveAiConfig } from '../../stores/aiConfigStore'
import { useT } from '../../i18n'
import { useDialog, PromptDialog } from '../PromptDialog'
import { Modal } from '../Modal'
import { PROVIDER_META } from '@shared/constants'
import type { Folder, FolderRule, SearchResult } from '@shared/types'

interface SidebarProps {
  searchInputRef: React.RefObject<HTMLInputElement>
  onOpenAiSettings: () => void
  onOpenMemory: () => void
  onOpenSettings: () => void
  onOpenKnowledge: () => void
  onOpenPreferences: () => void
}

export function Sidebar({ searchInputRef, onOpenAiSettings, onOpenMemory, onOpenSettings, onOpenKnowledge, onOpenPreferences
}: SidebarProps) {
  const {
    workspaces,
    activeWorkspaceId,
    activeFolderId,
    setActiveWorkspace,
    setActiveFolder,
    setWorkspaces,
    setSessions,
    clearSearch
  } = useStore()
  const { config } = useAiConfigStore()
  const t = useT()
  const dialog = useDialog()

  const [folders, setLocalFolders] = useState<Folder[]>([])
  const [showSmartFolderDialog, setShowSmartFolderDialog] = useState(false)
  const [smartName, setSmartName] = useState('')
  const [smartKeywords, setSmartKeywords] = useState('')
  const [smartProviders, setSmartProviders] = useState('')

  // 初始加载工作区列表
  useEffect(() => {
    refreshWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次加载工作区列表
  }, [])

  // 工作区变化时加载其文件夹
  useEffect(() => {
    if (activeWorkspaceId) {
      window.Memora.folder.list(activeWorkspaceId).then(setLocalFolders)
    } else {
      setLocalFolders([])
    }
  }, [activeWorkspaceId])

  async function refreshWorkspaces() {
    const ws = await window.Memora.workspace.list()
    setWorkspaces(ws)
    if (ws.length > 0 && !activeWorkspaceId) {
      handleSelectWorkspace(ws[0].id)
    }
  }

  async function handleSelectWorkspace(id: string) {
    clearSearch()
    setActiveWorkspace(id)
    setActiveFolder(null)
    const tree = await window.Memora.workspace.tree(id)
    if (tree) {
      setLocalFolders(tree.rootFolders)
      setSessions(tree.sessions)
    }
  }

  async function handleSelectFolder(folderId: string | null) {
    setActiveFolder(folderId)
    if (folderId) {
      const folder = folders.find(f => f.id === folderId)
      if (folder?.rule) {
        // 智能文件夹：按规则查
        const sessions = await window.Memora.session.listByRule(activeWorkspaceId!, folder.rule)
        setSessions(sessions)
      } else {
        // 普通文件夹
        const sessions = await window.Memora.session.list({ folderId })
        setSessions(sessions)
      }
    } else {
      // "全部聊天"：查当前工作区的全部会话（含未分组的）
      if (activeWorkspaceId) {
        const tree = await window.Memora.workspace.tree(activeWorkspaceId)
        if (tree) setSessions(tree.sessions)
      } else {
        setSessions([])
      }
    }
  }

  async function handleCreateWorkspace() {
    const name = await dialog.prompt(t('sidebar.workspaceName'))
    if (!name) return
    const ws = await window.Memora.workspace.create({ name })
    setWorkspaces([...workspaces, ws])
    handleSelectWorkspace(ws.id)
  }

  async function handleRenameWorkspace(id: string, oldName: string) {
    const name = await dialog.prompt(t('sidebar.workspaceName'), oldName)
    if (!name || name === oldName) return
    await window.Memora.workspace.update(id, { name })
    setWorkspaces(workspaces.map((ws) => (ws.id === id ? { ...ws, name } : ws)))
  }

  async function handleCreateSmartFolder() {
    if (!activeWorkspaceId) return
    if (!smartName.trim()) {
      await dialog.alert('请输入文件夹名称')
      return
    }
    const rule: FolderRule = {}
    if (smartKeywords.trim()) {
      rule.keywords = smartKeywords.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
    }
    if (smartProviders.trim()) {
      rule.providers = smartProviders.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
    }
    if (Object.keys(rule).length === 0) {
      await dialog.alert('请至少设置一个规则（关键词或平台）')
      return
    }
    const folder = await window.Memora.folder.create({
      workspaceId: activeWorkspaceId,
      name: smartName.trim(),
      rule
    })
    setLocalFolders([...folders, folder])
    setSmartName('')
    setSmartKeywords('')
    setSmartProviders('')
    setShowSmartFolderDialog(false)
  }

  async function handleCreateFolder() {
    if (!activeWorkspaceId) return
    const name = await dialog.prompt(t('sidebar.folderName'))
    if (!name) return
    const folder = await window.Memora.folder.create({
      workspaceId: activeWorkspaceId,
      name
    })
    setLocalFolders([...folders, folder])
  }

  async function handleRenameFolder(id: string, oldName: string) {
    const name = await dialog.prompt(t('sidebar.folderName'), oldName)
    if (!name || name === oldName) return
    await window.Memora.folder.update(id, { name })
    setLocalFolders(folders.map((f) => (f.id === id ? { ...f, name } : f)))
  }

  const aiConfigured = isAiConfigured(config)

  return (
    <aside className="w-60 bg-bg-secondary border-r border-border flex flex-col h-full">
      {/* 顶部 Logo */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="./assets/logo-mark.svg" alt="Memora" className="w-6 h-6 rounded-md" />
          <span className="font-semibold text-sm">Memora</span>
        </div>
        <button
          onClick={onOpenAiSettings}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            aiConfigured
              ? 'text-green-600 hover:bg-bg-hover'
              : 'text-fg-muted hover:bg-bg-hover'
          }`}
          title={aiConfigured ? t('sidebar.aiConfigured') : t('sidebar.aiNotConfigured')}
        >
          {aiConfigured ? t('sidebar.aiOk') : t('sidebar.aiSetup')}
        </button>
      </div>

      {/* 搜索框 */}
      <SearchBox searchInputRef={searchInputRef} onOpenAiSettings={onOpenAiSettings} onSearchCleared={() => handleSelectFolder(activeFolderId)} />

      {/* 工作区列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="Memora-label">
            {t('sidebar.workspace')}
          </span>
          <button
            onClick={handleCreateWorkspace}
            className="text-fg-muted hover:text-fg-primary text-base leading-none"
            title={t('sidebar.newWorkspace')}
          >
            +
          </button>
        </div>

        {workspaces.map((ws) => (
          <div key={ws.id}>
            <div className="flex items-center group">
              <button
                onClick={() => handleSelectWorkspace(ws.id)}
                onDoubleClick={() => handleRenameWorkspace(ws.id, ws.name)}
                className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                  activeWorkspaceId === ws.id
                    ? 'bg-bg-hover text-fg-primary'
                    : 'text-fg-secondary hover:bg-bg-hover'
                }`}
              >
                <span className="truncate">{ws.name}</span>
              </button>
              <button
                onClick={() => handleRenameWorkspace(ws.id, ws.name)}
                className="text-fg-muted hover:text-accent text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title="重命名"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              </button>
            </div>

            {/* 展开当前工作区的文件夹 */}
            {activeWorkspaceId === ws.id && (
              <div className="ml-3 mt-0.5 border-l border-border pl-2">
                <button
                  onClick={() => handleSelectFolder(null)}
                  className={`w-full text-left px-2 py-1 rounded text-sm ${
                    activeFolderId === null
                      ? 'text-fg-primary bg-bg-hover'
                      : 'text-fg-muted hover:text-fg-secondary'
                  }`}
                >
                  {t('sidebar.allChats')}
                </button>
                {folders.map((f) => (
                  <div key={f.id} className="flex items-center group">
                    <button
                      onClick={() => handleSelectFolder(f.id)}
                      onDoubleClick={() => handleRenameFolder(f.id, f.name)}
                      className={`flex-1 text-left px-2 py-1 rounded text-sm flex items-center gap-1.5 ${
                        activeFolderId === f.id
                          ? 'text-fg-primary bg-bg-hover'
                          : 'text-fg-muted hover:text-fg-secondary'
                      }`}
                      title={f.rule ? '智能文件夹' : ''}
                    >
                      <span className="truncate">{f.name}</span>
                    </button>
                    <button
                      onClick={() => handleRenameFolder(f.id, f.name)}
                      className="text-fg-muted hover:text-accent text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="重命名"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleCreateFolder}
                  className="w-full text-left px-2 py-1 rounded text-xs text-fg-muted hover:text-fg-secondary"
                >
                  {t('sidebar.newFolder')}
                </button>
                <button
                  onClick={() => setShowSmartFolderDialog(true)}
                  className="w-full text-left px-2 py-1 rounded text-xs text-fg-muted hover:text-fg-secondary"
                >
                  + 智能文件夹
                </button>
              </div>
            )}
          </div>
        ))}

        {workspaces.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-fg-muted mb-3">{t('sidebar.noWorkspace')}</p>
            <button onClick={handleCreateWorkspace} className="Memora-btn Memora-btn-primary">
              {t('sidebar.createFirst')}
            </button>
          </div>
        )}
      </div>

      {/* 底部操作（折叠：核心项常驻，其余默认收起） */}
      <div className="border-t border-border p-2">
        <div className="px-2 py-1">
          <span className="Memora-label">记忆中枢</span>
        </div>
        <div className="space-y-0.5">
        <button
          onClick={onOpenMemory}
          className="Memora-btn Memora-btn-ghost w-full text-sm flex items-center gap-2 px-2 py-1.5 justify-start"
          title={t('sidebar.memoryTip')}
        >
          {t('sidebar.memory')}
        </button>
        <button
          onClick={onOpenKnowledge}
          className="Memora-btn Memora-btn-ghost w-full text-sm flex items-center gap-2 px-2 py-1.5 justify-start"
          title={t('sidebar.knowledgeTip')}
        >
          {t('sidebar.knowledge')}
        </button>
        <button
          onClick={onOpenPreferences}
          className="Memora-btn Memora-btn-ghost w-full text-sm flex items-center gap-2 px-2 py-1.5 justify-start"
          title={t('sidebar.preferencesTip')}
        >
          {t('sidebar.preferences')}
        </button>
        </div>
        <button
          onClick={onOpenSettings}
          className="Memora-btn Memora-btn-ghost w-full mt-1.5 text-sm flex items-center justify-center gap-1.5"
          title={t('sidebar.settings')}
        >
          {t('sidebar.settings')}
        </button>
      </div>

      {showSmartFolderDialog && (
        <Modal onClose={() => setShowSmartFolderDialog(false)} className="w-96 max-h-[90vh] overflow-y-auto">
          <div className="p-5">
            <h3 className="text-sm font-semibold mb-3">创建智能文件夹</h3>
            <p className="text-xs text-fg-muted mb-3">根据规则自动归类对话，无需手动移动。</p>
            <label className="block text-xs text-fg-secondary mb-1">名称</label>
            <input
              type="text"
              value={smartName}
              onChange={(e) => setSmartName(e.target.value)}
              className="Memora-input w-full mb-3"
              placeholder="如：Claude 项目相关"
            />
            <label className="block text-xs text-fg-secondary mb-1">关键词（逗号分隔，标题/描述含任一即命中）</label>
            <input
              type="text"
              value={smartKeywords}
              onChange={(e) => setSmartKeywords(e.target.value)}
              className="Memora-input w-full mb-3"
              placeholder="如：aether, 架构, bug"
            />
            <label className="block text-xs text-fg-secondary mb-1">平台（逗号分隔，如 Claude, ChatGPT）</label>
            <input
              type="text"
              value={smartProviders}
              onChange={(e) => setSmartProviders(e.target.value)}
              className="Memora-input w-full mb-3"
              placeholder="如：Claude, ChatGPT"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSmartFolderDialog(false)} className="Memora-btn Memora-btn-ghost">取消</button>
              <button onClick={handleCreateSmartFolder} className="Memora-btn Memora-btn-primary">创建</button>
            </div>
          </div>
        </Modal>
      )}
      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </aside>
  )
}

function SearchBox({ searchInputRef, onOpenAiSettings, onSearchCleared }: { searchInputRef: React.RefObject<HTMLInputElement>; onOpenAiSettings: () => void; onSearchCleared: () => void }) {
  const { setSearch, clearSearch, setSessions, searchProvider, setSearchProvider } = useStore()
  const { config } = useAiConfigStore()
  const t = useT()
  const [query, setQuery] = useState('')
  const [useSemantic, setUseSemantic] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aiConfigured = isAiConfigured(config)

  // 真正执行搜索（防抖和 Enter 都调这个）
  async function doSearch(q: string) {
    if (!q) {
      clearSearch()
      setSearchError(null)
      return
    }

    // 语义搜索需要先配置 AI
    if (useSemantic && !aiConfigured) {
      setSearchError(t('sidebar.needAiSemantic'))
      return
    }

    // 实时读取最新平台过滤，避免闭包中的 searchProvider 过期
    const provider = useStore.getState().searchProvider ?? undefined

    setSearching(true)
    setSearchError(null)
    try {
      if (useSemantic) {
        const results = await window.Memora.semanticSearch(q, getActiveAiConfig(), { limit: 20 })
        if (results.length === 0) {
          setSearchError(t('sidebar.semanticEmpty'))
        }
        // 将语义搜索结果适配为 SearchResult[]，使 ChatList 能显示相关度百分比和命中片段
        const adapted: SearchResult[] = results.map((r) => ({
          session: r.session,
          rank: r.score,
          snippets: [{ snippet: r.snippet, messageId: r.messageId, sessionId: r.session.id }]
        }))
        setSearch(q, adapted)
        setSessions(results.map((r) => r.session))
      } else {
        const results = await window.Memora.search(q, { provider })
        setSearch(q, results)
        setSessions(results.map((r) => r.session))
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  // 切换平台过滤：更新状态；若有搜索词则立即重搜，否则由 ChatList 对当前列表生效
  function handleProviderFilter(p: string | null) {
    setSearchProvider(p)
    if (query.trim()) {
      doSearch(query.trim())
    }
  }

  // 防抖：输入停顿 300ms 后自动搜索（非语义模式，语义模式成本高保持 Enter 触发）
  function scheduleDebouncedSearch(q: string) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (useSemantic) return // 语义模式不自动触发，避免频繁 API 调用
    debounceTimer.current = setTimeout(() => {
      doSearch(q.trim())
    }, 300)
  }

  // Enter 立即搜索（取消 pending 的防抖）
  async function handleSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    await doSearch(query.trim())
  }

  // 清空时立即清除搜索
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    if (!v.trim()) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      clearSearch()
      setSearchError(null)
      // 恢复完整会话列表：重新加载当前工作区/文件夹的会话
      // 避免清空搜索后仍显示搜索结果的子集
      onSearchCleared()
    } else {
      scheduleDebouncedSearch(v.trim())
    }
  }

  function toggleSemantic() {
    if (!aiConfigured && !useSemantic) {
      onOpenAiSettings()
      return
    }
    setUseSemantic(!useSemantic)
    setSearchError(null)
  }

  return (
    <div className="px-3 py-2 border-b border-border">
      <div className="relative">
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleSearch}
          placeholder={useSemantic ? t('sidebar.searchSemanticPlaceholder') : t('sidebar.searchPlaceholder')}
          className="Memora-input w-full pr-7"
        />
        {searching && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <button
          onClick={toggleSemantic}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${
            useSemantic
              ? 'Memora-chip-accent'
              : 'text-fg-muted hover:bg-bg-hover'
          }`}
          title={aiConfigured ? t('sidebar.toggleSemantic') : t('sidebar.needAi')}
        >
          {useSemantic ? t('sidebar.semanticOn') : t('sidebar.semanticOff')}
        </button>
        {searchError && (
          <span className="text-xs text-red-500 truncate max-w-[140px]" title={searchError}>
            {searchError}
          </span>
        )}
      </div>
      {/* 平台过滤（折叠为单行滚动，弱化视觉权重） */}
      <div className="flex items-center gap-1 mt-1.5 overflow-x-auto no-scrollbar">
        <span className="text-xs text-fg-muted shrink-0 opacity-60">平台</span>
        <button
          onClick={() => handleProviderFilter(null)}
          className={`text-xs px-2 py-0.5 rounded shrink-0 transition-colors ${
            searchProvider === null ? 'Memora-chip-accent' : 'text-fg-muted hover:bg-bg-hover'
          }`}
        >
          全部
        </button>
        {Object.entries(PROVIDER_META).filter(([k]) => k !== 'Unknown' && k !== 'Markdown' && k !== 'JSON' && k !== 'HTML').map(([key, meta]) => (
          <button
            key={key}
            onClick={() => handleProviderFilter(searchProvider === key ? null : key)}
            className={`text-xs px-2 py-0.5 rounded shrink-0 transition-colors ${
              searchProvider === key ? 'Memora-chip-accent' : 'text-fg-muted hover:text-fg-secondary hover:bg-bg-hover'
            }`}
            style={searchProvider === key ? { backgroundColor: meta.color } : undefined}
          >
            {meta.label}
          </button>
        ))}
      </div>
    </div>
  )
}
