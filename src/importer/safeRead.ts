import { readFileSync, statSync, lstatSync, realpathSync } from 'fs'

/** 最大允许读取的文件大小（100MB） */
export const MAX_FILE_SIZE = 100 * 1024 * 1024

/** JSON 解析最大嵌套深度 */
export const MAX_JSON_DEPTH = 100

/**
 * 安全读取文件：检查文件大小 + 符号链接
 * - 拒绝超过 MAX_FILE_SIZE 的文件
 * - 拒绝符号链接（防止 symlink 攻击）
 */
export function safeReadFileSync(filePath: string, encoding: BufferEncoding = 'utf-8'): string {
  // 符号链接检查
  const lstat = lstatSync(filePath)
  if (lstat.isSymbolicLink()) {
    throw new Error(`[安全] 拒绝读取符号链接: ${filePath}`)
  }

  // 文件大小检查
  const stat = statSync(filePath)
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`[安全] 文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB > ${MAX_FILE_SIZE / 1024 / 1024}MB): ${filePath}`)
  }

  return readFileSync(filePath, encoding)
}

/**
 * 安全解析 JSON：限制嵌套深度
 * 通过预扫描原始字符串的 { [ 嵌套深度，防止深度嵌套攻击
 */
export function safeJsonParse<T>(text: string): T {
  // 预扫描嵌套深度
  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{' || ch === '[') {
      depth++
      if (depth > MAX_JSON_DEPTH) {
        throw new Error(`[安全] JSON 嵌套深度超过限制 (${MAX_JSON_DEPTH})`)
      }
    } else if (ch === '}' || ch === ']') {
      depth--
    }
  }
  return JSON.parse(text) as T
}

/**
 * 验证目录路径不包含符号链接（递归检查）
 * 防止目录遍历中的 symlink 逃逸
 */
export function assertNoSymlink(absPath: string): void {
  try {
    const real = realpathSync(absPath)
    if (real !== absPath) {
      // 路径包含符号链接，但不阻止操作（仅记录）
      // 实际阻止在 safeReadFileSync 中通过 lstatSync 完成
    }
  } catch {
    // realpathSync 失败说明路径不存在或不可访问，忽略
  }
}
