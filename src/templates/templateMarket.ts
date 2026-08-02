/**
 * 记忆模板市场
 *
 * 支持社区驱动的"专家记忆包"导入导出。
 * 模板包含预定义的知识结构、偏好模板和蒸馏策略。
 */

/** 模板定义 */
export interface MemoryTemplate {
  id: string
  name: string
  description: string
  /** 模板作者 */
  author: string
  /** 版本 */
  version: string
  /** 模板分类 */
  category: string
  /** 标签 */
  tags: string[]
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
  /** 知识条目模板 */
  knowledgeTemplates: KnowledgeTemplate[]
  /** 偏好模板 */
  preferenceTemplates: PreferenceTemplate[]
  /** 蒸馏策略 */
  distillationStrategy?: {
    systemPrompt: string
    outputFormat: string
  }
}

/** 知识条目模板 */
export interface KnowledgeTemplate {
  type: string
  title: string
  content: string
  /** 提示用户填充的占位符 */
  placeholders: string[]
}

/** 偏好模板 */
export interface PreferenceTemplate {
  subject: string
  value: string
  source: string
  /** 提示用户填充的占位符 */
  placeholders: string[]
}

/** 模板列表项（用于展示） */
export interface TemplateListItem {
  id: string
  name: string
  description: string
  author: string
  category: string
  tags: string[]
  downloads: number
  knowledgeCount: number
  preferenceCount: number
}

/** 内置模板 */
const BUILTIN_TEMPLATES: MemoryTemplate[] = [
  {
    id: 'builtin_developer',
    name: '开发者知识包',
    description: '适合软件工程师的知识管理模板，包含技术决策、Bug 修复记录、架构模式等',
    author: 'Memora',
    version: '1.0.0',
    category: '开发',
    tags: ['编程', '技术', '工程师'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    knowledgeTemplates: [
      {
        type: 'knowledge',
        title: '技术决策：{topic}',
        content: '## 背景\n{background}\n\n## 方案对比\n{options}\n\n## 最终决策\n{decision}\n\n## 理由\n{rationale}',
        placeholders: ['topic', 'background', 'options', 'decision', 'rationale']
      },
      {
        type: 'task',
        title: 'Bug 修复：{bug}',
        content: '## 问题描述\n{description}\n\n## 根因\n{rootCause}\n\n## 修复方案\n{fix}\n\n## 验证结果\n{verification}',
        placeholders: ['bug', 'description', 'rootCause', 'fix', 'verification']
      },
      {
        type: 'decision',
        title: '架构决策：{component}',
        content: '## 上下文\n{context}\n\n## 决定\n{decision}\n\n## 后果\n{consequences}',
        placeholders: ['component', 'context', 'decision', 'consequences']
      }
    ],
    preferenceTemplates: [
      {
        subject: '代码风格',
        value: '偏好 {style} 风格，{detail}',
        source: 'manual',
        placeholders: ['style', 'detail']
      },
      {
        subject: '技术栈偏好',
        value: '首选 {tech}，{reason}',
        source: 'manual',
        placeholders: ['tech', 'reason']
      }
    ]
  },
  {
    id: 'builtin_researcher',
    name: '研究者知识包',
    description: '适合学术研究者的知识管理模板，包含论文笔记、研究假设、实验记录等',
    author: 'Memora',
    version: '1.0.0',
    category: '学术',
    tags: ['研究', '学术', '论文'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    knowledgeTemplates: [
      {
        type: 'knowledge',
        title: '论文笔记：{paper}',
        content: '## 论文信息\n{paperInfo}\n\n## 核心观点\n{keyPoints}\n\n## 方法\n{method}\n\n## 启发\n{inspiration}',
        placeholders: ['paper', 'paperInfo', 'keyPoints', 'method', 'inspiration']
      },
      {
        type: 'task',
        title: '实验记录：{experiment}',
        content: '## 目的\n{purpose}\n\n## 方法\n{method}\n\n## 结果\n{results}\n\n## 结论\n{conclusion}',
        placeholders: ['experiment', 'purpose', 'method', 'results', 'conclusion']
      }
    ],
    preferenceTemplates: [
      {
        subject: '研究方向',
        value: '重点研究 {field}，尤其关注 {subfield}',
        source: 'manual',
        placeholders: ['field', 'subfield']
      }
    ]
  },
  {
    id: 'builtin_product_manager',
    name: '产品经理知识包',
    description: '适合产品经理的知识管理模板，包含需求分析、用户反馈、竞品分析等',
    author: 'Memora',
    version: '1.0.0',
    category: '产品',
    tags: ['产品', '管理', '需求'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    knowledgeTemplates: [
      {
        type: 'knowledge',
        title: '需求分析：{feature}',
        content: '## 用户故事\n{userStory}\n\n## 验收标准\n{acceptance}\n\n## 优先级\n{priority}\n\n## 依赖\n{dependencies}',
        placeholders: ['feature', 'userStory', 'acceptance', 'priority', 'dependencies']
      },
      {
        type: 'decision',
        title: '产品决策：{topic}',
        content: '## 背景\n{background}\n\n## 数据依据\n{data}\n\n## 决定\n{decision}',
        placeholders: ['topic', 'background', 'data', 'decision']
      }
    ],
    preferenceTemplates: [
      {
        subject: '用户沟通风格',
        value: '偏好 {style} 沟通方式，{detail}',
        source: 'manual',
        placeholders: ['style', 'detail']
      }
    ]
  }
]

/** 获取所有可用模板 */
export function listTemplates(): TemplateListItem[] {
  return BUILTIN_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    author: t.author,
    category: t.category,
    tags: t.tags,
    downloads: 0,
    knowledgeCount: t.knowledgeTemplates.length,
    preferenceCount: t.preferenceTemplates.length
  }))
}

/** 获取模板详情 */
export function getTemplate(id: string): MemoryTemplate | null {
  return BUILTIN_TEMPLATES.find(t => t.id === id) ?? null
}

/** 导出模板为 JSON */
export function exportTemplate(template: MemoryTemplate): string {
  return JSON.stringify(template, null, 2)
}

/** 导入模板 */
export function importTemplate(json: string): { success: boolean; template?: MemoryTemplate; error?: string } {
  try {
    const template = JSON.parse(json) as MemoryTemplate
    if (!template.name || !template.knowledgeTemplates) {
      return { success: false, error: '无效的模板格式：缺少必要字段' }
    }
    template.id = `imported_${Date.now()}`
    template.createdAt = new Date().toISOString()
    template.updatedAt = new Date().toISOString()
    return { success: true, template }
  } catch (e) {
    return { success: false, error: `模板解析失败: ${String(e)}` }
  }
}

/** 按分类过滤模板 */
export function filterByCategory(
  templates: TemplateListItem[],
  category: string
): TemplateListItem[] {
  if (!category) return templates
  return templates.filter(t => t.category === category)
}

/** 按标签搜索模板 */
export function searchTemplates(
  templates: TemplateListItem[],
  query: string
): TemplateListItem[] {
  if (!query) return templates
  const q = query.toLowerCase()
  return templates.filter(
    t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
  )
}