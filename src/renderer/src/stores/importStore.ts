import { create } from 'zustand'
import type { ImportResult } from '@shared/types'
import { useStore } from './appStore'

interface ImportFileEntry {
  file: string
  result: ImportResult | null
  /** 流式导入进度（0-1），null 表示无进度信息 */
  progress: number | null
}

/** 当前导入进度（filePath -> { loaded, total }） */
interface ImportProgressInfo {
  filePath: string
  loaded: number
  total: number
}

interface ImportState {
  isDragging: boolean
  dragFiles: ImportFileEntry[]
  /** 是否有导入正在进行 */
  isImporting: boolean
  startDrag: () => void
  endDrag: () => void
  runImport: (filePaths: string[]) => Promise<void>
  clear: () => void
}

export const useImportStore = create<ImportState>((set, get) => ({
  isDragging: false,
  dragFiles: [],
  isImporting: false,

  startDrag: () => set({ isDragging: true }),
  endDrag: () => set({ isDragging: false }),

  runImport: async (filePaths: string[]) => {
    const folderId = useStore.getState().activeFolderId ?? undefined
    // 初始化条目（标记为处理中）
    set({
      isDragging: false,
      isImporting: true,
      dragFiles: filePaths.map((f) => ({ file: f, result: null, progress: null }))
    })

    // 订阅流式导入进度事件（大文件 >10MB 才会触发）
    const updateProgress = (p: ImportProgressInfo): void => {
      const current = get().dragFiles
      // 仅更新匹配的文件条目
      if (!current.some((e) => e.file === p.filePath)) return
      const updated = current.map((e) =>
        e.file === p.filePath && p.total > 0
          ? { ...e, progress: Math.min(1, p.loaded / p.total) }
          : e
      )
      set({ dragFiles: updated })
    }
    const off = window.Memora.import.onProgress(updateProgress)

    try {
      // 串行处理（避免 SQLite 并发写冲突）
      for (let i = 0; i < filePaths.length; i++) {
        const path = filePaths[i]
        try {
          const result = await window.Memora.import.file(path, { folderId })
          const current = get().dragFiles
          const updated = [...current]
          updated[i] = { file: path, result, progress: null }
          set({ dragFiles: updated })
        } catch (e) {
          const current = get().dragFiles
          const updated = [...current]
          updated[i] = {
            file: path,
            result: {
              imported: 0,
              skipped: 0,
              failed: 1,
              errors: [(e as Error).message],
              sessionIds: []
            },
            progress: null
          }
          set({ dragFiles: updated })
        }
      }

      // 刷新当前列表
      const store = useStore.getState()
      if (store.activeFolderId) {
        const sessions = await window.Memora.session.list({ folderId: store.activeFolderId })
        store.setSessions(sessions)
      } else if (store.activeWorkspaceId) {
        const tree = await window.Memora.workspace.tree(store.activeWorkspaceId)
        if (tree) store.setSessions(tree.sessions)
      }
      // 数据已变更（导入新会话），通知 Dashboard 统计刷新
      useStore.getState().bumpDataVersion()

    } finally {
      off()
      set({ isImporting: false })
    }
  },

  clear: () => set({ dragFiles: [], isDragging: false, isImporting: false })
}))
