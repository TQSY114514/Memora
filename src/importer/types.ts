import type { Message, Provider } from '@shared/types'

/**
 * Importer 接口
 * 每个平台一个实现，输入原始文件内容，输出统一 ChatSession[]
 */
export interface Importer {
  /** 平台标识 */
  provider: Provider

  /** 是否能处理该文件（按扩展名/内容特征判断） */
  detect(filename: string, content: string): boolean

  /** 解析为 ChatSession[]（不含 id，由 repo 生成） */
  parse(content: string): ParsedSession[]
}

/** 导入器解析输出的中间结构 */
export interface ParsedSession {
  sourceId?: string
  provider: Provider
  model?: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
  messages: ParsedMessage[]
}

export interface ParsedMessage {
  role: Message['role']
  content: string
  model?: string
  createdAt: string
}

/** 生成临时 Message（id 由 repo 写库时赋值） */
export function toMessage(
  parsed: ParsedMessage,
  sessionId: string,
  order: number
): Message {
  return {
    id: '', // 由 repo 生成
    sessionId,
    role: parsed.role,
    content: parsed.content,
    model: parsed.model,
    order,
    createdAt: parsed.createdAt
  }
}
