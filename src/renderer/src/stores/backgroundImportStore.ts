import { create } from 'zustand'
import type {
  BackgroundImportConfig,
  BackgroundImportStatus,
  BackgroundImportProgress,
  BackgroundImportRunResult
} from '@shared/types'

interface BgImportState {
  config: BackgroundImportConfig | null
  status: BackgroundImportStatus | null
  loadConfig: () => Promise<void>
  loadStatus: () => Promise<void>
  setConfig: (patch: Partial<BackgroundImportConfig>) => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  runOnce: () => Promise<void>
  /** 订阅主进程进度/完成事件，返回取消订阅函数 */
  attachListeners: () => () => void
}

export const useBgImportStore = create<BgImportState>((set, get) => ({
  config: null,
  status: null,

  loadConfig: async () => {
    set({ config: await window.Memora.bgImport.getConfig() })
  },

  loadStatus: async () => {
    set({ status: await window.Memora.bgImport.getStatus() })
  },

  setConfig: async (patch) => {
    set({ config: await window.Memora.bgImport.setConfig(patch) })
  },

  start: async () => {
    await window.Memora.bgImport.start()
    await get().loadStatus()
  },

  stop: async () => {
    await window.Memora.bgImport.stop()
    await get().loadStatus()
  },

  runOnce: async () => {
    await window.Memora.bgImport.runOnce()
    await get().loadStatus()
  },

  attachListeners: () => {
    const offProgress = window.Memora.bgImport.onProgress((p: BackgroundImportProgress) => {
      const s = get().status
      set({
        status: {
          running: true,
          lastRunAt: s?.lastRunAt ?? null,
          lastResult: s?.lastResult ?? null,
          nextRunAt: s?.nextRunAt ?? null,
          currentProgress: p
        }
      })
    })
    const offDone = window.Memora.bgImport.onDone((r: BackgroundImportRunResult) => {
      const s = get().status
      set({
        status: {
          running: false,
          lastRunAt: new Date().toISOString(),
          lastResult: r,
          nextRunAt: s?.nextRunAt ?? null,
          currentProgress: null
        }
      })
    })
    return () => {
      offProgress()
      offDone()
    }
  }
}))
