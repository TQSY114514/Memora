import type { ParsedMessage } from '../types'
import { toIsoTimestamp } from '../common'

/**
 * OpenCode 消息模型（V1）共享类型与拼装逻辑
 *
 * 同时被两处使用：
 * 1. src/importer/localExtractor.ts —— 扒取 opencode.db（SQLite）与旧版 JSON storage
 * 2. src/importer/opencode/index.ts —— 导入用户拖入的 OpenCode JSON 文件
 *
 * 数据模型（来自 sst/opencode 源码 v1.18.16）：
 * - message.data：{ role, time: { created }, agent?, model?/modelID?, ... }，正文在 part 表
 * - part.data：按 type 区分（text / reasoning / tool / file / step-start / step-finish / ...）
 */

/** OpenCode 工具状态 */
export interface OpenCodeToolState {
  status?: 'pending' | 'running' | 'completed' | 'error' | string
  input?: unknown
  output?: unknown
  title?: string
  [key: string]: unknown
}

/** OpenCode part（V1 消息 part） */
export interface OpenCodePart {
  type?: string
  text?: string
  synthetic?: boolean
  ignored?: boolean
  tool?: string
  callID?: string
  state?: OpenCodeToolState
  filename?: string
  mime?: string
  url?: string
  [key: string]: unknown
}

/** OpenCode 消息（V1 message.data，parts 为外接的正文列表） */
export interface OpenCodeMessage {
  id?: string
  sessionID?: string
  role?: string
  time?: { created?: number; updated?: number }
  /** user 变体：{ providerID, modelID, variant? } */
  model?: { providerID?: string; modelID?: string; variant?: string }
  /** assistant 变体：顶层 modelID / providerID */
  modelID?: string
  providerID?: string
  parts?: OpenCodePart[]
  /** 简单导出形式：{ role, content } */
  content?: string
  [key: string]: unknown
}

/** OpenCode 会话（session 表 / 会话 JSON） */
export interface OpenCodeSession {
  id?: string
  title?: string
  time?: { created?: number; updated?: number }
  messages?: OpenCodeMessage[]
  [key: string]: unknown
}

/** 工具输出截断长度（防巨型 dump 撑爆正文） */
const MAX_TOOL_OUTPUT = 2000

/** 工具输入摘要长度 */
const MAX_TOOL_INPUT = 500

/** 角色映射：OpenCode 只有 user / assistant 两种，其余一律归 assistant */
export function openCodeRole(role?: string): 'user' | 'assistant' {
  return role === 'user' ? 'user' : 'assistant'
}

/** 工具输入摘要（对象转 JSON，截断避免巨型参数撑爆正文） */
function summarizeToolInput(input: unknown): string {
  if (input === undefined || input === null) return ''
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  if (!text) return ''
  return text.length > MAX_TOOL_INPUT ? text.slice(0, MAX_TOOL_INPUT) + '…' : text
}

/**
 * 把单条消息的 parts 拼装为正文
 * - text：主内容（ignored=true 或空文本跳过）
 * - reasoning：以 [推理] 前缀呈现，按 part 原始顺序与主文本交错
 * - tool：追加 [工具调用: xxx] + 输入摘要；completed 且有输出时追加输出（截断）
 * - file：追加 [附件: filename]
 * - 其余（step-start/step-finish/snapshot/patch/agent/retry/compaction/subtask）整段跳过
 */
function assembleOpenCodePartContent(parts: OpenCodePart[] | undefined): string {
  if (!Array.isArray(parts) || parts.length === 0) return ''
  const sections: string[] = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const type = part.type
    // 无 type 但带 text 的宽松兼容（旧版 part 可能缺少 type）
    if (type === 'text' || (type === undefined && typeof part.text === 'string')) {
      if (part.ignored === true) continue
      if (typeof part.text === 'string' && part.text.trim()) sections.push(part.text.trim())
      continue
    }
    if (type === 'reasoning') {
      if (typeof part.text === 'string' && part.text.trim()) sections.push(`[推理] ${part.text.trim()}`)
      continue
    }
    if (type === 'tool') {
      const toolName = part.tool || ''
      const input = summarizeToolInput(part.state?.input)
      const title = typeof part.state?.title === 'string' && part.state.title ? ` (${part.state.title})` : ''
      let line = `[工具调用: ${toolName}]${title}`
      if (input) line += `\n${input}`
      if (part.state?.status === 'completed' && part.state.output !== undefined && part.state.output !== null) {
        const outputText = typeof part.state.output === 'string' ? part.state.output : JSON.stringify(part.state.output)
        if (outputText && outputText.trim()) {
          const truncated = outputText.length > MAX_TOOL_OUTPUT ? outputText.slice(0, MAX_TOOL_OUTPUT) + '…' : outputText
          line += `\n${truncated}`
        }
      }
      if (line.trim()) sections.push(line)
      continue
    }
    if (type === 'file') {
      if (typeof part.filename === 'string' && part.filename) sections.push(`[附件: ${part.filename}]`)
      continue
    }
    // step-start / step-finish / snapshot / patch / agent / retry / compaction / subtask 等结构噪声一律跳过
  }
  return sections.join('\n\n')
}

/**
 * 把 OpenCode 消息数组组装为 ParsedMessage[]
 * - 空正文（无 parts 且无 content）消息跳过
 * - 时间取 message.time.created（epoch 毫秒）
 * - 模型：user 变体 model.modelID，assistant 变体顶层 modelID
 */
export function assembleOpenCodeMessages(messages: OpenCodeMessage[] | null | undefined): ParsedMessage[] {
  const result: ParsedMessage[] = []
  if (!Array.isArray(messages)) return result
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    // 简单导出形式 {role, content}
    const content = typeof m.content === 'string' ? m.content.trim() : assembleOpenCodePartContent(m.parts)
    if (!content) continue
    const model = (typeof m.model?.modelID === 'string' ? m.model.modelID : undefined) || m.modelID || undefined
    result.push({
      role: openCodeRole(m.role),
      content,
      model,
      createdAt: toIsoTimestamp(m.time?.created) ?? new Date().toISOString()
    })
  }
  return result
}
