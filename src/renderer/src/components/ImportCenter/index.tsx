import { useEffect, useState, useMemo } from 'react'
import { useStore } from '../../stores/appStore'
import { PROVIDER_META } from '@shared/constants'
import type { Provider, ScanPreview, DetectedApp, ExtractedSession } from '@shared/types'

interface ImportCenterProps {
  onClose: () => void
}

type View = 'apps' | 'sessions'

/**
 * 智能导入中心 v2
 *
 * 两步式流程：
 * 1. 应用检测：扫描本机已安装的 AI 应用，按平台展示卡片
 *    - 可扒取（Cursor/Claude Code）→ 一键扒取本地记录
 *    - 云端应用（ChatGPT/Claude/Gemini…）→ 引导用户去网页导出
 *    - 文件扫描 → 扫描 Downloads/Documents 中的导出文件
 * 2. 对话列表：扒取/扫描结果按 AI 分组，每条可编辑标题和来源标注
 */
export function ImportCenter({ onClose }: ImportCenterProps) {
  const { activeFolderId, activeWorkspaceId, setSessions } = useStore()
  const [view, setView] = useState<View>('apps')
  const [apps, setApps] = useState<DetectedApp[]>([])
  const [detecting, setDetecting] = useState(false)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedSession[]>([])
  const [scanFiles, setScanFiles] = useState<ScanPreview[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirs, setDirs] = useState<string[]>([])

  // 可编辑的标题/来源映射（id → { title, source }）
  const [edits, setEdits] = useState<Record<string, { title: string; source: string }>>({})

  useEffect(() => {
    handleDetect()
    window.Memora.scanner.getDefaultDirs().then(setDirs).catch(() => {})
  }, [])

  // ===== 第一步：检测已安装的 AI 应用 =====
  async function handleDetect() {
    setDetecting(true)
    setError(null)
    try {
      const result = await window.Memora.scanner.detectApps()
      setApps(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDetecting(false)
    }
  }

  // 扒取某个 AI 应用的本地记录
  async function handleExtract(app: DetectedApp) {
    if (!app.dataPath) return
    setExtracting(app.provider)
    setError(null)
    try {
      const sessions = await window.Memora.scanner.extractApp(app.provider, app.dataPath, {
        maxSessions: 2000
      })
      if (sessions.length === 0) {
        setError(`${app.name} 未扒取到对话（可能数据库为空或格式不兼容）`)
      } else {
        // 去重：按 provider + title + createdAt 避免累积重复
        setExtracted((prev) => {
          const existing = new Set(prev.map((s) => `${s.provider}|${s.title}|${s.createdAt}`))
          const fresh = sessions.filter((s) => !existing.has(`${s.provider}|${s.title}|${s.createdAt}`))
          return [...prev, ...fresh]
        })
        // 初始化编辑状态
        const newEdits: Record<string, { title: string; source: string }> = {}
        for (const s of sessions) {
          newEdits[s.id] = { title: s.title, source: s.source }
        }
        setEdits((prev) => ({ ...prev, ...newEdits }))
        setView('sessions')
      }
    } catch (e) {
      setError(`${app.name} 扒取失败: ${(e as Error).message}`)
    } finally {
      setExtracting(null)
    }
  }

  // 扫描本地文件（Downloads/Documents）
  async function handleScanFiles() {
    setScanning(true)
    setError(null)
    try {
      const results = await window.Memora.scanner.scan(dirs, { maxDepth: 2, maxFiles: 500 })
      const files = results.flatMap((r) => r.files).filter((f) => f.ext !== '.zip')
      setScanFiles(files)
      if (files.length > 0) setView('sessions')
      else setError('未在 Downloads/Documents 中发现 AI 对话文件')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  // ===== 第二步：对话列表（可编辑标题/来源） =====
  const allItems = useMemo(() => {
    const items: Array<{
      kind: 'extracted' | 'file'
      id: string
      provider: Provider | 'Unknown'
      title: string
      source: string
      messageCount: number | null
      createdAt: string
      filePath?: string
    }> = []
    for (const s of extracted) {
      items.push({
        kind: 'extracted',
        id: s.id,
        provider: s.provider,
        title: edits[s.id]?.title ?? s.title,
        source: edits[s.id]?.source ?? s.source,
        messageCount: s.messageCount,
        createdAt: s.createdAt
      })
    }
    for (const f of scanFiles) {
      items.push({
        kind: 'file',
        id: f.filePath,
        provider: f.provider,
        title: f.fileName,
        source: f.filePath,
        messageCount: f.estimatedSessions,
        createdAt: f.mtime
      })
    }
    return items
  }, [extracted, scanFiles, edits])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof allItems>()
    for (const it of allItems) {
      const key = it.provider
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [allItems])

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleGroup(group: typeof allItems) {
    const allSelected = group.every((it) => selected.has(it.id))
    const next = new Set(selected)
    for (const it of group) {
      if (allSelected) next.delete(it.id)
      else next.add(it.id)
    }
    setSelected(next)
  }

  function updateEdit(id: string, field: 'title' | 'source', value: string) {
    setEdits((prev) => ({
      ...prev,
      [id]: { title: prev[id]?.title ?? '', source: prev[id]?.source ?? '', [field]: value }
    }))
  }

  // 导入选中的对话
  async function handleImport() {
    if (selected.size === 0) return
    if (!activeFolderId) {
      setError('请先在侧边栏选择一个文件夹，再导入对话。「全部聊天」只是查看视图，不能作为导入目标。')
      return
    }
    setImporting(true)
    setError(null)
    let hasError = false
    try {
      const folderId = activeFolderId ?? undefined

      // 1. 导入扒取的对话（内存中，应用编辑后的标题/来源）
      const selectedExtracted = extracted.filter((s) => selected.has(s.id))
      if (selectedExtracted.length > 0) {
        const toImport = selectedExtracted.map((s) => ({
          ...s,
          title: edits[s.id]?.title ?? s.title,
          source: edits[s.id]?.source ?? s.source
        }))
        const result = await window.Memora.import.extracted(toImport, { folderId })
        if (result.errors.length > 0) {
          setError(result.errors.join('\n'))
          hasError = true
        }
      }

      // 2. 导入扫描的文件（按路径）
      const selectedFiles = scanFiles.filter((f) => selected.has(f.filePath)).map((f) => f.filePath)
      if (selectedFiles.length > 0) {
        for (const p of selectedFiles) {
          const r = await window.Memora.import.file(p, { folderId })
          if (r.errors.length > 0) {
            setError(r.errors.join('\n'))
            hasError = true
          }
        }
      }

      // 刷新列表
      if (activeFolderId) {
        const sessions = await window.Memora.session.list({ folderId: activeFolderId })
        setSessions(sessions)
      } else if (activeWorkspaceId) {
        const tree = await window.Memora.workspace.tree(activeWorkspaceId)
        if (tree) setSessions(tree.sessions)
      }

      // 有错误时不关闭弹窗，让用户看到失败原因
      if (!hasError) {
        onClose()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function selectAll() {
    setSelected(new Set(allItems.map((it) => it.id)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function removeSelected() {
    // 从扒取列表移除选中的项目
    const selectedIds = new Set(selected)
    setExtracted((prev) => prev.filter((s) => !selectedIds.has(s.id)))
    setScanFiles((prev) => prev.filter((f) => !selectedIds.has(f.filePath)))
    // 同时清理编辑状态
    setEdits((prev) => {
      const next = { ...prev }
      for (const id of selectedIds) delete next[id]
      return next
    })
    setSelected(new Set())
  }

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-xl shadow-2xl w-[900px] max-w-[94vw] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            {view === 'sessions' && (
              <button
                onClick={() => setView('apps')}
                className="text-xs text-fg-muted hover:text-fg-primary"
              >
                ← 返回
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold">智能导入中心</h2>
              <p className="text-xs text-fg-muted mt-0.5">
                {view === 'apps'
                  ? '检测已安装的 AI 应用 · 可扒取的自动扒取，云端的引导导出'
                  : '勾选要导入的对话 · 可编辑标题和来源标注'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-xl leading-none px-2">
            ×
          </button>
        </div>

        {error && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-600">{error}</div>
        )}

        {/* 主体 */}
        <div className="flex-1 overflow-y-auto">
          {view === 'apps' ? (
            <AppsView
              apps={apps}
              detecting={detecting}
              extracting={extracting}
              scanning={scanning}
              dirs={dirs}
              onDetect={handleDetect}
              onExtract={handleExtract}
              onScan={handleScanFiles}
            />
          ) : (
            <SessionsView
              grouped={grouped}
              selected={selected}
              edits={edits}
              onToggle={toggleSelect}
              onToggleGroup={toggleGroup}
              onUpdateEdit={updateEdit}
            />
          )}
        </div>

        {/* 底部 */}
        {view === 'sessions' && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-fg-muted">已选 {selected.size} / {allItems.length}</span>
              {selected.size === allItems.length && allItems.length > 0 ? (
                <button onClick={deselectAll} className="text-xs text-fg-muted hover:text-fg-primary">
                  取消全选
                </button>
              ) : (
                <button onClick={selectAll} className="text-xs text-fg-muted hover:text-fg-primary">
                  全选
                </button>
              )}
              {selected.size > 0 && (
                <button onClick={removeSelected} className="text-xs text-red-500 hover:text-red-600">
                  移除选中
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-xs">关闭</button>
              <button
                onClick={handleImport}
                disabled={importing || selected.size === 0}
                className="Memora-btn Memora-btn-primary text-xs disabled:opacity-50"
              >
                {importing ? '导入中…' : `导入选中 (${selected.size})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 第一步：AI 应用卡片视图
// ============================================================
function AppsView({
  apps,
  detecting,
  extracting,
  scanning,
  dirs,
  onDetect,
  onExtract,
  onScan
}: {
  apps: DetectedApp[]
  detecting: boolean
  extracting: string | null
  scanning: boolean
  dirs: string[]
  onDetect: () => void
  onExtract: (app: DetectedApp) => void
  onScan: () => void
}) {
  return (
    <div className="px-5 py-4">
      {/* 操作栏 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onDetect} disabled={detecting} className="Memora-btn Memora-btn-primary text-xs disabled:opacity-50">
          {detecting ? '检测中…' : apps.length > 0 ? '重新检测' : '检测已安装的 AI 应用'}
        </button>
        <button onClick={onScan} disabled={scanning || dirs.length === 0} className="Memora-btn Memora-btn-ghost text-xs disabled:opacity-50">
          {scanning ? '扫描中…' : '扫描下载/文档目录'}
        </button>
        {scanning && (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
            扫描 {dirs.join(' · ')}
          </div>
        )}
      </div>

      {apps.length === 0 && !detecting && (
        <div className="text-center py-12 text-fg-muted text-sm">
          <div className="text-4xl mb-3 opacity-40">🤖</div>
          点击上方按钮，检测本机已安装的 AI 应用
        </div>
      )}

      {/* 应用卡片网格 */}
      <div className="grid grid-cols-2 gap-3">
        {apps.map((app) => {
          const meta = PROVIDER_META[app.provider] ?? PROVIDER_META.Unknown
          const isExtracting = extracting === app.provider
          return (
            <div
              key={app.provider + app.name}
              className={`border rounded-lg p-3 flex flex-col gap-2 ${
                app.canExtract ? 'border-accent/40 bg-accent/5' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-8 h-8 rounded flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ background: meta.color }}
                >
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{app.name}</div>
                  <div className="text-[10px] text-fg-muted flex items-center gap-1">
                    {app.canExtract ? (
                      <span className="text-green-600">✓ 可扒取本地记录</span>
                    ) : app.installed ? (
                      <span className="text-amber-600">已安装 · 数据在云端</span>
                    ) : (
                      <span>未安装</span>
                    )}
                  </div>
                </div>
              </div>

              {app.hint && (
                <p className="text-[10px] text-fg-muted leading-relaxed">{app.hint}</p>
              )}

              {app.dataPath && (
                <p className="text-[10px] text-fg-muted truncate" title={app.dataPath}>
                  📂 {app.dataPath}
                </p>
              )}

              {app.canExtract && (
                <button
                  onClick={() => onExtract(app)}
                  disabled={isExtracting}
                  className="Memora-btn Memora-btn-primary text-xs disabled:opacity-50 mt-1"
                >
                  {isExtracting ? '扒取中…' : '扒取对话记录'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// 第二步：对话列表视图（按 AI 分组，可编辑标题/来源）
// ============================================================
function SessionsView({
  grouped,
  selected,
  edits,
  onToggle,
  onToggleGroup,
  onUpdateEdit
}: {
  grouped: Array<[string, Array<{
    kind: 'extracted' | 'file'
    id: string
    provider: Provider | 'Unknown'
    title: string
    source: string
    messageCount: number | null
    createdAt: string
  }>]>
  selected: Set<string>
  edits: Record<string, { title: string; source: string }>
  onToggle: (id: string) => void
  onToggleGroup: (group: any[]) => void
  onUpdateEdit: (id: string, field: 'title' | 'source', value: string) => void
}) {
  return (
    <div className="px-5 py-3">
      {grouped.map(([provider, items]) => {
        const meta = PROVIDER_META[provider as Provider] ?? PROVIDER_META.Unknown
        const allSelected = items.every((it) => selected.has(it.id))
        const someSelected = items.some((it) => selected.has(it.id))
        const totalMsgs = items.reduce((s, it) => s + (it.messageCount ?? 0), 0)
        return (
          <div key={provider} className="mb-4 border border-border rounded-lg overflow-hidden">
            {/* 分组头 */}
            <div
              className="flex items-center gap-2 px-3 py-2 bg-bg-hover cursor-pointer select-none"
              onClick={() => onToggleGroup(items)}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
                readOnly
                className="accent-accent"
              />
              <span
                className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: meta.color }}
              >
                {meta.icon}
              </span>
              <span className="text-sm font-medium">{meta.label}</span>
              <span className="text-xs text-fg-muted">{items.length} 个对话</span>
              {totalMsgs > 0 && <span className="text-xs text-fg-muted">· {totalMsgs} 条消息</span>}
            </div>

            {/* 对话列表 */}
            <div className="divide-y divide-border">
              {items.map((it) => {
                const isSelected = selected.has(it.id)
                const isExtracted = it.kind === 'extracted'
                const editState = edits[it.id]
                return (
                  <div key={it.id} className={`px-3 py-2 ${isSelected ? 'bg-accent/5' : ''}`}>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggle(it.id)}
                        className="accent-accent mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        {/* 标题（可编辑） */}
                        {isExtracted ? (
                          <input
                            type="text"
                            value={editState?.title ?? it.title}
                            onChange={(e) => onUpdateEdit(it.id, 'title', e.target.value)}
                            className="Memora-input w-full text-xs mb-1"
                            placeholder="对话标题"
                          />
                        ) : (
                          <div className="text-xs font-medium truncate mb-1" title={it.title}>
                            {it.title}
                          </div>
                        )}

                        {/* 来源标注（可编辑） */}
                        {isExtracted ? (
                          <input
                            type="text"
                            value={editState?.source ?? it.source}
                            onChange={(e) => onUpdateEdit(it.id, 'source', e.target.value)}
                            className="Memora-input w-full text-[10px] text-fg-muted"
                            placeholder="来源标注（如：Cursor 本地扒取）"
                          />
                        ) : (
                          <div className="text-[10px] text-fg-muted truncate" title={it.source}>
                            📄 {it.source}
                          </div>
                        )}
                      </div>

                      {/* 右侧元信息 */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {it.messageCount !== null && it.messageCount > 0 && (
                          <span className="text-[10px] text-fg-muted">{it.messageCount} 条</span>
                        )}
                        <span className="text-[10px] text-fg-muted">
                          {new Date(it.createdAt).toLocaleDateString()}
                        </span>
                        {isExtracted && (
                          <span className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded">本地扒取</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
