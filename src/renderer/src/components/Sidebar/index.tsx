import { useEffect, useState } from 'react'
import { useStore } from '../../stores/appStore'
import { useAiConfigStore, isAiConfigured } from '../../stores/aiConfigStore'
import type { Folder } from '@shared/types'

interface SidebarProps {
  onOpenAiSettings: () => void
  onOpenMemory: () => void
}

export function Sidebar({ onOpenAiSettings, onOpenMemory }: SidebarProps) {
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
    const sessions = await window.Memora.session.list(
      folderId ? { folderId } : undefined
    )
    setSessions(sessions)
  }

  async function handleCreateWorkspace() {
    const name = prompt('工作区名称')
    if (!name) return
    const ws = await window.Memora.workspace.create({ name })
    setWorkspaces([...workspaces, ws])
    handleSelectWorkspace(ws.id)
  }

  async function handleCreateFolder() {
    if (!activeWorkspaceId) return
    const name = prompt('文件夹名称')
    if (!name) return
    const folder = await window.Memora.folder.create({
      workspaceId: activeWorkspaceId,
      name
    })
    setLocalFolders([...folders, folder])
  }

  async function handleImport() {
    const filePaths = await window.Memora.openFileDialog({
      multiple: true,
      filters: [
        { name: 'AI 对话文件', extensions: ['json', 'md', 'markdown', 'txt'] }
      ]
    })
    if (!filePaths) return

    const folderId = activeFolderId ?? undefined
    for (const path of filePaths) {
      const result = await window.Memora.import.file(path, { folderId })
      if (result.errors.length > 0) {
        alert(`导入完成，但有错误：\n${result.errors.join('\n')}`)
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
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-white text-xs font-bold">
            Æ
          </div>
          <span className="font-semibold text-sm">Memora</span>
        </div>
        <button
          onClick={onOpenAiSettings}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            aiConfigured
              ? 'text-green-600 hover:bg-bg-hover'
              : 'text-fg-muted hover:bg-bg-hover'
          }`}
          title={aiConfigured ? 'AI 已配置（点击修改）' : '点击配置 AI'}
        >
          {aiConfigured ? '✓ AI' : '⚙ AI'}
        </button>
      </div>

      {/* 搜索框 */}
      <SearchBox onOpenAiSettings={onOpenAiSettings} />

      {/* 工作区列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">
            工作区
          </span>
          <button
            onClick={handleCreateWorkspace}
            className="text-fg-muted hover:text-fg-primary text-base leading-none"
            title="新建工作区"
          >
            +
          </button>
        </div>

        {workspaces.map((ws) => (
          <div key={ws.id}>
            <button
              onClick={() => handleSelectWorkspace(ws.id)}
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                activeWorkspaceId === ws.id
                  ? 'bg-bg-hover text-fg-primary'
                  : 'text-fg-secondary hover:bg-bg-hover'
              }`}
            >
              <span className="text-xs opacity-70">📁</span>
              <span className="truncate">{ws.name}</span>
            </button>

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
                  全部对话
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleSelectFolder(f.id)}
                    className={`w-full text-left px-2 py-1 rounded text-sm flex items-center gap-1.5 ${
                      activeFolderId === f.id
                        ? 'text-fg-primary bg-bg-hover'
                        : 'text-fg-muted hover:text-fg-secondary'
                    }`}
                  >
                    <span className="text-xs opacity-60">📂</span>
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
                <button
                  onClick={handleCreateFolder}
                  className="w-full text-left px-2 py-1 rounded text-xs text-fg-muted hover:text-fg-secondary"
                >
                  + 新建文件夹
                </button>
              </div>
            )}
          </div>
        ))}

        {workspaces.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-fg-muted mb-3">还没有工作区</p>
            <button onClick={handleCreateWorkspace} className="Memora-btn Memora-btn-primary text-xs">
              创建第一个工作区
            </button>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={onOpenMemory}
          className="Memora-btn Memora-btn-ghost w-full text-xs flex items-center justify-center gap-1.5"
          title="基于历史对话的智能问答"
        >
          🧠 Project Memory
        </button>
        <button
          onClick={handleImport}
          className="Memora-btn Memora-btn-ghost w-full text-xs"
          title="导入 AI 对话"
        >
          ⬆ 导入
        </button>
      </div>
    </aside>
  )
}

function SearchBox({ onOpenAiSettings }: { onOpenAiSettings: () => void }) {
  const { setSearch, clearSearch, setSessions } = useStore()
  const { config } = useAiConfigStore()
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
      setSearchError('请先配置 AI 才能使用语义搜索')
      return
    }

    setSearching(true)
    setSearchError(null)
    try {
      if (useSemantic) {
        const results = await window.Memora.semanticSearch(q, config, { limit: 20 })
        if (results.length === 0) {
          setSearchError('未找到语义相关结果（可能需要先建立向量索引）')
        }
        setSearch(q, null)
        setSessions(results.map((r) => r.session))
      } else {
        const results = await window.Memora.search(q)
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
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearch}
          placeholder={useSemantic ? '语义搜索... (Enter)' : '搜索对话... (Enter)'}
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
          title={aiConfigured ? '切换语义搜索' : '需先配置 AI'}
        >
          {useSemantic ? '◉ 语义' : '○ 语义'}
        </button>
        {searchError && (
          <span className="text-[10px] text-red-500 truncate max-w-[140px]" title={searchError}>
            {searchError}
          </span>
        )}
      </div>
    </div>
  )
}
