import { safeHandle } from '../safeHandle'
import { IPC } from '../../../shared/constants'
import { generateSecurityReport } from '../../../security/securityCenter'
import { runSelfTest } from '../../../crypto/selfTest'

export function registerSecurityHandlers(): void {
  safeHandle(IPC.SECURITY_REPORT, () => {
    return generateSecurityReport()
  })
  // 可复现加密自检（v10 P0-C1）：设置页「安全自检」按钮触发
  safeHandle(IPC.SECURITY_SELF_TEST, () => {
    return runSelfTest()
  })
}