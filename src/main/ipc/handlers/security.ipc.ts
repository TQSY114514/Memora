import { safeHandle } from '../safeHandle'
import { IPC } from '../../../shared/constants'
import { generateSecurityReport } from '../../../security/securityCenter'

export function registerSecurityHandlers(): void {
  safeHandle(IPC.SECURITY_REPORT, () => {
    return generateSecurityReport()
  })
}