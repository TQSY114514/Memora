import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatList } from './components/ChatList'
import { ChatViewer } from './components/ChatViewer'
// 按需加载的重组件（代码分割）：首屏不需要，点击触发时才加载对应 chunk
const AiSettings = lazy(() => import('./components/AiSettings').then(m => ({ default: m.AiSettings })))
const ImportCenter = lazy(() => import('./components/ImportCenter').then(m => ({ default: m.ImportCenter })))
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })))
const ProjectMemoryPanel = lazy(() => import('./components/ProjectMemory').then(m => ({ default: m.ProjectMemoryPanel })))
const KnowledgePanel = lazy(() => import('./components/Knowledge').then(m => ({ default: m.KnowledgePanel })))
const PreferenceExplorer = lazy(() => import('./components/PreferenceExplorer').then(m => ({ default: m.PreferenceExplorer })))
import { useStore } from './stores/appStore'
import { useImportStore } from './stores/importStore'
import { useThemeStore } from './stores/themeStore'
import { useAiConfigStore } from './stores/aiConfigStore'
import { BackgroundImportIndicator } from './components/BackgroundImportIndicator'
import { StartupImportHint } from './components/StartupImportHint'

/** lazy 组件加载中的 fallback */
function PanelSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
      <div className="animate-pulse">加载中…</div>
    </div>
  )
}

export default function App() {
  const { error } = useStore()
  const { isDragging, dragFiles, startDrag, endDrag, runImport } = useImportStore()
  const { backgroundImage, blur, opacity } = useThemeStore()
  const { loadApiKeys } = useAiConfigStore()
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [showMemoryPanel, setShowMemoryPanel] = useState(false)
  const [showKnowledgePanel, setShowKnowledgePanel] = useState(false)
  const [showPreferencePanel, setShowPreferencePanel] = useState(false)
  const [showImportCenter, setShowImportCenter] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const ensured = useRef(false)
  useEffect(() => {
    if (ensured.current) return
    ensured.current = true
    async function ensureDefaultWorkspace() {
      const workspaces = await window.Memora.workspace.list()
      if (workspaces.length === 0) {
        await window.Memora.workspace.create({
          name: '默认工作区',
          description: '所有未分类的对话'
        })
      }
    }
    ensureDefaultWorkspace().catch(console.error)
    // 从 main 加密存储加载 apiKey 到内存（不阻塞 UI）
    loadApiKeys().catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次启动时执行一次
  }, [])

  // 全局快捷键：Ctrl/Cmd+K 聚焦搜索框
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const input = searchInputRef.current
        if (input) {
          input.focus()
          input.select()
        }
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  useEffect(() => {
    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        e.stopPropagation()
        if (!isDragging) startDrag()
      }
    }
    function onDragLeave(e: DragEvent) {
      if (e.relatedTarget === null && isDragging) {
        endDrag()
      }
    }
    function onDrop(e: DragEvent) {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      e.stopPropagation()
      const files = Array.from(e.dataTransfer.files).map((f) => window.Memora.getPathForFile(f))
      runImport(files)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [isDragging, startDrag, endDrag, runImport])

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-500">
        {error}
      </div>
    )
  }

  return (
    <div className={`flex h-full w-full bg-bg-primary relative ${backgroundImage ? 'has-bg-image' : ''}`}>
      {/* 背景图片层 */}
      {backgroundImage && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            filter: blur > 0 ? `blur(${blur}px)` : undefined,
            opacity: opacity
          }}
        />
      )}
      <div className={`relative ${backgroundImage ? 'z-10' : ''} flex h-full w-full`}>
      <Sidebar
        searchInputRef={searchInputRef}
        onOpenAiSettings={() => setShowAiSettings(true)}
        onOpenMemory={() => setShowMemoryPanel(true)}
        onOpenKnowledge={() => setShowKnowledgePanel(true)}
        onOpenPreferences={() => setShowPreferencePanel(true)}
        onOpenImportCenter={() => setShowImportCenter(true)}
        onOpenSettings={() => setShowSettings(true)}
      />
      {showMemoryPanel ? (
        <Suspense fallback={<PanelSkeleton />}>
          <ProjectMemoryPanel onClose={() => setShowMemoryPanel(false)} />
        </Suspense>
      ) : showKnowledgePanel ? (
        <Suspense fallback={<PanelSkeleton />}>
          <KnowledgePanel onClose={() => setShowKnowledgePanel(false)} />
        </Suspense>
      ) : showPreferencePanel ? (
        <Suspense fallback={<PanelSkeleton />}>
          <PreferenceExplorer onClose={() => setShowPreferencePanel(false)} />
        </Suspense>
      ) : (
        <>
          <ChatList />
          <ChatViewer onOpenAiSettings={() => setShowAiSettings(true)} onOpenImportCenter={() => setShowImportCenter(true)} />
        </>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-50 bg-accent-muted backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-2xl p-12 text-center bg-bg-primary/80">
            <div className="text-5xl mb-4">📥</div>
            <p className="text-lg font-semibold text-fg-primary mb-1">松开以导入</p>
            <p className="text-sm text-fg-muted">支持 ChatGPT / Claude / DeepSeek / Kimi / 通义 / Markdown / JSON</p>
          </div>
        </div>
      )}

      {dragFiles.length > 0 && <ImportProgress />}

      <BackgroundImportIndicator />

      <StartupImportHint onOpenImportCenter={() => setShowImportCenter(true)} />

      {showImportCenter && (
        <Suspense fallback={<PanelSkeleton />}>
          <ImportCenter onClose={() => setShowImportCenter(false)} />
        </Suspense>
      )}

      {showAiSettings && (
        <Suspense fallback={<PanelSkeleton />}>
          <AiSettings onClose={() => setShowAiSettings(false)} />
        </Suspense>
      )}

      {showSettings && (
        <Suspense fallback={<PanelSkeleton />}>
          <Settings
            onClose={() => setShowSettings(false)}
            onOpenAiSettings={() => {
              setShowSettings(false)
              setShowAiSettings(true)
            }}
          />
        </Suspense>
      )}
      </div>
    </div>
  )
}

function ImportProgress() {
  const { dragFiles, clear, isImporting } = useImportStore()
  const last = dragFiles[dragFiles.length - 1]
  const pct = last?.progress != null ? Math.round(last.progress * 100) : null
  // 找到第一个仍在处理中（无 result）的条目
  const pending = dragFiles.find((f) => f.result === null)
  return (
    <div className="absolute bottom-4 right-4 z-50 bg-bg-primary border border-border rounded-lg shadow-lg p-4 min-w-[300px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        <span className="text-sm font-medium">{isImporting ? '导入中…' : '导入完成'}</span>
      </div>
      <p className="text-xs text-fg-muted mb-3 truncate">{pending?.file ?? last?.file ?? '处理中'}</p>
      {pct !== null && pending && (
        <div className="mb-3">
          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-fg-muted mt-1">{pct}%</p>
        </div>
      )}
      {last?.result && (
        <div className="text-xs space-y-1">
          <p className="text-green-600">✓ 导入 {last.result.imported}</p>
          {last.result.skipped > 0 && <p className="text-fg-muted">⊘ 跳过 {last.result.skipped}（重复）</p>}
          {last.result.failed > 0 && <p className="text-red-500">✗ 失败 {last.result.failed}</p>}
          {last.result.errors.length > 0 && (
            <p className="text-red-500 text-[10px] truncate" title={last.result.errors.join('\n')}>{last.result.errors[0]}</p>
          )}
          <button onClick={clear} className="mt-2 Memora-btn Memora-btn-ghost text-xs w-full">关闭</button>
        </div>
      )}
    </div>
  )
}
