import { useState, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../../stores/appStore'
import { PROVIDER_META } from '@shared/constants'
import { useDialog, PromptDialog } from '../PromptDialog'
import { SnippetRenderer } from '../SnippetRenderer'
import type { Provider, ChatSession, SearchResult } from '@shared/types'

export function ChatList() {
  // selector 订阅：每个字段独立订阅，搜索击键改 searchQuery 只触发需重渲染的订阅，
  // 不再因无关 state（loading/error/workspaces）变化导致整个列表重渲染
  const sessions = useStore((s) => s.sessions)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const setActiveSessionData = useStore((s) => s.setActiveSessionData)
  const isSearchMode = useStore((s) => s.isSearchMode)
  const searchQuery = useStore((s) => s.searchQuery)
  const searchResults = useStore((s) => s.searchResults)
  const activeFolderId = useStore((s) => s.activeFolderId)
  const setSessions = useStore((s) => s.setSessions)
  const pinnedIds = useStore((s) => s.pinnedIds)
  const togglePin = useStore((s) => s.togglePin)
  const unpinIds = useStore((s) => s.unpinIds)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchBar, setShowBatchBar] = useState(false)
  const dialog = useDialog()
  // shift 范围选择的锚点：最近一次点击/选中的会话（而非 findIndex 第一个选中项）
  const lastSelectedRef = useRef<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0
      const bPinned = pinnedIds.has(b.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  }, [sessions, pinnedIds])

  const { searchMap, rankRange } = useMemo(() => {
    const map = new Map<string, SearchResult>()
    let min = Infinity
    let max = -Infinity
    for (const r of searchResults ?? []) {
      map.set(r.session.id, r)
      if (r.rank < min) min = r.rank
      if (r.rank > max) max = r.rank
    }
    return { searchMap: map, rankRange: { min, max } }
  }, [searchResults])

  const virtualizer = useVirtualizer({
    count: sortedSessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 104,
    overscan: 6
  })

  async function handleClick(sessionId: string, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedIds)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      setSelectedIds(next)
      setShowBatchBar(next.size > 0)
      lastSelectedRef.current = sessionId
      return
    }
    if (e.shiftKey && selectedIds.size > 0) {
      const idx = sortedSessions.findIndex((s) => s.id === sessionId)
      // 锚点 = 最近一次点击/选中的会话；若为空回退到第一个选中项
      const anchorId = lastSelectedRef.current ?? Array.from(selectedIds)[0]
      const anchorIdx = sortedSessions.findIndex((s) => s.id === anchorId)
      if (anchorIdx >= 0 && idx >= 0) {
        const [from, to] = [Math.min(idx, anchorIdx), Math.max(idx, anchorIdx)]
        const next = new Set(selectedIds)
        for (let i = from; i <= to; i++) next.add(sortedSessions[i].id)
        setSelectedIds(next)
        setShowBatchBar(true)
        lastSelectedRef.current = sessionId
        return
      }
    }
    setSelectedIds(new Set())
    setShowBatchBar(false)
    lastSelectedRef.current = sessionId
    setActiveSession(sessionId)
    try {
      const session = await window.Memora.session.get(sessionId, false)
      setActiveSessionData(session)
    } catch (e) {
      dialog.alert('加载对话失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleToggleFavorite(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    // 乐观更新：先改 UI，失败时回滚
    const idx = sessions.findIndex((s) => s.id === sessionId)
    const prevFavorite = idx >= 0 ? sessions[idx].isFavorite : false
    if (idx >= 0) {
      const updated = [...sessions]
      updated[idx] = { ...updated[idx], isFavorite: !prevFavorite }
      setSessions(updated)
    }
    try {
      await window.Memora.session.toggleFavorite(sessionId)
    } catch (e) {
      // 回滚
      if (idx >= 0) {
        const updated = [...sessions]
        updated[idx] = { ...updated[idx], isFavorite: prevFavorite }
        setSessions(updated)
      }
      dialog.alert('操作失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleRename(e: React.MouseEvent, sessionId: string, oldTitle: string) {
    e.stopPropagation()
    const title = await dialog.prompt('对话标题', oldTitle)
    if (!title || title === oldTitle) return
    try {
      await window.Memora.session.update(sessionId, { title })
      const idx = sessions.findIndex((s) => s.id === sessionId)
      if (idx >= 0) {
        const updated = [...sessions]
        updated[idx] = { ...updated[idx], title }
        setSessions(updated)
      }
    } catch (e) {
      dialog.alert('重命名失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleDelete(e: React.MouseEvent, sessionId: string, title: string) {
    e.stopPropagation()
    const ok = await dialog.confirm(`确定删除「${title}」？此操作不可撤销。`)
    if (!ok) return
    try {
      await window.Memora.session.delete(sessionId)
      clearDeletedState([sessionId])
      refreshList()
    } catch (e) {
      dialog.alert('删除失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedIds)
    const ok = await dialog.confirm(`确定删除 ${ids.length} 个对话？此操作不可撤销。`)
    if (!ok) return
    try {
      await window.Memora.batch.deleteSessions(ids)
      setSelectedIds(new Set())
      setShowBatchBar(false)
      lastSelectedRef.current = null
      clearDeletedState(ids)
      refreshList()
    } catch (e) {
      dialog.alert('批量删除失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  /** 删除后清理：激活会话指向已删除项时清空；置顶残留 ID 移除 */
  function clearDeletedState(deletedIds: string[]) {
    const deleted = new Set(deletedIds)
    if (activeSessionId && deleted.has(activeSessionId)) {
      setActiveSession(null)
      setActiveSessionData(null)
    }
    const stalePinned = Array.from(pinnedIds).filter((id) => deleted.has(id))
    if (stalePinned.length > 0) unpinIds(stalePinned)
  }

  async function refreshList() {
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
            删除选中
          </button>
          <button onClick={handleClearSelection} className="Memora-btn Memora-btn-ghost text-xs ml-auto">
            取消
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-fg-muted">
            {isSearchMode ? '没有匹配的对话' : '暂无对话，拖入文件或点击左下角"导入"'}
          </div>
        )}

        {sortedSessions.length > 0 && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const session = sortedSessions[virtualItem.index]
              return (
                <div
                  key={session.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`
                  }}
                >
                  <ChatListItem
                    session={session}
                    isActive={activeSessionId === session.id}
                    isSelected={selectedIds.has(session.id)}
                    isPinned={pinnedIds.has(session.id)}
                    searchResult={searchMap.get(session.id)}
                    rankRange={rankRange}
                    onClick={(e) => handleClick(session.id, e)}
                    onRename={(e) => handleRename(e, session.id, session.title)}
                    onToggleFavorite={(e) => handleToggleFavorite(e, session.id)}
                    onDelete={(e) => handleDelete(e, session.id, session.title)}
                    onTogglePin={(e) => { e.stopPropagation(); togglePin(session.id) }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </div>
  )
}

const ChatListItem = ({
  session,
  isActive,
  isSelected,
  isPinned,
  searchResult,
  rankRange,
  onClick,
  onRename,
  onToggleFavorite,
  onDelete,
  onTogglePin
}: {
  session: ChatSession
  isActive: boolean
  isSelected: boolean
  isPinned: boolean
  searchResult?: SearchResult
  rankRange: { min: number; max: number }
  onClick: (e: React.MouseEvent) => void
  onRename: (e: React.MouseEvent) => void
  onToggleFavorite: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onTogglePin: (e: React.MouseEvent) => void
}) => {
  const meta = PROVIDER_META[session.provider as Provider] || PROVIDER_META.Unknown

  let relevancePct: number | null = null
  if (searchResult) {
    const { min, max } = rankRange
    if (max !== min && Number.isFinite(min) && Number.isFinite(max)) {
      const score = (searchResult.rank - max) / (min - max)
      relevancePct = Math.round(score * 98 + 1)
    } else {
      relevancePct = 99
    }
  }

  return (
    <div
      onClick={onClick}
      className={`group px-4 py-3 border-b border-border transition-colors cursor-pointer ${
        isActive
          ? 'bg-bg-hover'
          : isSelected
          ? 'bg-accent-muted'
          : 'hover:bg-bg-hover/50'
      } ${isPinned ? 'border-l-2 border-l-accent' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-medium text-fg-primary line-clamp-1 flex-1">
          {session.title}
        </h3>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onTogglePin}
            className={`text-xs ${
              isPinned ? 'text-accent' : 'text-fg-muted opacity-0 group-hover:opacity-100'
            }`}
            title={isPinned ? '取消置顶' : '置顶'}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" /></svg>
          </button>
          <button
            onClick={onRename}
            className="text-xs text-fg-muted opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
            title="重命名"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          </button>
          <button
            onClick={onToggleFavorite}
            className={`text-xs ${
              session.isFavorite ? 'text-yellow-500' : 'text-fg-muted opacity-0 group-hover:opacity-100'
            }`}
            title={session.isFavorite ? '取消收藏' : '收藏'}
          >
            {session.isFavorite ? '★' : '☆'}
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-fg-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
            title="删除"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
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
        <span>{session.messageCount}</span>
        {session.tags.length > 0 && <span>{session.tags.length} 标签</span>}
        {isSelected && <span className="ml-auto text-accent">✓ 已选</span>}
        {relevancePct !== null && !isSelected && (
          <span className="ml-auto text-green-600">相关度 {relevancePct}%</span>
        )}
      </div>

      {searchResult && searchResult.snippets.length > 0 && (
        <div className="mt-2 px-2 py-1.5 bg-bg-tertiary rounded text-xs text-fg-secondary line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-black [&_mark]:px-0.5 [&_mark]:rounded dark:[&_mark]:bg-yellow-500 dark:[&_mark]:text-black">
          <SnippetRenderer html={searchResult.snippets[0].snippet} />
        </div>
      )}
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
