import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  listMcpPermissions,
  saveMcpPermission,
  deleteMcpPermission,
  checkMcpPermission
} from '@db/repositories'

export function registerMcpPermissionsHandlers(): void {
  safeHandle(IPC.MCP_PERMISSIONS_LIST, () => {
    return listMcpPermissions()
  })

  safeHandle(IPC.MCP_PERMISSIONS_SAVE, (_e, input: {
    clientId: string
    clientName: string
    level?: string
    allowedTools?: string | null
    enabled?: boolean
  }) => {
    return saveMcpPermission(input)
  })

  safeHandle(IPC.MCP_PERMISSIONS_DELETE, (_e, clientId: string) => {
    return deleteMcpPermission(clientId)
  })

  safeHandle(IPC.MCP_PERMISSIONS_CHECK, (_e, clientId: string, toolName: string) => {
    return checkMcpPermission(clientId, toolName)
  })
}