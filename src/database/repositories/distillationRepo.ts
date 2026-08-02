import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../connection'
import { buildUpdateSets } from './sqlHelpers'
import type { DistillationTemplate, DistillationOutputFormat } from '@shared/types'

interface DistillationTemplateRow {
  id: string
  name: string
  description: string | null
  system_prompt: string
  output_format: string
  is_builtin: number
  created_at: string
  updated_at: string
}

function rowToTemplate(row: DistillationTemplateRow): DistillationTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    systemPrompt: row.system_prompt,
    outputFormat: (row.output_format as DistillationOutputFormat) ?? 'json',
    isBuiltin: row.is_builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 校验 output_format 合法性，非法值降级为 'json' */
function normalizeOutputFormat(v: unknown): DistillationOutputFormat {
  return v === 'markdown' || v === 'text' ? v : 'json'
}

/** 列出全部蒸馏模板（内置在前，自定义在后） */
export function listDistillationTemplates(): DistillationTemplate[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM distillation_templates
       ORDER BY is_builtin DESC, created_at ASC`
    )
    .all() as DistillationTemplateRow[]
  return rows.map(rowToTemplate)
}

/** 获取单个模板 */
export function getDistillationTemplate(id: string): DistillationTemplate | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM distillation_templates WHERE id = ?')
    .get(id) as DistillationTemplateRow | undefined
  return row ? rowToTemplate(row) : null
}

/** 创建自定义模板 */
export function createDistillationTemplate(input: {
  name: string
  description?: string
  systemPrompt: string
  outputFormat?: string
}): DistillationTemplate {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO distillation_templates
     (id, name, description, system_prompt, output_format, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.name,
    input.description ?? null,
    input.systemPrompt,
    normalizeOutputFormat(input.outputFormat),
    now,
    now
  )

  return getDistillationTemplate(id)!
}

/** 更新模板（内置模板允许编辑 name/description/systemPrompt/outputFormat，但不改变 is_builtin） */
export function updateDistillationTemplate(
  id: string,
  patch: Partial<Pick<DistillationTemplate, 'name' | 'description' | 'systemPrompt' | 'outputFormat'>>
): DistillationTemplate | null {
  const db = getDatabase()
  const { sets, params } = buildUpdateSets(patch, {
    name: 'name',
    description: 'description',
    systemPrompt: 'system_prompt',
    outputFormat: 'output_format'
  })
  if (sets.length === 0) return getDistillationTemplate(id)

  // outputFormat 走 normalize，避免非法值
  if ('outputFormat' in params) {
    params.output_format = normalizeOutputFormat(params.output_format)
  }

  sets.push('updated_at = @nowIso')
  db.prepare(`UPDATE distillation_templates SET ${sets.join(', ')} WHERE id = @id`).run({
    ...params,
    id,
    nowIso: new Date().toISOString()
  })

  return getDistillationTemplate(id)
}

/** 删除模板（内置模板禁止删除） */
export function deleteDistillationTemplate(id: string): void {
  const existing = getDistillationTemplate(id)
  if (!existing) return
  if (existing.isBuiltin) {
    throw new Error('内置模板不可删除')
  }
  const db = getDatabase()
  db.prepare('DELETE FROM distillation_templates WHERE id = ?').run(id)
}

/** 获取默认内置模板（builtin-default） */
export function getBuiltinTemplate(): DistillationTemplate {
  const t = getDistillationTemplate('builtin-default')
  if (!t) {
    throw new Error('内置默认模板缺失，请重新初始化数据库')
  }
  return t
}
