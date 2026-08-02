import { safeHandle, assertSafeId } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  getVersionHistory,
  rollbackEntity
} from '@db/repositories'

export function registerAuditHandlers(): void {
  safeHandle(IPC.AUDIT_VERSION_HISTORY, (_e, entityId: string, entityType: string) => {
    return getVersionHistory(assertSafeId(entityId), entityType)
  })

  safeHandle(IPC.AUDIT_ROLLBACK, (_e, entityType: string, auditLogId: string) => {
    return rollbackEntity(entityType, assertSafeId(auditLogId))
  })
}