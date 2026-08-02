/**
 * Prompt Injection 检测模块
 *
 * 在导入聊天记录时检测潜在的 prompt injection 攻击，
 * 防止恶意内容通过导入渠道进入系统。
 *
 * 检测类型：
 * - 指令覆盖（ignore previous instructions）
 * - 系统提示篡改（system prompt override）
 * - 角色扮演注入（you are now...）
 * - 越狱尝试（jailbreak patterns）
 * - 间接注入（通过工具调用注入）
 */

export type InjectionRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface InjectionMatch {
  type: string
  pattern: string
  matched: string
  risk: InjectionRiskLevel
  start: number
  end: number
}

export interface InjectionResult {
  hasInjection: boolean
  riskLevel: InjectionRiskLevel
  matches: InjectionMatch[]
  summary: string
}

/** 检测规则 */
const RULES: Array<{
  type: string
  pattern: RegExp
  risk: InjectionRiskLevel
  description: string
}> = [
  // 指令覆盖
  {
    type: 'instruction_override',
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|messages?|context)/gi,
    risk: 'critical',
    description: '试图忽略/覆盖之前的系统指令'
  },
  {
    type: 'instruction_override',
    pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
    risk: 'critical',
    description: '试图忽略之前的指令'
  },
  {
    type: 'instruction_override',
    pattern: /forget\s+(everything|all)\s+(you|we)\s+(were|talked|discussed)/gi,
    risk: 'high',
    description: '试图让 AI 忘记上下文'
  },
  // 系统提示篡改
  {
    type: 'system_prompt_override',
    pattern: /you\s+are\s+now\s+(a\s+|an\s+)?(?!.*(?:helpful|assistant|AI|language|model))/gi,
    risk: 'high',
    description: '试图改变 AI 角色定义'
  },
  {
    type: 'system_prompt_override',
    pattern: /your\s+(new\s+)?(system\s+)?(prompt|instructions?|role)\s+(is|are|:)/gi,
    risk: 'high',
    description: '试图修改系统提示词'
  },
  {
    type: 'system_prompt_override',
    pattern: /from\s+now\s+on\s+you\s+(are|will|must|should)/gi,
    risk: 'medium',
    description: '试图从此刻起改变行为'
  },
  // 越狱尝试
  {
    type: 'jailbreak',
    pattern: /DAN\s+(mode|prompt|jailbreak)/gi,
    risk: 'critical',
    description: 'DAN 越狱尝试'
  },
  {
    type: 'jailbreak',
    pattern: /do\s+anything\s+now/gi,
    risk: 'critical',
    description: 'DAN 越狱变体'
  },
  {
    type: 'jailbreak',
    pattern: /developer\s+mode\s+(override|enabled|activated)/gi,
    risk: 'high',
    description: '开发者模式越狱'
  },
  {
    type: 'jailbreak',
    pattern: /bypass\s+(content\s+)?(filter|restriction|policy|rule|limit)/gi,
    risk: 'high',
    description: '试图绕过内容过滤'
  },
  // 间接注入
  {
    type: 'indirect_injection',
    pattern: /\[system\]\s*(\([^)]*\))?\s*:/gi,
    risk: 'high',
    description: '伪造系统消息格式'
  },
  {
    type: 'indirect_injection',
    pattern: /<\|im_start\|>system/gi,
    risk: 'critical',
    description: 'ChatML 格式注入'
  },
  {
    type: 'indirect_injection',
    pattern: /<\|endoftext\|>/gi,
    risk: 'medium',
    description: '特殊 token 注入'
  },
  // 信息泄露诱导
  {
    type: 'info_extraction',
    pattern: /tell\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions?|secret)/gi,
    risk: 'medium',
    description: '试图获取系统提示词'
  },
  {
    type: 'info_extraction',
    pattern: /what\s+(is|are)\s+(your\s+)?(instructions?|system\s+prompt|rules?)/gi,
    risk: 'medium',
    description: '试图获取指令信息'
  }
]

export function detectPromptInjection(text: string): InjectionResult {
  if (!text || text.length === 0) {
    return {
      hasInjection: false,
      riskLevel: 'low',
      matches: [],
      summary: '无内容可检测'
    }
  }

  const matches: InjectionMatch[] = []

  for (const rule of RULES) {
    // 重置 regex lastIndex
    rule.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rule.pattern.exec(text)) !== null) {
      matches.push({
        type: rule.type,
        pattern: rule.description,
        matched: match[0],
        risk: rule.risk,
        start: match.index,
        end: match.index + match[0].length
      })
    }
  }

  if (matches.length === 0) {
    return {
      hasInjection: false,
      riskLevel: 'low',
      matches: [],
      summary: '未检测到注入风险'
    }
  }

  // 确定最高风险等级
  const riskOrder: InjectionRiskLevel[] = ['low', 'medium', 'high', 'critical']
  const maxRisk = matches.reduce((max, m) => {
    const idx = riskOrder.indexOf(m.risk)
    const maxIdx = riskOrder.indexOf(max)
    return idx > maxIdx ? m.risk : max
  }, 'low' as InjectionRiskLevel)

  // 按类型分组
  const byType = new Map<string, InjectionMatch[]>()
  for (const m of matches) {
    const list = byType.get(m.type) || []
    list.push(m)
    byType.set(m.type, list)
  }

  const summaryParts: string[] = []
  for (const [type, ms] of byType) {
    const typeName = type === 'instruction_override' ? '指令覆盖'
      : type === 'system_prompt_override' ? '系统提示篡改'
      : type === 'jailbreak' ? '越狱尝试'
      : type === 'indirect_injection' ? '间接注入'
      : type === 'info_extraction' ? '信息提取'
      : type
    summaryParts.push(`${typeName} x${ms.length}`)
  }

  return {
    hasInjection: true,
    riskLevel: maxRisk,
    matches,
    summary: `检测到 ${matches.length} 处风险：${summaryParts.join('，')}`
  }
}

/** 批量检测多条消息 */
export function batchDetectInjection(messages: Array<{ content: string; source: string }>): Array<{
  source: string
  result: InjectionResult
}> {
  return messages.map((msg) => ({
    source: msg.source,
    result: detectPromptInjection(msg.content)
  }))
}