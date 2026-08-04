import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import { addAuditLog } from '../../../src/database/repositories/auditRepo'
import { rollbackEntity } from '../../../src/database/repositories/rollbackRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))
vi.mock('../../../src/database/repositories/auditRepo', () => ({ addAuditLog: vi.fn() }))

describe('rollbackRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('returns failure when audit log not found', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', { get: undefined })
    const result = rollbackEntity('preference', 'missing')
    expect(result.success).toBe(false)
    expect(result.message).toContain('未找到目标审计日志')
  })

  it('returns failure when entity type mismatch', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', {
      get: { id: 'a1', entity_type: 'knowledge', entity_id: 'e1', before_value: '{}', after_value: null, action: 'update' }
    })
    const result = rollbackEntity('preference', 'a1')
    expect(result.success).toBe(false)
    expect(result.message).toContain('实体类型不匹配')
  })

  it('returns failure when no beforeValue', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', {
      get: { id: 'a1', entity_type: 'preference', entity_id: 'p1', before_value: null, after_value: null, action: 'create' }
    })
    const result = rollbackEntity('preference', 'a1')
    expect(result.success).toBe(false)
    expect(result.message).toContain('没有 beforeValue')
  })

  it('returns failure when beforeValue JSON parse fails', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', {
      get: { id: 'a1', entity_type: 'preference', entity_id: 'p1', before_value: '{bad', after_value: null, action: 'update' }
    })
    const result = rollbackEntity('preference', 'a1')
    expect(result.success).toBe(false)
    expect(result.message).toContain('JSON 解析失败')
  })

  it('rolls back a preference successfully', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', {
      get: {
        id: 'a1',
        entity_type: 'preference',
        entity_id: 'p1',
        before_value: '{"value":"new","confidence":0.9,"status":"active","subject":"lang","context":"web"}',
        after_value: null,
        action: 'update'
      }
    })
    stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: { id: 'p1', value: 'old' } })
    const result = rollbackEntity('preference', 'a1')
    expect(result.success).toBe(true)
    expect(result.entityId).toBe('p1')
    expect(addAuditLog).toHaveBeenCalled()
  })

  it('rolls back a knowledge entry successfully', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', {
      get: {
        id: 'a1',
        entity_type: 'knowledge',
        entity_id: 'e1',
        before_value: '{"title":"t","content":"c","type":"knowledge","status":"active","sort_order":1}',
        after_value: null,
        action: 'update'
      }
    })
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: { id: 'e1', title: 'old' } })
    const result = rollbackEntity('knowledge', 'a1')
    expect(result.success).toBe(true)
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE knowledge_entries'))
  })

  it('rolls back a session successfully', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', {
      get: {
        id: 'a1',
        entity_type: 'session',
        entity_id: 's1',
        before_value: '{"title":"t","description":"d","is_favorite":1}',
        after_value: null,
        action: 'update'
      }
    })
    stmtResults.set('SELECT * FROM chat_sessions WHERE id = ?', { get: { id: 's1', title: 'old' } })
    const result = rollbackEntity('session', 'a1')
    expect(result.success).toBe(true)
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE chat_sessions'))
  })

  it('returns failure when the update throws', () => {
    stmtResults.set('SELECT * FROM audit_logs WHERE id = ?', {
      get: {
        id: 'a1',
        entity_type: 'preference',
        entity_id: 'p1',
        before_value: '{"value":"new"}',
        after_value: null,
        action: 'update'
      }
    })
    stmtResults.set('SELECT * FROM preferences WHERE id = ?', { get: { id: 'p1', value: 'old' } })
    stmtResults.set('UPDATE preferences', { run: () => { throw new Error('update failed') } })
    const result = rollbackEntity('preference', 'a1')
    expect(result.success).toBe(false)
    expect(result.message).toContain('回滚失败')
  })
})