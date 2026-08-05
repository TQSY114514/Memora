import { ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type { Workspace, Folder, FolderRule } from '@shared/types'

// ===== Workspace =====
export const workspace = {
  list: (): Promise<Workspace[]> => ipcRenderer.invoke(IPC.WORKSPACE_LIST),
  create: (input: { name: string; description?: string; color?: string; icon?: string }): Promise<Workspace> =>
    ipcRenderer.invoke(IPC.WORKSPACE_CREATE, input),
  update: (id: string, patch: Partial<Workspace>): Promise<void> =>
    ipcRenderer.invoke(IPC.WORKSPACE_UPDATE, id, patch),
  delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.WORKSPACE_DELETE, id),
  tree: (workspaceId: string): Promise<{
    workspace: Workspace
    rootFolders: Folder[]
    sessions: import('@shared/types').ChatSession[]
  } | null> => ipcRenderer.invoke(IPC.WORKSPACE_TREE, workspaceId)
}

// ===== Folder =====
export const folder = {
  list: (workspaceId?: string): Promise<Folder[]> => ipcRenderer.invoke(IPC.FOLDER_LIST, workspaceId),
  create: (input: { workspaceId: string; parentId?: string; name: string; rule?: FolderRule | null }): Promise<Folder> =>
    ipcRenderer.invoke(IPC.FOLDER_CREATE, input),
  update: (id: string, patch: Partial<Folder>): Promise<void> =>
    ipcRenderer.invoke(IPC.FOLDER_UPDATE, id, patch),
  delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FOLDER_DELETE, id)
}