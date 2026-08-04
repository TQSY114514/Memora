/**
 * 沟通风格推断 —— 从偏好和对话统计中推断用户的沟通风格
 *
 * 分析维度：
 * - short_answer: 是否偏好简短回答
 * - code_first: 是否偏好代码优先
 * - markdown: 是否偏好 Markdown 格式
 * - formality: casual / neutral / formal
 * - detail_level: brief / balanced / detailed
 */

import { getDatabase } from '../database/connection'

export interface CommunicationStyle {
  prefers: {
    short_answer: boolean
    code_first: boolean
    markdown: boolean
  }
  formality: 'casual' | 'neutral' | 'formal'
  detail_level: 'brief' | 'balanced' | 'detailed'
  /** 推断依据 */
  evidence: string[]
}

interface PreferenceRow {
  subject: string
  value: string
  confidence: number
}

/** 简短回答关键词 */
const SHORT_KW = ['简洁', '简短', '短', 'short', 'concise', '直接', '别废话', '不要啰嗦', '不要解释']
/** 代码优先关键词 */
const CODE_KW = ['代码', 'code', '示例', 'example', '代码块', 'snippet', 'demo', '实现']
/** Markdown 关键词 */
const MD_KW = ['markdown', 'md', '格式']
/** 正式关键词 */
const FORMAL_KW = ['正式', 'formal', '专业', 'professional', '商务', 'business']
/** 随意关键词 */
const CASUAL_KW = ['随意', 'casual', '轻松', '友好', 'friendly', '随便']
/** 详细关键词 */
const DETAILED_KW = ['详细', 'detailed', '完整', 'comprehensive', '深入', 'in-depth', '展开']

function matches(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((k) => lower.includes(k.toLowerCase()))
}

export function inferCommunicationStyle(workspaceId?: string): CommunicationStyle {
  const db = getDatabase()

  let rows: PreferenceRow[]
  if (workspaceId) {
    rows = db
      .prepare(
        `SELECT subject, value, confidence FROM preferences
         WHERE workspace_id = ? AND status = 'active'
         ORDER BY confidence DESC LIMIT 200`
      )
      .all(workspaceId) as PreferenceRow[]
  } else {
    rows = db
      .prepare(
        `SELECT subject, value, confidence FROM preferences
         WHERE status = 'active'
         ORDER BY confidence DESC LIMIT 200`
      )
      .all() as PreferenceRow[]
  }

  const evidence: string[] = []

  // 简短回答
  const shortAnswer = rows.some((r) => matches(r.subject, SHORT_KW) || matches(r.value, SHORT_KW))
  if (shortAnswer) evidence.push('偏好简短回答')

  // 代码优先
  const codeFirst = rows.some((r) => matches(r.subject, CODE_KW) || matches(r.value, CODE_KW))
  if (codeFirst) evidence.push('偏好代码示例')

  // Markdown
  const markdown = rows.some((r) => matches(r.subject, MD_KW) || matches(r.value, MD_KW))
  if (markdown) evidence.push('偏好 Markdown 格式')

  // 正式度
  const formalHits = rows.filter((r) => matches(r.subject, FORMAL_KW) || matches(r.value, FORMAL_KW)).length
  const casualHits = rows.filter((r) => matches(r.subject, CASUAL_KW) || matches(r.value, CASUAL_KW)).length
  let formality: CommunicationStyle['formality'] = 'neutral'
  if (formalHits > casualHits) {
    formality = 'formal'
    evidence.push('沟通风格偏正式')
  } else if (casualHits > formalHits) {
    formality = 'casual'
    evidence.push('沟通风格偏随意')
  }

  // 详细程度
  const detailedHits = rows.filter((r) => matches(r.subject, DETAILED_KW) || matches(r.value, DETAILED_KW)).length
  let detail_level: CommunicationStyle['detail_level'] = 'balanced'
  if (shortAnswer && detailedHits === 0) {
    detail_level = 'brief'
    evidence.push('偏好简洁回答')
  } else if (detailedHits > 0 && !shortAnswer) {
    detail_level = 'detailed'
    evidence.push('偏好详细回答')
  }

  return {
    prefers: {
      short_answer: shortAnswer,
      code_first: codeFirst,
      markdown
    },
    formality,
    detail_level,
    evidence
  }
}