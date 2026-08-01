import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  createFolder,
  listFolders,
  listRootFolders,
  updateFolder,
  deleteFolder,
  listSessionsByWorkspace
} from '@db/repositories'

export function registerWorkspaceHandlers(): void {
  // ===== Workspace =====
  safeHandle(IPC.WORKSPACE_LIST, () => listWorkspaces())
  safeHandle(IPC.WORKSPACE_CREATE, (_e, input: Parameters<typeof createWorkspace>[0]) =>
    createWorkspace(input)
  )
  safeHandle(IPC.WORKSPACE_UPDATE, (_e, id: string, patch: Parameters<typeof updateWorkspace>[1]) =>
    updateWorkspace(id, patch)
  )
  safeHandle(IPC.WORKSPACE_DELETE, (_e, id: string) => deleteWorkspace(id))
  safeHandle(IPC.WORKSPACE_TREE, (_e, workspaceId: string) => {
    const workspace = getWorkspace(workspaceId)
    if (!workspace) return null
    const rootFolders = listRootFolders(workspaceId)
    const sessions = listSessionsByWorkspace(workspaceId)
    return { workspace, rootFolders, sessions }
  })

  // ===== Folder =====
  safeHandle(IPC.FOLDER_LIST, (_e, workspaceId?: string) => listFolders(workspaceId))
  safeHandle(IPC.FOLDER_CREATE, (_e, input: Parameters<typeof createFolder>[0]) =>
    createFolder(input)
  )
  safeHandle(IPC.FOLDER_UPDATE, (_e, id: string, patch: Parameters<typeof updateFolder>[1]) =>
    updateFolder(id, patch)
  )
  safeHandle(IPC.FOLDER_DELETE, (_e, id: string) => deleteFolder(id))
}
