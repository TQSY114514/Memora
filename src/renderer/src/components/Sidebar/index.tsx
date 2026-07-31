import { useEffect, useState, useRef } from 'react'
import { useStore } from '../../stores/appStore'
import { useAiConfigStore, isAiConfigured, getActiveAiConfig } from '../../stores/aiConfigStore'
import { useT } from '../../i18n'
import { useDialog, PromptDialog } from '../PromptDialog'
import { PROVIDER_META } from '@shared/constants'
import type { Folder } from '@shared/types'

interface SidebarProps {
  searchInputRef: React.RefObject<HTMLInputElement>
  onOpenAiSettings: () => void
  onOpenMemory: () => void
  onOpenImportCenter: () => void
  onOpenSettings: () => void
}

export function Sidebar({ searchInputRef, onOpenAiSettings, onOpenMemory, onOpenImportCenter, onOpenSettings }: SidebarProps) {
  const {
    workspaces,
    activeWorkspaceId,
    activeFolderId,
    setActiveWorkspace,
    setActiveFolder,
    setWorkspaces,
    setFolders,
    setSessions,
    clearSearch
  } = useStore()
  const { config } = useAiConfigStore()
  const t = useT()
  const dialog = useDialog()

  const [folders, setLocalFolders] = useState<Folder[]>([])

  // 初始加载工作区列表
  useEffect(() => {
    refreshWorkspaces()
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
      // 选了具体文件夹，只查该文件夹的会话
      const sessions = await window.Memora.session.list({ folderId })
      setSessions(sessions)
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

  async function handleImport() {
    const filePaths = await window.Memora.openFileDialog({
      multiple: true,
      filters: [
        { name: 'AI 对话文件', extensions: ['json', 'md', 'markdown', 'txt'] }
      ]
    })
    if (!filePaths) return

    if (!activeFolderId) {
      await dialog.alert('请先选择一个文件夹再导入，以便对话能正确归类。')
      return
    }
    const folderId = activeFolderId
    for (const path of filePaths) {
      const result = await window.Memora.import.file(path, { folderId })
      if (result.errors.length > 0) {
        await dialog.alert(`导入完成，但有错误：\n${result.errors.join('\n')}`)
      }
    }
    // 刷新列表
    if (activeFolderId) {
      handleSelectFolder(activeFolderId)
    } else if (activeWorkspaceId) {
      handleSelectWorkspace(activeWorkspaceId)
    }
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
      <SearchBox searchInputRef={searchInputRef} onOpenAiSettings={onOpenAiSettings} />

      {/* 工作区列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">
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
                <span className="text-xs opacity-70">📁</span>
                <span className="truncate">{ws.name}</span>
              </button>
              <button
                onClick={() => handleRenameWorkspace(ws.id, ws.name)}
                className="text-fg-muted hover:text-accent text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title="重命名"
              >
                ✎
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
                    >
                      <span className="text-xs opacity-60">📂</span>
                      <span className="truncate">{f.name}</span>
                    </button>
                    <button
                      onClick={() => handleRenameFolder(f.id, f.name)}
                      className="text-fg-muted hover:text-accent text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="重命名"
                    >
                      ✎
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleCreateFolder}
                  className="w-full text-left px-2 py-1 rounded text-xs text-fg-muted hover:text-fg-secondary"
                >
                  {t('sidebar.newFolder')}
                </button>
              </div>
            )}
          </div>
        ))}

        {workspaces.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-fg-muted mb-3">{t('sidebar.noWorkspace')}</p>
            <button onClick={handleCreateWorkspace} className="Memora-btn Memora-btn-primary text-xs">
              {t('sidebar.createFirst')}
            </button>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={onOpenMemory}
          className="Memora-btn Memora-btn-ghost w-full text-xs flex items-center justify-center gap-1.5"
          title={t('sidebar.memoryTip')}
        >
          {t('sidebar.memory')}
        </button>
        <button
          onClick={onOpenImportCenter}
          className="Memora-btn Memora-btn-ghost w-full text-xs flex items-center justify-center gap-1.5"
          title={t('sidebar.importCenterTip')}
        >
          {t('sidebar.importCenter')}
        </button>
        <button
          onClick={handleImport}
          className="Memora-btn Memora-btn-ghost w-full text-xs"
          title={t('sidebar.manualImportTip')}
        >
          {t('sidebar.manualImport')}
        </button>
        <button
          onClick={onOpenSettings}
          className="Memora-btn Memora-btn-ghost w-full text-xs flex items-center justify-center gap-1.5"
          title={t('sidebar.settings')}
        >
          {t('sidebar.settings')}
        </button>
      </div>

      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </aside>
  )
}

function SearchBox({ searchInputRef, onOpenAiSettings }: { searchInputRef: React.RefObject<HTMLInputElement>; onOpenAiSettings: () => void }) {
  const { setSearch, clearSearch, setSessions, searchProvider, setSearchProvider } = useStore()
  const { config } = useAiConfigStore()
  const t = useT()
  const [query, setQuery] = useState('')
  const [useSemantic, setUseSemantic] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const aiConfigured = isAiConfigured(config)

  async function handleSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const q = query.trim()
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

    setSearching(true)
    setSearchError(null)
    try {
      if (useSemantic) {
        const results = await window.Memora.semanticSearch(q, getActiveAiConfig(), { limit: 20 })
        if (results.length === 0) {
          setSearchError(t('sidebar.semanticEmpty'))
        }
        setSearch(q, null)
        setSessions(results.map((r) => r.session))
      } else {
        const results = await window.Memora.search(q, { provider: searchProvider ?? undefined })
        setSearch(q, results)
        setSessions(results.map((r) => r.session))
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearch}
          placeholder={useSemantic ? t('sidebar.searchSemanticPlaceholder') : t('sidebar.searchPlaceholder')}
          className="Memora-input w-full text-xs pr-7"
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
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            useSemantic
              ? 'bg-accent text-white'
              : 'text-fg-muted hover:bg-bg-hover'
          }`}
          title={aiConfigured ? t('sidebar.toggleSemantic') : t('sidebar.needAi')}
        >
          {useSemantic ? t('sidebar.semanticOn') : t('sidebar.semanticOff')}
        </button>
        {searchError && (
          <span className="text-[10px] text-red-500 truncate max-w-[140px]" title={searchError}>
            {searchError}
          </span>
        )}
      </div>
      {/* 平台过滤 */}
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        <button
          onClick={() => setSearchProvider(null)}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            searchProvider === null ? 'bg-accent text-white' : 'text-fg-muted hover:bg-bg-hover'
          }`}
        >
          全部
        </button>
        {Object.entries(PROVIDER_META).filter(([k]) => k !== 'Unknown' && k !== 'Markdown' && k !== 'JSON' && k !== 'HTML').map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setSearchProvider(searchProvider === key ? null : key)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              searchProvider === key ? 'text-white' : 'hover:bg-bg-hover'
            }`}
            style={searchProvider === key ? { backgroundColor: meta.color } : { color: meta.color }}
          >
            {meta.label}
          </button>
        ))}
      </div>
    </div>
  )
}
