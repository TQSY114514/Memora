import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import {
  createTag,
  getTag,
  findByName,
  listTags,
  attachTag,
  detachTag,
  deleteTag,
  attachTagByName
} from '../../../src/database/repositories/tagRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))

const tagRow = {
  id: 't1',
  name: 'important',
  color: '#ff0000',
  created_at: '2024-01-01T00:00:00.000Z'
}

describe('tagRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
  })

  it('createTag inserts and returns the created tag', () => {
    stmtResults.set('SELECT * FROM tags WHERE id = ?', { get: tagRow })
    const tag = createTag({ name: 'important', color: '#ff0000' })
    expect(tag).toMatchObject({ id: 't1', name: 'important', color: '#ff0000' })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tags'))
  })

  it('createTag handles missing color', () => {
    stmtResults.set('SELECT * FROM tags WHERE id = ?', { get: { ...tagRow, color: null } })
    const tag = createTag({ name: 'x' })
    expect(tag.color).toBeUndefined()
  })

  it('getTag returns null when not found', () => {
    expect(getTag('nope')).toBeNull()
  })

  it('getTag returns the row when found', () => {
    stmtResults.set('SELECT * FROM tags WHERE id = ?', { get: tagRow })
    expect(getTag('t1')?.name).toBe('important')
  })

  it('findByName returns null when not found', () => {
    expect(findByName('x')).toBeNull()
  })

  it('findByName returns the tag when found', () => {
    stmtResults.set('SELECT * FROM tags WHERE name = ?', { get: tagRow })
    expect(findByName('important')?.id).toBe('t1')
  })

  it('listTags maps rows', () => {
    stmtResults.set('SELECT * FROM tags ORDER BY name', { all: [tagRow] })
    expect(listTags()).toHaveLength(1)
  })

  it('attachTag runs INSERT OR IGNORE', () => {
    attachTag('s1', 't1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO session_tags'))
  })

  it('detachTag runs DELETE', () => {
    detachTag('s1', 't1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM session_tags'))
  })

  it('deleteTag runs DELETE FROM tags', () => {
    deleteTag('t1')
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM tags WHERE id = ?')
  })

  it('attachTagByName uses existing tag when found', () => {
    stmtResults.set('SELECT * FROM tags WHERE name = ?', { get: tagRow })
    const tag = attachTagByName('s1', 'important')
    expect(tag.id).toBe('t1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO session_tags'))
  })

  it('attachTagByName creates a new tag when not found', () => {
    stmtResults.set('SELECT * FROM tags WHERE name = ?', { get: undefined })
    stmtResults.set('SELECT * FROM tags WHERE id = ?', { get: tagRow })
    const tag = attachTagByName('s1', 'important')
    expect(tag.id).toBe('t1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tags'))
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO session_tags'))
  })
})