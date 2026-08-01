/**
 * MCP 工具域 —— workspace（工作区 / 文件夹 / 标签）
 *
 * 处理工作区相关工具：list_workspaces / list_tags / create_folder / list_folders。
 */

import { listWorkspaces } from '../../database/repositories/workspaceRepo'
import { listTags } from '../../database/repositories/tagRepo'
import { listFolders, createFolder } from '../../database/repositories/folderRepo'

export async function handleWorkspaceTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'list_workspaces': {
      return listWorkspaces().map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description
      }))
    }

    case 'list_tags': {
      return listTags()
    }

    case 'create_folder': {
      const workspaceId = String(args.workspaceId ?? '')
      const name = String(args.name ?? '')
      if (!workspaceId) throw new Error('workspaceId 不能为空')
      if (!name) throw new Error('name 不能为空')
      const parentId = args.parentId ? String(args.parentId) : undefined
      const folder = createFolder({ workspaceId, name, parentId })
      return { folderId: folder.id, name: folder.name, workspaceId }
    }

    case 'list_folders': {
      const workspaceId = args.workspaceId ? String(args.workspaceId) : undefined
      const folders = listFolders(workspaceId)
      return folders.map((f) => ({
        id: f.id,
        name: f.name,
        workspaceId: f.workspaceId,
        parentId: f.parentId,
        sortOrder: f.sortOrder,
        isSmart: !!f.rule
      }))
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}
