/**
 * 导入敏感信息清洗
 *
 * 在对话内容写入数据库前，检测并脱敏常见的 API Key / Token / 密码模式，
 * 防止用户无意间将凭证带入本地知识库（如对话中粘贴了 .env 内容）。
 *
 * 设计原则：
 * - 保守匹配：只匹配高置信度的密钥格式（特定前缀 + 足够长度），避免误伤正常技术讨论
 * - 保留上下文：替换为 [REDACTED:类型]，让用户知道这里曾有凭证
 * - 零副作用：纯字符串处理，不依赖外部服务
 */

import { detectPii, sanitizePii, type PiiMatch } from './piiDetector'

interface SanitizePattern {
  /** 正则（必须带 g 标志） */
  re: RegExp
  /** 脱敏标签 */
  label: string
  /** 'whole' 替换整个匹配；'value' 只替换值部分（保留 key= 前缀） */
  strategy: 'whole' | 'value'
}

// 注意：顺序敏感——更具体的模式（sk-ant-）必须放在更通用的模式（sk-）之前
const PATTERNS: SanitizePattern[] = [
  // Anthropic API Key（sk-ant-...）
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/g, label: 'Anthropic-Key', strategy: 'whole' },
  // OpenAI API Key（sk-...，但不包括 sk-ant-）
  { re: /sk-(?!ant-)[A-Za-z0-9]{20,}/g, label: 'OpenAI-Key', strategy: 'whole' },
  // AWS Access Key ID（AKIA/ASIA/ASCA + 16 字符）
  { re: /(?:AKIA|ASIA|ASCA)[A-Z0-9]{16}/g, label: 'AWS-AccessKey', strategy: 'whole' },
  // AWS Secret Access Key（40 字符 Base64，前缀aws_secret= 提升置信度避免误伤）
  {
    re: /((?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?secret)["']?\s*[:=]\s*["']?)[A-Za-z0-9/+=]{40}(["']?)/gi,
    label: 'AWS-SecretKey',
    strategy: 'value'
  },
  // 阿里云 AccessKey ID（LTAI + 12-18 字符）
  { re: /LTAI[A-Za-z0-9]{12,18}/g, label: 'Aliyun-AccessKey', strategy: 'whole' },
  // 阿里云 AccessKey Secret（30 字符 Base64，前缀提升置信度）
  {
    re: /((?:aliyun[_-]?access[_-]?key[_-]?secret|aliyun[_-]?secret)["']?\s*[:=]\s*["']?)[A-Za-z0-9/+=]{30}(["']?)/gi,
    label: 'Aliyun-SecretKey',
    strategy: 'value'
  },
  // Google API Key（AIza...，固定 35 字符后缀）
  { re: /AIza[A-Za-z0-9_-]{35}/g, label: 'Google-Key', strategy: 'whole' },
  // GitHub Token（ghp_/gho_/ghu_/ghs_/ghr_ + 36+ 字符）
  { re: /gh[pousr]_[A-Za-z0-9]{36,}/g, label: 'GitHub-Token', strategy: 'whole' },
  // Bearer Token（Authorization: Bearer ...，匹配 Bearer + 空格 + token）
  { re: /Bearer\s+[A-Za-z0-9._-]{20,}/g, label: 'Bearer-Token', strategy: 'whole' },
  // 通用 key=value 模式（api_key=xxx / password: xxx / "secret": "xxx"）
  // 只匹配长度 >= 16 的值，避免误伤短数值；保留 key 前缀和引号后缀
  {
    re: /((?:api[_-]?key|secret|token|password|passwd|pwd)["']?\s*[:=]\s*["']?)[A-Za-z0-9+/=_-]{16,}(["']?)/gi,
    label: 'Credential',
    strategy: 'value'
  }
]

/** 清洗统计（用于日志，不阻塞导入） */
export interface SanitizeStats {
  sanitized: number
  patterns: Record<string, number>
}

/** 清洗选项 */
export interface SanitizeOptions {
  /**
   * 是否同时脱敏 PII（邮箱/电话/身份证/信用卡/JWT/私钥）。
   * 默认 false：仅检测计数，保留原文（保护用户数据，仅用于告警）。
   */
  sanitizePii?: boolean
}

/** 清洗单条文本的返回结果 */
export interface SanitizeResult {
  text: string
  /** 凭证脱敏次数（API Key / Token / 密码，已自动替换） */
  count: number
  /** 检测到的 PII 数量（无论是否脱敏） */
  piiCount: number
  /** 命中的 PII 明细（用于上层告警） */
  piiMatches: PiiMatch[]
}

/**
 * 清洗单条文本内容中的敏感信息
 *
 * 两趟处理：
 * 1. 凭证脱敏（自动）：API Key / Token / 密码等高置信度凭证，原地替换为 [REDACTED:类型]
 * 2. PII 检测（附加）：调用 detectPii 覆盖更广的 PII 类型（邮箱/电话/身份证/信用卡/JWT/私钥）。
 *    默认仅检测计数（piiCount）并保留原文——保护用户数据；传入 { sanitizePii: true } 时同步脱敏。
 */
export function sanitizeContent(text: string, options?: SanitizeOptions): SanitizeResult {
  if (!text || typeof text !== 'string') {
    return { text, count: 0, piiCount: 0, piiMatches: [] }
  }

  // Pass 1: 既有凭证脱敏（自动）
  let result = text
  let count = 0

  for (const pattern of PATTERNS) {
    // 重置 lastIndex（g 标志的 RegExp 复用时需重置）
    pattern.re.lastIndex = 0
    if (pattern.strategy === 'whole') {
      result = result.replace(pattern.re, () => {
        count++
        return `[REDACTED:${pattern.label}]`
      })
    } else {
      // value 策略：保留前缀（key=）和后缀（引号），只替换值
      result = result.replace(pattern.re, (_match, prefix, suffix) => {
        count++
        return `${prefix}[REDACTED:${pattern.label}]${suffix || ''}`
      })
    }
  }

  // Pass 2: PII 检测（附加）——默认仅检测，不修改原文；sanitizePii=true 时同步脱敏
  const pii = detectPii(result)
  if (options?.sanitizePii) {
    result = sanitizePii(result)
  }

  return { text: result, count, piiCount: pii.matches.length, piiMatches: pii.matches }
}

/**
 * 批量清洗消息内容
 * 在 persistSessions 之前调用，对每条消息的 content 做凭证脱敏 + PII 检测。
 * - 凭证（API Key/Token/密码）始终自动脱敏
 * - PII（邮箱/电话/身份证等）默认仅检测计数（保护用户数据），传入 { sanitizePii: true } 时同步脱敏
 * 返回 { sanitized: 凭证脱敏次数, piiCount: PII 命中数, piiMatches: PII 明细 }，仅用于日志/告警，不阻塞导入流程。
 */
export function sanitizeMessages(
  messages: Array<{ content: string; role?: string; model?: string; order: number; createdAt: string }>,
  options?: SanitizeOptions
): { sanitized: number; piiCount: number; piiMatches: PiiMatch[] } {
  let totalCount = 0
  let totalPii = 0
  const allPii: PiiMatch[] = []

  for (const msg of messages) {
    const r = sanitizeContent(msg.content, options)
    // 文本被改动（凭证脱敏 或 PII 脱敏）时回写
    if (r.count > 0 || (options?.sanitizePii && r.piiCount > 0)) {
      msg.content = r.text
    }
    totalCount += r.count
    totalPii += r.piiCount
    if (r.piiMatches.length > 0) allPii.push(...r.piiMatches)
  }

  return { sanitized: totalCount, piiCount: totalPii, piiMatches: allPii }
}
