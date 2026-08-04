import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import {
  listDistillationTemplates,
  getDistillationTemplate,
  createDistillationTemplate,
  updateDistillationTemplate,
  deleteDistillationTemplate,
  getBuiltinTemplate
} from '../../../src/database/repositories/distillationRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const templateRow = {
  id: 't1',
  name: 'Template',
  description: 'desc',
  system_prompt: 'prompt',
  output_format: 'json',
  is_builtin: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
}

describe('distillationRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('listDistillationTemplates returns templates', () => {
    stmtResults.set('SELECT * FROM distillation_templates', { all: [templateRow] })
    const list = listDistillationTemplates()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Template')
    expect(list[0].isBuiltin).toBe(false)
  })

  it('getDistillationTemplate returns null when not found', () => {
    expect(getDistillationTemplate('nope')).toBeNull()
  })

  it('getDistillationTemplate returns row when found', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: templateRow })
    expect(getDistillationTemplate('t1')?.name).toBe('Template')
  })

  it('createDistillationTemplate inserts and returns with normalized format', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: { ...templateRow, output_format: 'markdown' } })
    const t = createDistillationTemplate({ name: 'Template', systemPrompt: 'prompt', outputFormat: 'markdown' })
    expect(t.outputFormat).toBe('markdown')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO distillation_templates'))
  })

  it('createDistillationTemplate normalizes invalid format to json', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: { ...templateRow, output_format: 'json' } })
    const t = createDistillationTemplate({ name: 'Template', systemPrompt: 'prompt', outputFormat: 'invalid' })
    expect(t.outputFormat).toBe('json')
  })

  it('updateDistillationTemplate updates and normalizes outputFormat', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: templateRow })
    updateDistillationTemplate('t1', { name: 'Renamed', outputFormat: 'text' })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE distillation_templates'))
  })

  it('updateDistillationTemplate with empty patch returns existing', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: templateRow })
    expect(updateDistillationTemplate('t1', {})?.id).toBe('t1')
  })

  it('deleteDistillationTemplate returns for non-existent template', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: undefined })
    expect(() => deleteDistillationTemplate('nope')).not.toThrow()
  })

  it('deleteDistillationTemplate throws for builtin template', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: { ...templateRow, is_builtin: 1 } })
    expect(() => deleteDistillationTemplate('t1')).toThrowError('内置模板不可删除')
  })

  it('deleteDistillationTemplate deletes a custom template', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: templateRow })
    deleteDistillationTemplate('t1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM distillation_templates WHERE id = ?')
  })

  it('getBuiltinTemplate returns the builtin default template', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: { ...templateRow, id: 'builtin-default', is_builtin: 1 } })
    const t = getBuiltinTemplate()
    expect(t.id).toBe('builtin-default')
  })

  it('getBuiltinTemplate throws when missing', () => {
    stmtResults.set('SELECT * FROM distillation_templates WHERE id = ?', { get: undefined })
    expect(() => getBuiltinTemplate()).toThrowError('内置默认模板缺失')
  })
})