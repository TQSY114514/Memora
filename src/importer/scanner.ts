/**
 * 导入扫描器 —— 自动发现本地可导入的 AI 对话文件
 *
 * 设计原则：
 * 1. 隐私优先：预览只读取文件头部（≤64KB），不读取完整隐私内容
 * 2. 用户主动：扫描由 UI 触发，不后台静默运行
 * 3. 范围受限：仅扫描指定目录（Downloads/Documents/Desktop），不深度遍历系统目录
 * 4. 复用现有：识别调用 detectImporter，导入调用 importFile，不改动 Importer 接口
 *
 * 不扫描：浏览器 Cookie、密码、系统配置、隐藏目录、node_modules
 */
import { readdirSync, statSync, readFileSync, openSync, readSync, closeSync, existsSync } from 'fs'
import { basename, extname, join } from 'path'
import { registerBuiltins, detectImporter } from './index'
import type { Provider, ScanPreview, ScanResult } from '@shared/types'

/** 可扫描的文件扩展名 */
const SCANNABLE_EXTS = ['.json', '.md', '.markdown', '.html', '.htm', '.txt', '.zip']

/** 预览阶段读取的文件头部大小（64KB）——足够检测格式特征，又避免读取隐私内容 */
const HEAD_BYTES = 64 * 1024

/** ≤ 此大小的文件才尝试完整 parse 以预估对话数（5MB） */
const PREVIEW_PARSE_LIMIT = 5 * 1024 * 1024

/** 跳过这些目录名（不递归进入） */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '$RECYCLE.BIN',
  'System Volume Information',
  '.Trash',
  '.cache'
])

export interface ScanOptions {
  /** 递归最大深度，默认 2 */
  maxDepth?: number
  /** 单目录最多收集的候选文件数，默认 500 */
  maxFiles?: number
}

/**
 * 按文件名启发式判断平台
 * （用于 zip 等无法直接读取文本内容的场景）
 */
export function guessProviderByFilename(name: string): Provider | 'Unknown' {
  const n = name.toLowerCase()
  if (n.includes('chatgpt') || n.includes('openai') || n.includes('conversations')) return 'ChatGPT'
  if (n.includes('claude')) return 'Claude'
  if (n.includes('gemini') || n.includes('bard')) return 'Gemini'
  if (n.includes('deepseek')) return 'DeepSeek'
  if (n.includes('kimi') || n.includes('moonshot')) return 'Kimi'
  if (n.includes('qwen') || n.includes('tongyi') || name.includes('通义')) return 'Qwen'
  if (n.includes('grok')) return 'Grok'
  if (n.includes('cursor')) return 'Cursor'
  return 'Unknown'
}

/** 判断文件扩展名是否可扫描 */
export function isScannableExt(ext: string): boolean {
  return SCANNABLE_EXTS.includes(ext.toLowerCase())
}

/**
 * 预览单个文件：识别平台 + 预估对话数
 * 安全保证：不读取完整隐私内容，大文件只读头部 64KB
 */
export function previewFile(filePath: string): ScanPreview {
  registerBuiltins()
  const fileName = basename(filePath)
  const ext = extname(fileName).toLowerCase()
  const stat = statSync(filePath)
  let provider: Provider | 'Unknown' = 'Unknown'
  let estimatedSessions: number | null = null

  if (ext === '.zip') {
    // zip 无法直接读取文本内容，仅按文件名启发式判断
    provider = guessProviderByFilename(fileName)
    return {
      filePath,
      fileName,
      sizeBytes: stat.size,
      ext,
      provider,
      estimatedSessions,
      mtime: stat.mtime.toISOString()
    }
  }

  try {
    let content: string
    if (stat.size <= PREVIEW_PARSE_LIMIT) {
      // 小文件：读全部，detect + parse 预估
      content = readFileSync(filePath, 'utf-8')
    } else {
      // 大文件：只读头部做 detect，不 parse（保护隐私 + 性能）
      const fd = openSync(filePath, 'r')
      const buf = Buffer.alloc(HEAD_BYTES)
      const bytes = readSync(fd, buf, 0, HEAD_BYTES, 0)
      closeSync(fd)
      content = buf.slice(0, bytes).toString('utf-8')
    }

    const importer = detectImporter(fileName, content)
    if (importer) {
      provider = importer.provider
      if (stat.size <= PREVIEW_PARSE_LIMIT) {
        try {
          estimatedSessions = importer.parse(content).length
        } catch {
          // parse 失败不影响识别结果
        }
      }
    }
  } catch {
    // 读取失败：返回 Unknown，不影响整体扫描流程
  }

  return {
    filePath,
    fileName,
    sizeBytes: stat.size,
    ext,
    provider,
    estimatedSessions,
    mtime: stat.mtime.toISOString()
  }
}

/**
 * 扫描单个根目录，返回候选文件列表
 * - 递归深度受限（默认 2 层）
 * - 跳过隐藏目录、node_modules、系统目录
 * - 仅收集识别出平台的文件（zip 候选保留，导入时再处理）
 */
export function scanDirectory(root: string, opts?: ScanOptions): ScanResult {
  registerBuiltins()
  const maxDepth = opts?.maxDepth ?? 2
  const maxFiles = opts?.maxFiles ?? 500
  const files: ScanPreview[] = []
  let scanned = 0
  let skipped = 0

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth || files.length >= maxFiles) return
    let entries: import("fs").Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return // 无权限读取的目录直接跳过
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break
      // 跳过隐藏文件/目录和敏感目录
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue

      const full = join(dir, entry.name)
      try {
        if (entry.isDirectory()) {
          walk(full, depth + 1)
        } else if (entry.isFile()) {
          scanned++
          const ext = extname(entry.name).toLowerCase()
          if (!isScannableExt(ext)) {
            skipped++
            continue
          }
          const preview = previewFile(full)
          // 只收集识别出平台的文件（zip 候选保留供 UI 提示）
          if (preview.provider !== 'Unknown' || preview.ext === '.zip') {
            files.push(preview)
          } else {
            skipped++
          }
        }
      } catch {
        skipped++
      }
    }
  }

  walk(root, 0)
  return { root, files, scanned, skipped, truncated: files.length >= maxFiles }
}

/** 批量扫描多个根目录 */
export function scanDirectories(roots: string[], opts?: ScanOptions): ScanResult[] {
  return roots.filter((r) => existsSync(r)).map((r) => scanDirectory(r, opts))
}
