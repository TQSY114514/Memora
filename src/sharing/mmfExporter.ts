import type { MMFFile, Preference, KnowledgeEntry, AuditLog } from '@shared/types'

export type { MMFFile } from '@shared/types'

/**
 * Memora Memory Format (MMF) —— 可移植的记忆归档格式
 *
 * 把工作区的偏好、宪法、知识、审计日志整体导出为 JSON 文件，
 * 可在另一个 Memora 实例（或工作区）中导入还原。
 *
 * - format: 固定标识 'memora-memory-format'
 * - version: 格式版本号（当前为 1）
 * - 包含 stats 摘要，便于导入前快速校验
 */

/**
 * 把工作区记忆数据渲染为 MMF JSON 字符串
 *
 * @param data.workspace 工作区元信息
 * @param data.preferences 常规偏好（不含宪法）
 * @param data.constitution 宪法条目（source='constitution'）
 * @param data.knowledge 知识条目
 * @param data.auditLogs 审计日志
 * @returns 美化缩进的 JSON 字符串
 */
export function renderMemoryToMMF(data: {
  workspace: { id: string; name: string }
  preferences: Preference[]
  constitution: Preference[]
  knowledge: KnowledgeEntry[]
  auditLogs: AuditLog[]
}): string {
  const file: MMFFile = {
    format: 'memora-memory-format',
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: {
      id: data.workspace.id,
      name: data.workspace.name
    },
    preferences: data.preferences,
    constitution: data.constitution,
    knowledge: data.knowledge,
    auditLogs: data.auditLogs,
    stats: {
      totalPreferences: data.preferences.length + data.constitution.length,
      totalKnowledge: data.knowledge.length,
      totalAuditLogs: data.auditLogs.length
    }
  }
  return JSON.stringify(file, null, 2)
}
