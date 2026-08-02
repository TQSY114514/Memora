import type { MMFFile } from './mmfExporter'
import type { MMFImportResult } from '@shared/types'
import {
  createPreference,
  listPreferences,
  createEntry,
  listEntries
} from '@db/repositories'

/**
 * 解析并校验 MMF JSON 字符串
 *
 * 校验规则：
 * - 必须是合法 JSON
 * - format 字段必须为 'memora-memory-format'
 * - version 必须为 1（当前唯一支持版本）
 * - preferences / constitution / knowledge / auditLogs 必须为数组
 *
 * @throws 格式不合法时抛出错误（含可读原因）
 */
export function parseMMF(jsonString: string): MMFFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch (e) {
    throw new Error(`MMF 解析失败：不是合法的 JSON（${e instanceof Error ? e.message : String(e)}）`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('MMF 格式错误：根节点必须是对象')
  }

  const data = parsed as Record<string, unknown>

  if (data.format !== 'memora-memory-format') {
    throw new Error(
      `MMF 格式错误：format 字段应为 'memora-memory-format'，实际为 '${String(data.format)}'`
    )
  }

  if (data.version !== 1) {
    throw new Error(
      `MMF 格式错误：不支持的版本号 ${String(data.version)}（当前仅支持 version 1）`
    )
  }

  if (!Array.isArray(data.preferences)) {
    throw new Error('MMF 格式错误：preferences 必须是数组')
  }
  if (!Array.isArray(data.constitution)) {
    throw new Error('MMF 格式错误：constitution 必须是数组')
  }
  if (!Array.isArray(data.knowledge)) {
    throw new Error('MMF 格式错误：knowledge 必须是数组')
  }
  if (!Array.isArray(data.auditLogs)) {
    throw new Error('MMF 格式错误：auditLogs 必须是数组')
  }

  return data as unknown as MMFFile
}

/**
 * 把 MMF 数据导入到目标工作区
 *
 * 去重策略：
 * - 偏好 / 宪法：按 subject + value（value 大小写不敏感）判重，已存在则跳过
 * - 知识条目：按 title 判重，已存在则跳过
 *
 * 导入行为：
 * - 偏好：调用 createPreference（内部会处理冲突检测、置信度合并等）
 * - 宪法：调用 createPreference（source='constitution'，跳过冲突检测）
 * - 知识：调用 createEntry
 *
 * @returns 导入统计 { imported, skipped, errors }
 */
export function importMMF(data: MMFFile, targetWorkspaceId: string): MMFImportResult {
  const result: MMFImportResult = {
    imported: { preferences: 0, constitution: 0, knowledge: 0 },
    skipped: 0,
    errors: []
  }

  // ===== 偏好 + 宪法：构建已存在的 subject|value 索引（value 大小写不敏感） =====
  const existingPrefs = listPreferences({ workspaceId: targetWorkspaceId, limit: 100000 })
  const prefKeySet = new Set<string>()
  for (const p of existingPrefs) {
    prefKeySet.add(`${p.subject}\u0000${p.value.toLowerCase()}`)
  }

  // 导入常规偏好
  for (const pref of data.preferences) {
    try {
      const key = `${pref.subject}\u0000${pref.value.toLowerCase()}`
      if (prefKeySet.has(key)) {
        result.skipped++
        continue
      }
      prefKeySet.add(key)
      createPreference({
        workspaceId: targetWorkspaceId,
        sessionId: pref.sessionId,
        subject: pref.subject,
        value: pref.value,
        context: pref.context,
        confidence: pref.confidence,
        source: pref.source
      })
      result.imported.preferences++
    } catch (e) {
      result.errors.push(`偏好「${pref.subject}: ${pref.value}」导入失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 导入宪法条目
  for (const pref of data.constitution) {
    try {
      const key = `${pref.subject}\u0000${pref.value.toLowerCase()}`
      if (prefKeySet.has(key)) {
        result.skipped++
        continue
      }
      prefKeySet.add(key)
      createPreference({
        workspaceId: targetWorkspaceId,
        sessionId: pref.sessionId,
        subject: pref.subject,
        value: pref.value,
        context: pref.context,
        confidence: pref.confidence,
        source: 'constitution'
      })
      result.imported.constitution++
    } catch (e) {
      result.errors.push(`宪法「${pref.subject}: ${pref.value}」导入失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ===== 知识条目：构建已存在的 title 索引 =====
  const existingKnowledge = listEntries({ workspaceId: targetWorkspaceId, limit: 100000 })
  const knowledgeTitleSet = new Set<string>()
  for (const k of existingKnowledge) {
    knowledgeTitleSet.add(k.title)
  }

  for (const entry of data.knowledge) {
    try {
      if (knowledgeTitleSet.has(entry.title)) {
        result.skipped++
        continue
      }
      knowledgeTitleSet.add(entry.title)
      createEntry({
        workspaceId: targetWorkspaceId,
        sessionId: entry.sessionId,
        type: entry.type,
        title: entry.title,
        content: entry.content,
        status: entry.status,
        source: entry.source,
        sortOrder: entry.sortOrder
      })
      // createEntry 不会抛出错误则视为成功
      result.imported.knowledge++
    } catch (e) {
      result.errors.push(`知识「${entry.title}」导入失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return result
}
