import { safeHandle, assertSafeId } from '../safeHandle'
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
  decayConfidence,
  detectConflicts
} from '@db/repositories'
import type { PreferenceStatus, PreferenceSource } from '@shared/types'

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
    deletePreference(assertSafeId(id))
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

  // 冲突检测（v1.6）
  safeHandle(IPC.PREF_CONFLICTS, (_e, workspaceId?: string) => {
    return detectConflicts(workspaceId)
  })
}
