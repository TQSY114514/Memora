import { create } from 'zustand'
import type { ImportResult } from '@shared/types'
import { useStore } from './appStore'

interface ImportFileEntry {
  file: string
  result: ImportResult | null
}

interface ImportState {
  isDragging: boolean
  dragFiles: ImportFileEntry[]
  startDrag: () => void
  endDrag: () => void
  runImport: (filePaths: string[]) => Promise<void>
  clear: () => void
}

export const useImportStore = create<ImportState>((set, get) => ({
  isDragging: false,
  dragFiles: [],

  startDrag: () => set({ isDragging: true }),
  endDrag: () => set({ isDragging: false }),

  runImport: async (filePaths: string[]) => {
    const folderId = useStore.getState().activeFolderId ?? undefined
    // 初始化条目（标记为处理中）
    set({
      isDragging: false,
      dragFiles: filePaths.map((f) => ({ file: f, result: null }))
    })

    // 串行处理（避免 SQLite 并发写冲突）
    for (let i = 0; i < filePaths.length; i++) {
      const path = filePaths[i]
      try {
        const result = await window.Memora.import.file(path, { folderId })
        const current = get().dragFiles
        const updated = [...current]
        updated[i] = { file: path, result }
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
          }
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
  },

  clear: () => set({ dragFiles: [], isDragging: false })
}))
