import { useEffect, useRef, useState, lazy, Suspense, type LazyExoticComponent, type ComponentType } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
const McpPermissionsPanel = lazy(() => import('./components/McpPermissions').then(m => ({ default: m.McpPermissionsPanel })))
const MemoryAgentPanel = lazy(() => import('./components/MemoryAgent').then(m => ({ default: m.MemoryAgentPanel })))
const CloudSyncPanel = lazy(() => import('./components/CloudSync').then(m => ({ default: m.CloudSyncPanel })))
const TimeCapsulePanel = lazy(() => import('./components/TimeCapsule').then(m => ({ default: m.TimeCapsulePanel })))
const TeamWorkspacePanel = lazy(() => import('./components/TeamWorkspace').then(m => ({ default: m.TeamWorkspacePanel })))
const TemplateMarketPanel = lazy(() => import('./components/TemplateMarket').then(m => ({ default: m.TemplateMarketPanel })))
const MigrationWizardPanel = lazy(() => import('./components/MigrationWizard').then(m => ({ default: m.MigrationWizardPanel })))
const IdentityProfilePanel = lazy(() => import('./components/IdentityProfile').then(m => ({ default: m.IdentityProfilePanel })))
const SecurityCenterPanel = lazy(() => import('./components/SecurityCenter').then(m => ({ default: m.SecurityCenterPanel })))
import { useStore } from './stores/appStore'
import { useImportStore } from './stores/importStore'
import { useThemeStore } from './stores/themeStore'
import { useAiConfigStore } from './stores/aiConfigStore'
import { BackgroundImportIndicator } from './components/BackgroundImportIndicator'
import { StartupImportHint } from './components/StartupImportHint'

/** 全屏面板注册表：所有仅需 onClose 的面板 */
const FULL_PANELS: Record<string, LazyExoticComponent<ComponentType<{ onClose: () => void }>>> = {
  memory: ProjectMemoryPanel,
  knowledge: KnowledgePanel,
  preferences: PreferenceExplorer,
  mcpPermissions: McpPermissionsPanel,
  memoryAgent: MemoryAgentPanel,
  cloudSync: CloudSyncPanel,
  timeCapsule: TimeCapsulePanel,
  teamWorkspace: TeamWorkspacePanel,
  templateMarket: TemplateMarketPanel,
  migrationWizard: MigrationWizardPanel,
  identityProfile: IdentityProfilePanel,
  securityCenter: SecurityCenterPanel,
}

/** lazy 组件加载中的 fallback：安静的骨架条，替代加载文字 */
function PanelSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="Memora-skeleton h-6 w-48" />
      <div className="Memora-skeleton h-4 w-64" />
      <div className="Memora-skeleton h-4 w-52" />
    </div>
  )
}

export default function App() {
  // selector 订阅：只订阅顶层真正需要的字段。isDragging/dragFiles 高频变更，
  // dragFiles 仅订阅 length（进度更新不改长度，不触发 App 顶层重渲染）
  const error = useStore((s) => s.error)
  const bumpDataVersion = useStore((s) => s.bumpDataVersion)
  const isDragging = useImportStore((s) => s.isDragging)
  const dragFileCount = useImportStore((s) => s.dragFiles.length)
  const startDrag = useImportStore((s) => s.startDrag)
  const endDrag = useImportStore((s) => s.endDrag)
  const runImport = useImportStore((s) => s.runImport)
  const { backgroundImage, blur, opacity } = useThemeStore(
    useShallow((s) => ({ backgroundImage: s.backgroundImage, blur: s.blur, opacity: s.opacity }))
  )
  const loadApiKeys = useAiConfigStore((s) => s.loadApiKeys)

  // 全屏面板：与 ChatList+ChatViewer 互斥
  const [activePanel, setActivePanel] = useState<string | null>(null)
  // 浮层面板：叠加在所有内容之上
  const [overlayPanel, setOverlayPanel] = useState<string | null>(null)

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

  // 订阅主进程数据变更广播（导入等写库后推送），递增版本号驱动 Dashboard 统计等重新拉取
  useEffect(() => {
    const off = window.Memora.import.onDataChanged(() => {
      bumpDataVersion()
    })
    return off
  }, [bumpDataVersion])

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

  // 渲染当前激活的全屏面板
  const ActivePanel = activePanel ? FULL_PANELS[activePanel] : null

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
        onOpenAiSettings={() => setOverlayPanel('aiSettings')}
        onOpenMemory={() => setActivePanel('memory')}
        onOpenKnowledge={() => setActivePanel('knowledge')}
        onOpenPreferences={() => setActivePanel('preferences')}
        onOpenSettings={() => setOverlayPanel('settings')}
      />
      {ActivePanel ? (
        <Suspense fallback={<PanelSkeleton />}>
          <ActivePanel onClose={() => setActivePanel(null)} />
        </Suspense>
      ) : (
        <>
          <ChatList />
          <ChatViewer onOpenAiSettings={() => setOverlayPanel('aiSettings')} onOpenImportCenter={() => setOverlayPanel('importCenter')} />
        </>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-50 bg-accent-muted flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-xl p-12 text-center bg-bg-primary shadow-lg">
            <div className="mb-4 flex justify-center text-accent">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </div>
            <p className="text-lg font-semibold text-fg-primary mb-1">松开以导入</p>
            <p className="text-sm text-fg-muted">支持 ChatGPT / Claude / DeepSeek / Kimi / 通义 / Markdown / JSON</p>
          </div>
        </div>
      )}

      {dragFileCount > 0 && <ImportProgress />}

      <BackgroundImportIndicator />

      <StartupImportHint onOpenImportCenter={() => setOverlayPanel('importCenter')} />

      {overlayPanel === 'importCenter' && (
        <Suspense fallback={<PanelSkeleton />}>
          <ImportCenter onClose={() => setOverlayPanel(null)} />
        </Suspense>
      )}

      {overlayPanel === 'aiSettings' && (
        <Suspense fallback={<PanelSkeleton />}>
          <AiSettings onClose={() => setOverlayPanel(null)} />
        </Suspense>
      )}

      {overlayPanel === 'settings' && (
        <Suspense fallback={<PanelSkeleton />}>
          <Settings
            onClose={() => setOverlayPanel(null)}
            onOpenAiSettings={() => setOverlayPanel('aiSettings')}
            onOpenMcpPermissions={() => { setOverlayPanel(null); setActivePanel('mcpPermissions') }}
            onOpenMemoryAgent={() => { setOverlayPanel(null); setActivePanel('memoryAgent') }}
            onOpenCloudSync={() => { setOverlayPanel(null); setActivePanel('cloudSync') }}
            onOpenTimeCapsule={() => { setOverlayPanel(null); setActivePanel('timeCapsule') }}
            onOpenTeamWorkspace={() => { setOverlayPanel(null); setActivePanel('teamWorkspace') }}
            onOpenTemplateMarket={() => { setOverlayPanel(null); setActivePanel('templateMarket') }}
            onOpenMigrationWizard={() => { setOverlayPanel(null); setActivePanel('migrationWizard') }}
            onOpenIdentityProfile={() => { setOverlayPanel(null); setActivePanel('identityProfile') }}
            onOpenSecurityCenter={() => { setOverlayPanel(null); setActivePanel('securityCenter') }}
          />
        </Suspense>
      )}
      </div>
    </div>
  )
}

function ImportProgress() {
  // selector 订阅：进度条自身订阅 dragFiles 全量（要展示每个条目的进度），App 顶层只看长度
  const dragFiles = useImportStore((s) => s.dragFiles)
  const isImporting = useImportStore((s) => s.isImporting)
  const clear = useImportStore((s) => s.clear)
  const last = dragFiles[dragFiles.length - 1]
  const pct = last?.progress != null ? Math.round(last.progress * 100) : null
  // 找到第一个仍在处理中（无 result）的条目
  const pending = dragFiles.find((f) => f.result === null)
  return (
    <div className="absolute bottom-4 right-4 z-50 bg-bg-primary border border-border rounded-lg shadow-lg p-4 min-w-[300px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-accent Memora-pulse" />
        <span className="text-sm font-medium">{isImporting ? '导入中…' : '导入完成'}</span>
      </div>
      <p className="text-xs text-fg-muted mb-3 truncate">{pending?.file ?? last?.file ?? '处理中'}</p>
      {pct !== null && pending && (
        <div className="mb-3">
          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-colors duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-fg-muted mt-1">{pct}%</p>
        </div>
      )}
      {last?.result && (
        <div className="text-xs space-y-1">
          <p className="text-green-600">✓ 导入 {last.result.imported}</p>
          {last.result.skipped > 0 && <p className="text-fg-muted">⊘ 跳过 {last.result.skipped}（重复）</p>}
          {last.result.failed > 0 && <p className="text-red-500">✗ 失败 {last.result.failed}</p>}
          {last.result.errors.length > 0 && (
            <p className="text-red-500 text-xs truncate" title={last.result.errors.join('\n')}>{last.result.errors[0]}</p>
          )}
          <button onClick={clear} className="mt-2 Memora-btn Memora-btn-ghost text-xs w-full">关闭</button>
        </div>
      )}
    </div>
  )
}
