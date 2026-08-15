import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import {
  upsertEmbedding,
  upsertEmbeddings,
  deleteSessionEmbeddings,
  deleteEmbeddingByMessage,
  hasSessionEmbeddings,
  countSessionEmbeddings,
  getSessionEmbeddings,
  getAllEmbeddings,
  getMessagesWithoutEmbeddings
} from '../../../src/database/repositories/embeddingRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const validFloat32 = Buffer.from(new Float32Array([1, 2, 3]).buffer)

describe('embeddingRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('upsertEmbedding inserts a new embedding', () => {
    stmtResults.set('SELECT id FROM message_embeddings WHERE message_id = ?', { get: undefined })
    upsertEmbedding('m1', 's1', [1, 2, 3], 'model')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO message_embeddings'))
  })

  it('upsertEmbedding updates an existing embedding', () => {
    stmtResults.set('SELECT id FROM message_embeddings WHERE message_id = ?', { get: { id: 'e1' } })
    upsertEmbedding('m1', 's1', [1, 2, 3], 'model')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE message_embeddings'))
  })

  it('upsertEmbedding throws on zero dimension', () => {
    expect(() => upsertEmbedding('m1', 's1', [], 'model')).toThrowError(/Invalid embedding dimension/)
  })

  it('upsertEmbedding throws on dimension above 8192', () => {
    expect(() => upsertEmbedding('m1', 's1', new Array(8193).fill(0), 'model')).toThrowError(/Invalid embedding dimension/)
  })

  it('upsertEmbeddings runs in a transaction', () => {
    stmtResults.set('SELECT id FROM message_embeddings WHERE message_id = ?', { get: undefined })
    upsertEmbeddings([
      { messageId: 'm1', sessionId: 's1', embedding: [1], model: 'm' },
      { messageId: 'm2', sessionId: 's1', embedding: [2], model: 'm' }
    ])
    expect(db.transaction).toHaveBeenCalled()
  })

  it('upsertEmbeddings uses a single ON CONFLICT upsert statement', () => {
    upsertEmbeddings([{ messageId: 'm1', sessionId: 's1', embedding: [1], model: 'm' }])
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(message_id) DO UPDATE'))
  })

  it('deleteSessionEmbeddings runs a DELETE', () => {
    deleteSessionEmbeddings('s1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM message_embeddings WHERE session_id = ?')
  })

  it('deleteEmbeddingByMessage runs a DELETE', () => {
    deleteEmbeddingByMessage('m1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM message_embeddings WHERE message_id = ?')
  })

  it('hasSessionEmbeddings returns true when a row exists', () => {
    stmtResults.set('SELECT 1 FROM message_embeddings WHERE session_id = ?', { get: { 1: 1 } })
    expect(hasSessionEmbeddings('s1')).toBe(true)
  })

  it('hasSessionEmbeddings returns false when no row', () => {
    stmtResults.set('SELECT 1 FROM message_embeddings WHERE session_id = ?', { get: undefined })
    expect(hasSessionEmbeddings('s1')).toBe(false)
  })

  it('countSessionEmbeddings returns n', () => {
    stmtResults.set('SELECT COUNT(*) AS n FROM message_embeddings WHERE session_id = ?', { get: { n: 3 } })
    expect(countSessionEmbeddings('s1')).toBe(3)
  })

  it('countSessionEmbeddings returns 0 when undefined', () => {
    stmtResults.set('SELECT COUNT(*) AS n FROM message_embeddings WHERE session_id = ?', { get: undefined })
    expect(countSessionEmbeddings('s1')).toBe(0)
  })

  it('getSessionEmbeddings converts valid float32 buffer to numbers', () => {
    stmtResults.set('SELECT * FROM message_embeddings WHERE session_id = ?', {
      all: [{ message_id: 'm1', session_id: 's1', embedding: validFloat32, model: 'm', dim: 3, created_at: 'x', id: 'e1' }]
    })
    const rows = getSessionEmbeddings('s1')
    expect(rows[0].embedding).toEqual([1, 2, 3])
    expect(rows[0].messageId).toBe('m1')
  })

  it('bufferToNumbers returns [] for empty buffer', () => {
    stmtResults.set('SELECT * FROM message_embeddings WHERE session_id = ?', {
      all: [{ message_id: 'm1', session_id: 's1', embedding: Buffer.alloc(0), model: 'm', dim: 0, created_at: 'x', id: 'e1' }]
    })
    expect(getSessionEmbeddings('s1')[0].embedding).toEqual([])
  })

  it('bufferToNumbers returns [] for non-multiple-of-4 buffer', () => {
    stmtResults.set('SELECT * FROM message_embeddings WHERE session_id = ?', {
      all: [{ message_id: 'm1', session_id: 's1', embedding: Buffer.alloc(6), model: 'm', dim: 0, created_at: 'x', id: 'e1' }]
    })
    expect(getSessionEmbeddings('s1')[0].embedding).toEqual([])
  })

  it('getAllEmbeddings maps all rows (embedding as zero-copy Float32Array)', () => {
    stmtResults.set('SELECT * FROM message_embeddings', {
      all: [{ message_id: 'm1', session_id: 's1', embedding: validFloat32, model: 'm', dim: 3, created_at: 'x', id: 'e1' }]
    })
    const rows = getAllEmbeddings()
    expect(rows).toHaveLength(1)
    expect(rows[0].sessionId).toBe('s1')
    expect(rows[0].embedding).toBeInstanceOf(Float32Array)
    expect(Array.from(rows[0].embedding)).toEqual([1, 2, 3])
  })

  it('getMessagesWithoutEmbeddings maps messages without embeddings', () => {
    stmtResults.set('LEFT JOIN message_embeddings e ON e.message_id = m.id', {
      all: [{ id: 'm1', session_id: 's1', role: 'user', content: 'hi', model: 'm', msg_order: 0, created_at: 'x' }]
    })
    const msgs = getMessagesWithoutEmbeddings('s1')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toBe('hi')
  })
})