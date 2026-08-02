import { safeHandle } from '../safeHandle'
import { IPC } from '../../../shared/constants'
import { generateIdentityProfile } from '../../../identity/identityProfile'

export function registerIdentityHandlers(): void {
  safeHandle(IPC.IDENTITY_GENERATE, (_e, workspaceId?: string) => {
    return generateIdentityProfile(workspaceId)
  })
}