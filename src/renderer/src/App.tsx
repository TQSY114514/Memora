import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatList } from './components/ChatList'
import { ChatViewer } from './components/ChatViewer'
import { AiSettings } from './components/AiSettings'
import { ProjectMemoryPanel } from './components/ProjectMemory'
import { useStore } from './stores/appStore'
import { useImportStore } from './stores/importStore'

export default function App() {
  const { error } = useStore()
  const { isDragging, dragFiles, startDrag, endDrag, runImport } = useImportStore()
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [showMemoryPanel, setShowMemoryPanel] = useState(false)

  // 初始化时确保有默认工作区
  useEffect(() => {
    async function ensureDefaultWorkspace() {
      const workspaces = await window.aether.workspace.list()
      if (workspaces.length === 0) {
        await window.aether.workspace.create({
          name: '默认工作区',
          description: '所有未分类的对话'
        })
      }
    }
    ensureDefaultWorkspace().catch(console.error)
  }, [])

  // 全局拖拽导入监听
  useEffect(() => {
    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        e.stopPropagation()
        if (!isDragging) startDrag()
      }
    }
    function onDragLeave(e: DragEvent) {
      // 只有离开窗口才结束（relatedTarget 为 null）
      if (e.relatedTarget === null && isDragging) {
        endDrag()
      }
    }
    function onDrop(e: DragEvent) {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      e.stopPropagation()
      const files = Array.from(e.dataTransfer.files).map((f) => window.aether.getPathForFile(f))
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
    <div className="flex h-full w-full bg-bg-primary relative">
      <Sidebar
        onOpenAiSettings={() => setShowAiSettings(true)}
        onOpenMemory={() => setShowMemoryPanel(true)}
      />
      {showMemoryPanel ? (
        <ProjectMemoryPanel onClose={() => setShowMemoryPanel(false)} />
      ) : (
        <>
          <ChatList />
          <ChatViewer onOpenAiSettings={() => setShowAiSettings(true)} />
        </>
      )}

      {/* 拖拽遮罩 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-accent-muted backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-2xl p-12 text-center bg-bg-primary/80">
            <div className="text-5xl mb-4">📥</div>
            <p className="text-lg font-semibold text-fg-primary mb-1">
              松开以导入
            </p>
            <p className="text-sm text-fg-muted">
              支持 ChatGPT / Claude / DeepSeek / Kimi / 通义 / Markdown / JSON
            </p>
          </div>
        </div>
      )}

      {/* 导入进度 */}
      {dragFiles.length > 0 && (
        <ImportProgress />
      )}

      {/* AI 配置弹窗 */}
      {showAiSettings && <AiSettings onClose={() => setShowAiSettings(false)} />}
    </div>
  )
}

function ImportProgress() {
  const { dragFiles, clear } = useImportStore()
  const last = dragFiles[dragFiles.length - 1]

  return (
    <div className="absolute bottom-4 right-4 z-50 bg-bg-primary border border-border rounded-lg shadow-lg p-4 min-w-[300px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        <span className="text-sm font-medium">导入中…</span>
      </div>
      <p className="text-xs text-fg-muted mb-3 truncate">
        {last?.file ?? '处理中'}
      </p>
      {last?.result && (
        <div className="text-xs space-y-1">
          <p className="text-green-600">✓ 导入 {last.result.imported}</p>
          {last.result.skipped > 0 && (
            <p className="text-fg-muted">⊘ 跳过 {last.result.skipped}（重复）</p>
          )}
          {last.result.failed > 0 && (
            <p className="text-red-500">✗ 失败 {last.result.failed}</p>
          )}
          {last.result.errors.length > 0 && (
            <p className="text-red-500 text-[10px] truncate" title={last.result.errors.join('\n')}>
              {last.result.errors[0]}
            </p>
          )}
          <button
            onClick={clear}
            className="mt-2 aether-btn aether-btn-ghost text-xs w-full"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
