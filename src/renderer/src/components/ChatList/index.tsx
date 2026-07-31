import { useState } from 'react'
import { useStore } from '../../stores/appStore'
import { PROVIDER_META } from '@shared/constants'
import { useDialog, PromptDialog } from '../PromptDialog'
import type { Provider } from '@shared/types'

export function ChatList() {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    setActiveSessionData,
    isSearchMode,
    searchQuery,
    searchResults,
    activeFolderId,
    setSessions,
    pinnedIds,
    togglePin
  } = useStore()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchBar, setShowBatchBar] = useState(false)
  const dialog = useDialog()

  // 置顶的排前面
  const sortedSessions = [...sessions].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 1 : 0
    const bPinned = pinnedIds.has(b.id) ? 1 : 0
    if (aPinned !== bPinned) return bPinned - aPinned
    return b.updatedAt.localeCompare(a.updatedAt)
  })

  async function handleClick(sessionId: string, e: React.MouseEvent) {
    // Ctrl/Cmd 多选
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedIds)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      setSelectedIds(next)
      setShowBatchBar(next.size > 0)
      return
    }
    // Shift 范围选（简化：选到当前为止）
    if (e.shiftKey && selectedIds.size > 0) {
      const idx = sessions.findIndex((s) => s.id === sessionId)
      const lastSelected = sessions.findIndex((s) => selectedIds.has(s.id))
      if (lastSelected >= 0 && idx >= 0) {
        const [from, to] = [Math.min(idx, lastSelected), Math.max(idx, lastSelected)]
        const next = new Set(selectedIds)
        for (let i = from; i <= to; i++) next.add(sessions[i].id)
        setSelectedIds(next)
        setShowBatchBar(true)
        return
      }
    }
    // 单选
    setSelectedIds(new Set())
    setShowBatchBar(false)
    setActiveSession(sessionId)
    const session = await window.Memora.session.get(sessionId, true)
    setActiveSessionData(session)
  }

  async function handleToggleFavorite(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    await window.Memora.session.toggleFavorite(sessionId)
    const idx = sessions.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      const updated = [...sessions]
      updated[idx] = { ...updated[idx], isFavorite: !updated[idx].isFavorite }
      setSessions(updated)
    }
  }

  async function handleRename(e: React.MouseEvent, sessionId: string, oldTitle: string) {
    e.stopPropagation()
    const title = await dialog.prompt('对话标题', oldTitle)
    if (!title || title === oldTitle) return
    await window.Memora.session.update(sessionId, { title })
    const idx = sessions.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      const updated = [...sessions]
      updated[idx] = { ...updated[idx], title }
      setSessions(updated)
    }
  }

  async function handleDelete(e: React.MouseEvent, sessionId: string, title: string) {
    e.stopPropagation()
    const ok = await dialog.confirm(`确定删除「${title}」？此操作不可撤销。`)
    if (!ok) return
    await window.Memora.batch.deleteSessions([sessionId])
    // 刷新列表
    if (activeFolderId) {
      const sessions = await window.Memora.session.list({ folderId: activeFolderId })
      setSessions(sessions)
    } else {
      const ws = useStore.getState().activeWorkspaceId
      if (ws) {
        const tree = await window.Memora.workspace.tree(ws)
        if (tree) setSessions(tree.sessions)
      }
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedIds)
    const ok = await dialog.confirm(`确定删除 ${ids.length} 个对话？此操作不可撤销。`)
    if (!ok) return
    await window.Memora.batch.deleteSessions(ids)
    setSelectedIds(new Set())
    setShowBatchBar(false)
    // 刷新列表
    if (activeFolderId) {
      const sessions = await window.Memora.session.list({ folderId: activeFolderId })
      setSessions(sessions)
    } else {
      const ws = useStore.getState().activeWorkspaceId
      if (ws) {
        const tree = await window.Memora.workspace.tree(ws)
        if (tree) setSessions(tree.sessions)
      }
    }
  }

  async function handleBatchExport() {
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      const html = await window.Memora.share.exportHtml(id)
      if (html) {
        const session = sessions.find((s) => s.id === id)
        const name = session?.title.replace(/[^\w\u4e00-\u9fa5]/g, '_') ?? id
        await window.Memora.saveFileDialog({ defaultName: `${name}.html`, content: html })
      }
    }
    setSelectedIds(new Set())
    setShowBatchBar(false)
  }

  function handleClearSelection() {
    setSelectedIds(new Set())
    setShowBatchBar(false)
  }

  function selectAll() {
    setSelectedIds(new Set(sortedSessions.map((s) => s.id)))
    setShowBatchBar(true)
  }

  function deselectAll() {
    setSelectedIds(new Set())
    setShowBatchBar(false)
  }

  return (
    <div className="w-80 bg-bg-primary border-r border-border flex flex-col h-full">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">
            {isSearchMode ? `搜索: "${searchQuery}"` : '对话列表'}
          </h2>
          {sessions.length > 0 && (
            <button
              onClick={selectedIds.size === sortedSessions.length ? deselectAll : selectAll}
              className="text-xs text-fg-muted hover:text-fg-primary"
            >
              {selectedIds.size === sortedSessions.length ? '取消全选' : '全选'}
            </button>
          )}
        </div>
        <span className="text-xs text-fg-muted">{sessions.length}</span>
      </div>

      {/* 批量操作工具栏 */}
      {showBatchBar && (
        <div className="px-3 py-2 border-b border-border bg-bg-secondary flex items-center gap-1">
          <span className="text-xs text-fg-muted mr-2">已选 {selectedIds.size} / {sortedSessions.length}</span>
          <button
            onClick={selectedIds.size === sortedSessions.length ? deselectAll : selectAll}
            className="Memora-btn Memora-btn-ghost text-xs"
          >
            {selectedIds.size === sortedSessions.length ? '取消全选' : '全选'}
          </button>
          <button onClick={handleBatchDelete} className="Memora-btn text-xs text-red-500 hover:bg-red-500/10">
            🗑 删除选中
          </button>
          <button onClick={handleClearSelection} className="Memora-btn Memora-btn-ghost text-xs ml-auto">
            取消
          </button>
        </div>
      )}

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-fg-muted">
            {isSearchMode ? '没有匹配的对话' : '暂无对话，拖入文件或点击左下角"导入"'}
          </div>
        )}

        {sortedSessions.map((session) => {
          const meta = PROVIDER_META[session.provider as Provider] || PROVIDER_META.Unknown
          const searchResult = searchResults?.find((r) => r.session.id === session.id)
          const isSelected = selectedIds.has(session.id)
          return (
            <div
              key={session.id}
              onClick={(e) => handleClick(session.id, e)}
              className={`group px-4 py-3 border-b border-border transition-colors cursor-pointer ${
                activeSessionId === session.id
                  ? 'bg-bg-hover'
                  : isSelected
                  ? 'bg-accent-muted'
                  : 'hover:bg-bg-hover/50'
              } ${pinnedIds.has(session.id) ? 'border-l-2 border-l-accent' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-medium text-fg-primary line-clamp-1 flex-1">
                  {session.title}
                </h3>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(session.id) }}
                    className={`text-xs ${
                      pinnedIds.has(session.id)
                        ? 'text-accent'
                        : 'text-fg-muted opacity-0 group-hover:opacity-100'
                    }`}
                    title={pinnedIds.has(session.id) ? '取消置顶' : '置顶'}
                  >
                    📌
                  </button>
                  <button
                    onClick={(e) => handleRename(e, session.id, session.title)}
                    className="text-xs text-fg-muted opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
                    title="重命名"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => handleToggleFavorite(e, session.id)}
                    className={`text-xs ${
                      session.isFavorite ? 'text-yellow-500' : 'text-fg-muted opacity-0 group-hover:opacity-100'
                    }`}
                    title={session.isFavorite ? '取消收藏' : '收藏'}
                  >
                    {session.isFavorite ? '★' : '☆'}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, session.id, session.title)}
                    className="text-xs text-fg-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                    title="删除"
                  >
                    🗑
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                >
                  {meta.label}
                </span>
                {session.model && (
                  <span className="text-xs text-fg-muted">{session.model}</span>
                )}
                <span className="text-xs text-fg-muted ml-auto">
                  {formatDate(session.updatedAt)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <span>💬 {session.messageCount}</span>
                {session.tags.length > 0 && <span>🏷 {session.tags.length}</span>}
                {isSelected && <span className="ml-auto text-accent">✓ 已选</span>}
              </div>

              {/* 搜索结果片段 */}
              {searchResult && searchResult.snippets.length > 0 && (
                <div className="mt-2 px-2 py-1.5 bg-bg-tertiary rounded text-xs text-fg-secondary line-clamp-2">
                  {searchResult.snippets[0].snippet}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    if (days < 30) return `${Math.floor(days / 7)}周前`
    return `${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return ''
  }
}
