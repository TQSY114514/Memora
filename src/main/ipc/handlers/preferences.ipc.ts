import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/constants'
import {
  createPreference,
  getPreference,
  listPreferences,
  updatePreference,
  deletePreference,
  archivePreference,
  searchPreferences,
  countPreferences,
  getUserProfile,
  decayConfidence
} from '@db/repositories'
import type { PreferenceStatus, PreferenceSource } from '@shared/types'

function safeHandle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      console.error(`[IPC] ${channel} failed:`, err)
      throw err
    }
  })
}

export function registerPreferenceHandlers(): void {
  safeHandle(IPC.PREF_LIST, (_e, options?: Parameters<typeof listPreferences>[0]) => {
    return listPreferences(options)
  })

  safeHandle(IPC.PREF_GET, (_e, id: string) => {
    return getPreference(id)
  })

  safeHandle(IPC.PREF_CREATE, (_e, input: Parameters<typeof createPreference>[0]) => {
    return createPreference(input)
  })

  safeHandle(IPC.PREF_UPDATE, (_e, id: string, patch: Parameters<typeof updatePreference>[1]) => {
    return updatePreference(id, patch)
  })

  safeHandle(IPC.PREF_DELETE, (_e, id: string) => {
    deletePreference(id)
  })

  safeHandle(IPC.PREF_ARCHIVE, (_e, id: string) => {
    return archivePreference(id)
  })

  safeHandle(IPC.PREF_SEARCH, (_e, query: string, options?: Parameters<typeof searchPreferences>[1]) => {
    return searchPreferences(query, options)
  })

  safeHandle(IPC.PREF_COUNT, (_e, workspaceId: string) => {
    return countPreferences(workspaceId)
  })

  safeHandle(IPC.PREF_PROFILE, (_e, workspaceId: string) => {
    return getUserProfile(workspaceId)
  })

  safeHandle(IPC.PREF_DECAY, (_e, workspaceId?: string, daysThreshold?: number, decayRate?: number) => {
    return decayConfidence(workspaceId, daysThreshold, decayRate)
  })
}
