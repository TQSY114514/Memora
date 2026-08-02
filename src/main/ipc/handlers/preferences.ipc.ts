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
  detectConflicts,
  listAuditLogs,
  getConstitution
} from '@db/repositories'

export function registerPreferenceHandlers(): void {
  safeHandle(IPC.PREF_LIST, (_e, options?: Parameters<typeof listPreferences>[0]) => {
    return listPreferences(options)
  })

  safeHandle(IPC.PREF_GET, (_e, id: string) => {
    return getPreference(assertSafeId(id))
  })

  safeHandle(IPC.PREF_CREATE, (_e, input: Parameters<typeof createPreference>[0]) => {
    return createPreference(input)
  })

  safeHandle(IPC.PREF_UPDATE, (_e, id: string, patch: Parameters<typeof updatePreference>[1]) => {
    return updatePreference(assertSafeId(id), patch)
  })

  safeHandle(IPC.PREF_DELETE, (_e, id: string) => {
    deletePreference(assertSafeId(id))
  })

  safeHandle(IPC.PREF_ARCHIVE, (_e, id: string) => {
    return archivePreference(assertSafeId(id))
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

  // Memory Audit Log（v1.8）：查询偏好/知识/会话变更审计日志
  safeHandle(IPC.PREF_AUDIT_LOGS, (_e, options?: { entityType?: string; entityId?: string; workspaceId?: string; limit?: number; offset?: number }) => {
    return listAuditLogs(options)
  })

  // AI 宪法（v1.7.2）
  safeHandle(IPC.PREF_CONSTITUTION, (_e, workspaceId?: string) => {
    return getConstitution(workspaceId)
  })
}
