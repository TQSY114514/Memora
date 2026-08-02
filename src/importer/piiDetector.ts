/**
 * PII（个人身份信息）检测模块
 *
 * 在文本内容中检测常见的 PII 与敏感凭证，返回精确位置与脱敏后的文本。
 * 覆盖类型：API Key、邮箱、电话、身份证、信用卡、JWT、私钥。
 *
 * 设计原则：
 * - 保守匹配：尽量降低误伤，正则带边界/长度约束
 * - 位置精确：每条命中携带 [start, end)，便于上层定位与告警
 * - 重叠仲裁：多个模式命中同一区间时，按“起点升序、长度降序”保留首个最长区间，避免重复计数
 * - 与 sanitizer.ts 互补：sanitizer 自动脱敏凭证（API Key/Token/密码），本模块覆盖更广的 PII 类型
 * - 纯字符串处理，零副作用
 */

export interface PiiMatch {
  type: 'api_key' | 'email' | 'phone' | 'id_card' | 'credit_card' | 'jwt' | 'private_key'
  value: string
  masked: string
  start: number
  end: number
}

export interface PiiResult {
  hasPii: boolean
  matches: PiiMatch[]
  /** 文本中的 PII 已替换为 [REDACTED:type] 后的结果 */
  sanitized: string
}

type PiiType = PiiMatch['type']

interface PiiPattern {
  type: PiiType
  /** 必须带 g 标志 */
  re: RegExp
}

// 顺序仅影响同位置命中的可读性，最终仲裁以 (start, -length) 排序为准。
// 私钥 / JWT 放在前，避免其内部片段被更细碎的模式先吞掉。
const PII_PATTERNS: PiiPattern[] = [
  // 私钥（PEM 块，跨行；RSA / EC / OPENSSH / ENCRYPTED / 通用 PRIVATE KEY）
  {
    type: 'private_key',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
  },
  // JWT（三段 base64url，以点分隔；首段通常以 eyJ 开头——base64 编码的 {"）
  {
    type: 'jwt',
    re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
  },
  // Anthropic API Key（sk-ant-...）
  { type: 'api_key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  // OpenAI API Key（sk-...，排除 sk-ant-）
  { type: 'api_key', re: /sk-(?!ant-)[A-Za-z0-9]{20,}/g },
  // 通用 32+ 字符字母数字 token（要求至少含一位数字，降低对纯字母串/普通文本的误伤）
  { type: 'api_key', re: /(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{32,}/g },
  // 邮箱
  { type: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // 国际电话（+国家码 + 号码）
  { type: 'phone', re: /\+\d{1,3}[-\s]?\d{4,14}/g },
  // 中国大陆手机号（1[3-9] + 9 位，前后不能紧跟数字）
  { type: 'phone', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  // 信用卡（4-4-4-4，组间分隔符为空格或短横）
  { type: 'credit_card', re: /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g },
  // 中国身份证（18 位，末位为数字或 X/x，前后不能紧跟数字）
  { type: 'id_card', re: /(?<!\d)\d{17}[\dXx](?!\d)/g }
]

/** 检测文本中的 PII */
export function detectPii(text: string): PiiResult {
  if (!text || typeof text !== 'string') {
    return { hasPii: false, matches: [], sanitized: text ?? '' }
  }

  // 1. 收集所有模式的原始命中
  const raw: Array<Omit<PiiMatch, 'masked'>> = []
  for (const pattern of PII_PATTERNS) {
    pattern.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.re.exec(text)) !== null) {
      const value = m[0]
      // 防御零宽匹配导致的死循环
      if (value.length === 0) {
        pattern.re.lastIndex++
        continue
      }
      raw.push({ type: pattern.type, value, start: m.index, end: m.index + value.length })
    }
  }

  // 2. 排序：起点升序，同起点长度降序（更长/更具体的优先）
  raw.sort((a, b) => a.start - b.start || b.value.length - a.value.length)

  // 3. 仲裁：丢弃与已接受区间重叠的命中
  const accepted: PiiMatch[] = []
  let lastEnd = -1
  for (const r of raw) {
    if (r.start < lastEnd) continue
    accepted.push({ ...r, masked: `[REDACTED:${r.type}]` })
    lastEnd = r.end
  }

  // 4. 构建脱敏文本（按命中位置切片拼接，保持索引稳定）
  let sanitized = ''
  let cursor = 0
  for (const m of accepted) {
    sanitized += text.slice(cursor, m.start)
    sanitized += m.masked
    cursor = m.end
  }
  sanitized += text.slice(cursor)

  return { hasPii: accepted.length > 0, matches: accepted, sanitized }
}

/** 对文本进行 PII 脱敏（替换为 [REDACTED:type]） */
export function sanitizePii(text: string): string {
  return detectPii(text).sanitized
}
