import { readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { registerBuiltins, detectImporter } from '../importer'
import { createSession, findBySourceId } from '../database/repositories/sessionRepo'
import type { ImportResult, ChatSession } from '@shared/types'
import type { ParsedSession, ParsedMessage } from '../importer/types'

/** 递归收集目录下所有可导入文件 */
function collectFiles(dirPath: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dirPath)
  for (const entry of entries) {
    const full = join(dirPath, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...collectFiles(full))
    } else {
      const ext = extname(entry).toLowerCase()
      if (['.json', '.md', '.markdown', '.txt'].includes(ext)) {
        files.push(full)
      }
    }
  }
  return files
}

/** 导入单个文件 */
export function importFile(
  filePath: string,
  options?: { folderId?: string }
): ImportResult {
  registerBuiltins()

  const filename = basename(filePath)
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch (e) {
    return {
      imported: 0,
      skipped: 0,
      failed: 1,
      errors: [`读取文件失败: ${(e as Error).message}`],
      sessionIds: []
    }
  }

  return importContent(filename, content, options)
}

/** 导入内容（已知文件名 + 内容） */
export function importContent(
  filename: string,
  content: string,
  options?: { folderId?: string; provider?: string }
): ImportResult {
  registerBuiltins()

  const importer = options?.provider
    ? detectImporter(filename, content)
    : detectImporter(filename, content)

  if (!importer) {
    return {
      imported: 0,
      skipped: 0,
      failed: 1,
      errors: [`无法识别文件格式: ${filename}`],
      sessionIds: []
    }
  }

  let parsed: ParsedSession[]
  try {
    parsed = importer.parse(content)
  } catch (e) {
    return {
      imported: 0,
      skipped: 0,
      failed: 1,
      errors: [`解析失败: ${(e as Error).message}`],
      sessionIds: []
    }
  }

  if (parsed.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      sessionIds: []
    }
  }

  return persistSessions(parsed, options?.folderId)
}

/** 导入目录（递归） */
export function importDirectory(
  dirPath: string,
  options?: { folderId?: string }
): ImportResult {
  registerBuiltins()

  const files = collectFiles(dirPath)
  const aggregated: ImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    sessionIds: []
  }

  for (const file of files) {
    const r = importFile(file, options)
    aggregated.imported += r.imported
    aggregated.skipped += r.skipped
    aggregated.failed += r.failed
    aggregated.sessionIds.push(...r.sessionIds)
    if (r.errors.length > 0) {
      aggregated.errors.push(`${file}: ${r.errors.join('; ')}`)
    }
  }

  return aggregated
}

/** 将解析后的会话持久化到数据库（含幂等） */
export function persistSessions(
  sessions: ParsedSession[],
  folderId?: string
): ImportResult {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    sessionIds: []
  }

  for (const parsed of sessions) {
    try {
      // 幂等检查：相同 sourceId + provider 已存在则跳过
      if (parsed.sourceId) {
        const existing = findBySourceId(parsed.sourceId, parsed.provider)
        if (existing) {
          result.skipped++
          continue
        }
      }

      const now = new Date().toISOString()
      const sessionInput: Omit<ChatSession, 'id' | 'importedAt' | 'tags'> = {
        sourceId: parsed.sourceId,
        provider: parsed.provider,
        model: parsed.model,
        title: parsed.title,
        description: parsed.description,
        folderId,
        isFavorite: false,
        messageCount: parsed.messages.length,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      }

      const messages = parsed.messages.map((m, idx) => ({
        sessionId: '',
        role: m.role,
        content: m.content,
        model: m.model,
        order: idx,
        createdAt: m.createdAt
      }))

      const created = createSession(sessionInput as never, messages)
      result.imported++
      result.sessionIds.push(created.id)
    } catch (e) {
      result.failed++
      result.errors.push(`「${parsed.title}」: ${(e as Error).message}`)
    }
  }

  return result
}


/** 导入已扒取的对话（来自本地扒取，可编辑标题/来源后导入） */
export function importExtractedSessions(
  sessions: Array<{
    id: string
    provider: string
    title: string
    source: string
    messageCount: number
    createdAt: string
    updatedAt: string
    messages: Array<{ role: string; content: string; model?: string; createdAt: string }>
  }>,
  options?: { folderId?: string }
): ImportResult {
  registerBuiltins()
  const parsed: ParsedSession[] = sessions.map((s) => ({
    provider: s.provider as ParsedSession['provider'],
    sourceId: s.id,
    title: s.title,
    description: s.source,  // 来源标注存入 description
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messages: s.messages.map((m) => ({
      role: m.role as ParsedMessage['role'],
      content: m.content,
      model: m.model,
      createdAt: m.createdAt
    }))
  }))
  return persistSessions(parsed, options?.folderId)
}
