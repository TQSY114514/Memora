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

/**
 * 清洗单条文本内容中的敏感信息
 * 返回 { text: 脱敏后的文本, count: 替换次数 }
 */
export function sanitizeContent(text: string): { text: string; count: number } {
  if (!text || typeof text !== 'string') return { text, count: 0 }

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

  return { text: result, count }
}

/**
 * 批量清洗消息内容
 * 在 persistSessions 之前调用，对每条消息的 content 做脱敏
 * 返回总替换次数（仅用于日志，不阻塞导入流程）
 */
export function sanitizeMessages(
  messages: Array<{ content: string; role?: string; model?: string; order: number; createdAt: string }>
): number {
  let totalCount = 0
  for (const msg of messages) {
    const { text, count } = sanitizeContent(msg.content)
    if (count > 0) {
      msg.content = text
      totalCount += count
    }
  }
  return totalCount
}
