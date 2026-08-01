/**
 * 大文件流式导入辅助
 *
 * 痛点：ChatGPT 导出的 conversations.json 可能 50MB+，
 * 整个 JSON.parse 会构建完整语法树占用大量内存。
 *
 * 方案：
 * - 流式状态机 StreamingArrayExtractor：逐块喂入，跨块维护解析状态，
 *   提取顶层数组的每个完整元素对象字符串，避免全量字符串驻留内存。
 * - 内存峰值从「整文件 ~150MB」降到「单块 64KB + 当前 item」。
 *
 * 同步实现：service.ts 在 main 进程同步调用，better-sqlite3 也同步，
 * 故用同步分块读取（openSync + readSync 循环）而非异步流。
 */

/** 流式解析错误 */
export class StreamParseError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'StreamParseError'
  }
}

/** 大文件阈值（10MB 以上走流式路径） */
export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024

/**
 * 流式顶层数组提取器
 *
 * 用法：
 *   const extractor = new StreamingArrayExtractor()
 *   const items1 = extractor.push(chunk1)  // 返回 chunk1 内完整的元素
 *   const items2 = extractor.push(chunk2)  // 跨块元素在此返回
 *   const items3 = extractor.flush()       // 最后一个元素（无尾 ] 也能提取）
 *
 * 状态机跨块维护：depth / inString / escape / itemStartPos，
 * buf 保留未完成 item 的起始位置之后的所有文本，下一块追加后继续。
 */
export class StreamingArrayExtractor {
  private foundArray = false
  private depth = 0
  private inString = false
  private escape = false
  /** 当前未完成 item 在 buf 中的起始位置（-1 = 在 item 之间） */
  private itemStartPos = -1
  private buf = ''

  /** 喂入一个文本块，返回该块内能完整提取的元素 JSON 字符串数组 */
  push(chunk: string): string[] {
    this.buf += chunk
    return this.drain()
  }

  /** 输入结束时调用，提取最后一个未闭合的 item（容错：文件无尾 ] 也能提取） */
  flush(): string[] {
    return this.drain()
  }

  private drain(): string[] {
    const items: string[] = []
    const text = this.buf
    const len = text.length
    let i = this.itemStartPos >= 0 ? this.itemStartPos : 0
    // 如果在 item 之间，从 0 开始扫描；如果在 item 内，从 itemStart 扫描（itemStart 之前已处理）
    // 但 item 之间的空白/逗号需要跳过，所以 item 之间从上次的扫描位置继续
    // 简化：item 之间从 buf 开头扫描（buf 在 item 之间时只含未处理的空白/逗号/]
    if (this.itemStartPos < 0) i = 0

    while (i < len) {
      const ch = text[i]

      // 还没找到顶层数组开始
      if (!this.foundArray) {
        if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue }
        if (ch === '[') { this.foundArray = true; i++; continue }
        throw new StreamParseError('NOT_ARRAY', '顶层不是数组')
      }

      // 字符串内部（跨块也安全：inString/escape 状态保留）
      if (this.inString) {
        if (this.escape) this.escape = false
        else if (ch === '\\') this.escape = true
        else if (ch === '"') this.inString = false
        i++
        continue
      }

      if (ch === '"') { this.inString = true; i++; continue }

      if (ch === '{') {
        if (this.depth === 0) this.itemStartPos = i
        this.depth++
        i++
        continue
      }

      if (ch === '}') {
        this.depth--
        if (this.depth === 0 && this.itemStartPos >= 0) {
          items.push(text.slice(this.itemStartPos, i + 1))
          this.itemStartPos = -1
        }
        i++
        continue
      }

      // 数组结束
      if (ch === ']' && this.depth === 0) {
        this.buf = ''
        this.itemStartPos = -1
        return items
      }

      // 其他字符（逗号、空白等）跳过
      i++
    }

    // 保留未完成部分：
    // - item 未完成（itemStartPos >= 0）：保留从 itemStartPos 开始的文本
    // - item 之间：保留未处理的尾部（可能是部分空白，但下一块会追加；
    //   为安全保留从 i 开始，避免丢失分隔符间的字符）
    if (this.itemStartPos >= 0) {
      this.buf = text.slice(this.itemStartPos)
      this.itemStartPos = 0
    } else {
      // item 之间：已扫描到 i，保留 i 之后（通常是空，但下一块会追加）
      this.buf = text.slice(i)
    }

    return items
  }
}
