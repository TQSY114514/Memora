import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs'
import { StringDecoder } from 'string_decoder'
import { basename, extname, join } from 'path'
import { registerBuiltins, detectImporter, getImporter } from '../importer'
import { createSession, findBySourceId } from '../database/repositories/sessionRepo'
import { getDatabase } from '../database/connection'
import { StreamParseError, LARGE_FILE_THRESHOLD, StreamingArrayExtractor } from './streamJsonArray'
import { sanitizeMessages } from './sanitizer'
import type { ImportResult, ChatSession } from '@shared/types'
import type { ParsedSession, ParsedMessage } from '../importer/types'

/** 进度回调（loaded 已处理字节，total 总字节） */
export type ImportProgressCallback = (loaded: number, total: number) => void

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
      if (['.json', '.md', '.markdown', '.txt', '.html', '.htm'].includes(ext)) {
        files.push(full)
      }
    }
  }
  return files
}

/** 导入单个文件（支持大文件流式 + 进度回调） */
export function importFile(
  filePath: string,
  options?: { folderId?: string; onProgress?: ImportProgressCallback }
): ImportResult {
  registerBuiltins()

  const filename = basename(filePath)
  const fileStat = statSync(filePath, { throwIfNoEntry: false })

  // 大文件（>10MB）且是 JSON 数组格式，走流式路径
  if (fileStat && fileStat.size > LARGE_FILE_THRESHOLD && filename.toLowerCase().endsWith('.json')) {
    try {
      return importLargeJsonFile(filePath, filename, options)
    } catch (e) {
      // 流式失败（如顶层非数组），回退到全量解析
      if (e instanceof StreamParseError && e.code === 'NOT_ARRAY') {
        // 继续走全量路径
      } else {
        // 其他错误直接返回失败
        return {
          imported: 0,
          skipped: 0,
          failed: 1,
          errors: [`流式解析失败: ${(e as Error).message}`],
          sessionIds: []
        }
      }
    }
  }

  // 全量路径（小文件或流式回退）
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

/**
 * 流式导入大 JSON 文件（顶层会话数组）
 * 逐个提取顶层数组元素，交给对应 importer 的 parseSingle 解析后立即持久化，
 * 避免全量 JSON.parse 占用内存。
 */
function importLargeJsonFile(
  filePath: string,
  filename: string,
  options?: { folderId?: string; onProgress?: ImportProgressCallback }
): ImportResult {
  registerBuiltins()

  // 只读前 4KB 探测格式，避免大文件全量读入内存
  const probeFd = openSync(filePath, 'r')
  const probeBuf = Buffer.alloc(4096)
  const probeBytes = readSync(probeFd, probeBuf, 0, 4096, 0)
  closeSync(probeFd)
  const probe = probeBuf.toString('utf-8', 0, probeBytes)
  const importer = detectImporter(filename, probe)
  if (!importer) {
    return {
      imported: 0,
      skipped: 0,
      failed: 1,
      errors: [`无法识别文件格式: ${filename}`],
      sessionIds: []
    }
  }

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    sessionIds: []
  }

  const total = statSync(filePath).size
  const extractor = new StreamingArrayExtractor()
  const decoder = new StringDecoder('utf-8')

  const fd = openSync(filePath, 'r')
  const chunkSize = 64 * 1024
  const chunkBuf = Buffer.alloc(chunkSize)
  let loadedBytes = 0
  let lastProgressByte = 0
  let itemIdx = 0

  /** 处理一个完整 item JSON 字符串 */
  const handleItem = (itemJson: string): void => {
    try {
      // 构造单元素数组 JSON 交给 importer 解析
      const parsedSessions = importer.parse(`[${itemJson}]`)
      const r = persistSessions(parsedSessions, options?.folderId)
      result.imported += r.imported
      result.skipped += r.skipped
      result.failed += r.failed
      result.sessionIds.push(...r.sessionIds)
      if (r.errors.length) result.errors.push(...r.errors)
    } catch (e) {
      result.failed++
      result.errors.push(`第 ${itemIdx + 1} 条: ${(e as Error).message}`)
    }
    itemIdx++
  }

  try {
    // 真流式：分块读取 + 状态机跨块提取，峰值内存 = 单块 64KB + 当前 item
    while (true) {
      const bytesRead = readSync(fd, chunkBuf, 0, chunkSize, loadedBytes)
      if (bytesRead === 0) break
      loadedBytes += bytesRead
      // StringDecoder 处理跨块的 UTF-8 多字节字符（中文），避免截断乱码
      const chunk = decoder.write(chunkBuf.subarray(0, bytesRead))
      const items = extractor.push(chunk)
      for (const itemJson of items) handleItem(itemJson)

      // 进度（每 1MB 上报，事件循环能让出 → 进度真实可见）
      if (options?.onProgress && loadedBytes - lastProgressByte >= 1024 * 1024) {
        options.onProgress(loadedBytes, total)
        lastProgressByte = loadedBytes
      }
    }
    // flush decoder 剩余字节（不完整的多字节尾）+ extractor 剩余 item
    const tail = decoder.end()
    if (tail.length > 0) {
      const items = extractor.push(tail)
      for (const itemJson of items) handleItem(itemJson)
    }
    const finalItems = extractor.flush()
    for (const itemJson of finalItems) handleItem(itemJson)

    if (options?.onProgress) options.onProgress(total, total)
  } finally {
    closeSync(fd)
  }

  return result
}

/**
 * 从 JSON 字符串中提取顶层数组的每个元素（返回元素 JSON 字符串数组）
 * 状态机解析，避免 JSON.parse 构建完整语法树
 *
 * 导出以供单元测试覆盖状态机分支。
 */
export function extractTopLevelArrayItems(json: string): string[] {
  const items: string[] = []
  let i = 0
  const len = json.length

  // 跳过前导空白，找 [
  while (i < len && /\s/.test(json[i])) i++
  if (json[i] !== '[') {
    throw new StreamParseError('NOT_ARRAY', '顶层不是数组')
  }
  i++

  let depth = 0
  let inString = false
  let escape = false
  let itemStart = -1

  while (i < len) {
    const ch = json[i]

    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      i++
      continue
    }

    if (ch === '"') {
      inString = true
      i++
      continue
    }

    if (ch === '{') {
      if (depth === 0) itemStart = i
      depth++
      i++
      continue
    }

    if (ch === '}') {
      depth--
      if (depth === 0 && itemStart >= 0) {
        items.push(json.slice(itemStart, i + 1))
        itemStart = -1
      }
      i++
      continue
    }

    if (ch === ']' && depth === 0) break
    i++
  }

  return items
}

/** 导入内容（已知文件名 + 内容） */
export function importContent(
  filename: string,
  content: string,
  options?: { folderId?: string; provider?: string }
): ImportResult {
  registerBuiltins()

  const importer = options?.provider
    ? getImporter(options.provider) ?? detectImporter(filename, content)
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

  // 平台统计
  const platformStats = new Map<string, number>()

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

      // 导入前脱敏：检测并移除 API Key / Token / 密码等敏感信息，防止凭证入库
      const sanitizedCount = sanitizeMessages(messages)
      if (sanitizedCount > 0) {
        result.errors.push(`「${parsed.title}」: 已脱敏 ${sanitizedCount} 处敏感信息`)
      }

      const created = createSession(sessionInput as never, messages)
      result.imported++
      platformStats.set(parsed.provider, (platformStats.get(parsed.provider) || 0) + 1)
      result.sessionIds.push(created.id)
    } catch (e) {
      result.failed++
      result.errors.push(`「${parsed.title}」: ${(e as Error).message}`)
    }
  }

  if (platformStats.size > 0) {
    const breakdown = Array.from(platformStats.entries())
      .map(([p, c]) => `${p}: ${c} 条`)
      .join(' | ')
    result.errors.push(`📊 导入统计: ${breakdown}`)
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
