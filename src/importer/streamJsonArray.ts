/**
 * 大文件流式导入辅助
 *
 * 痛点：ChatGPT 导出的 conversations.json 可能 50MB+，
 * 整个 JSON.parse 会构建完整语法树占用大量内存。
 *
 * 方案：用状态机提取顶层数组的每个元素对象字符串，
 * 每个元素单独 JSON.parse + 持久化，避免全量语法树。
 *
 * 同步实现：service.ts 在 main 进程同步调用，better-sqlite3 也同步，
 * 故用同步提取（readFileSync + 状态机）而非异步流。
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
