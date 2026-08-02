import { safeHandle, assertSafeId } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  getWorkspace,
  listPreferences,
  getConstitution,
  listEntries,
  listAuditLogs
} from '@db/repositories'
import { renderMemoryToMMF, parseMMF, importMMF } from '@sharing'

export function registerMemoryIOHandlers(): void {
  // ===== 导出工作区记忆为 MMF =====
  safeHandle(IPC.MEMORY_EXPORT_MMF, (_e, workspaceId: string) => {
    const wsId = assertSafeId(workspaceId, 'workspaceId')
    const workspace = getWorkspace(wsId)
    const preferences = listPreferences({ workspaceId: wsId, limit: 100000 })
    const constitution = getConstitution(wsId)
    const knowledge = listEntries({ workspaceId: wsId, limit: 100000 })
    const auditLogs = listAuditLogs({ workspaceId: wsId, limit: 100000 })
    return renderMemoryToMMF({
      workspace: { id: wsId, name: workspace?.name || 'unknown' },
      preferences,
      constitution,
      knowledge,
      auditLogs
    })
  })

  // ===== 导入 MMF 到目标工作区 =====
  safeHandle(IPC.MEMORY_IMPORT_MMF, (_e, jsonString: string, targetWorkspaceId: string) => {
    const wsId = assertSafeId(targetWorkspaceId, 'targetWorkspaceId')
    if (typeof jsonString !== 'string' || jsonString.length === 0) {
      throw new Error('[IPC] 导入失败：JSON 内容为空')
    }
    // 限制单次导入大小（约 50MB），防止超大输入导致主进程卡死
    if (jsonString.length > 50 * 1024 * 1024) {
      throw new Error('[IPC] 导入失败：MMF 文件过大（>50MB）')
    }
    const data = parseMMF(jsonString)
    return importMMF(data, wsId)
  })
}
