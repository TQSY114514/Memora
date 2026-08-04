import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDatabase } from '../../../src/database/connection'
import { makeDb } from './dbMock'
import { buildFtsQuery } from '../../../src/search/query'
import {
  createEntry,
  getEntry,
  listEntries,
  countEntries,
  updateEntry,
  toggleTask,
  deleteEntry,
  searchEntries,
  findRelatedEntries,
  addRelation,
  removeRelation,
  listRelations,
  getGraphData
} from '../../../src/database/repositories/knowledgeRepo'

vi.mock('../../../src/database/connection', () => ({ getDatabase: vi.fn() }))
vi.mock('@search/segmenter', () => ({ segment: vi.fn((s: string) => s) }))
vi.mock('../../../src/search/query', () => ({ buildFtsQuery: vi.fn((q: string) => q) }))

const entryRow = {
  id: 'e1',
  workspace_id: 'ws1',
  session_id: 's1',
  type: 'knowledge',
  title: 'React',
  content: 'A library',
  status: 'active',
  source: 'manual',
  sort_order: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
}

describe('knowledgeRepo', () => {
  let db: ReturnType<typeof makeDb>['db']
  let stmtResults: ReturnType<typeof makeDb>['stmtResults']

  beforeEach(() => {
    vi.restoreAllMocks()
    const m = makeDb()
    db = m.db
    stmtResults = m.stmtResults
    vi.mocked(getDatabase).mockReturnValue(db as any)
    vi.mocked(buildFtsQuery).mockImplementation((q: string) => q)
  })

  it('createEntry inserts and returns a knowledge entry', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: entryRow })
    const entry = createEntry({ workspaceId: 'ws1', sessionId: 's1', type: 'knowledge', title: 'React', content: 'A library' })
    expect(entry).toMatchObject({ id: 'e1', type: 'knowledge', status: 'active' })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO knowledge_entries'))
  })

  it('createEntry defaults task status to open', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', {
      get: { ...entryRow, type: 'task', status: 'open' }
    })
    const entry = createEntry({ workspaceId: 'ws1', type: 'task', title: 'Todo' })
    expect(entry.status).toBe('open')
  })

  it('getEntry returns null when not found', () => {
    expect(getEntry('nope')).toBeNull()
  })

  it('getEntry returns row when found', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: entryRow })
    expect(getEntry('e1')?.title).toBe('React')
  })

  it('listEntries without filters returns all', () => {
    stmtResults.set('ORDER BY type ASC, sort_order ASC, created_at DESC', { all: [entryRow] })
    expect(listEntries()).toHaveLength(1)
  })

  it('listEntries with filters builds conditions', () => {
    stmtResults.set('WHERE workspace_id = @workspaceId', { all: [entryRow] })
    const list = listEntries({ workspaceId: 'ws1', type: 'knowledge', sessionId: 's1', status: 'active' })
    expect(list).toHaveLength(1)
    const arg = db.prepare.mock.calls.find((c: any[]) => String(c[0]).includes('WHERE workspace_id = @workspaceId'))![0]
    expect(String(arg)).toContain('type = @type')
    expect(String(arg)).toContain('session_id = @sessionId')
    expect(String(arg)).toContain('status = @status')
  })

  it('countEntries returns aggregated counts', () => {
    stmtResults.set("type = 'task' AND status = 'open'", { get: { n: 2 } })
    stmtResults.set("type = 'task'", { get: { n: 5 } })
    stmtResults.set("type = 'knowledge'", { get: { n: 3 } })
    stmtResults.set("type = 'decision'", { get: { n: 1 } })
    stmtResults.set('SELECT COUNT(*) as n FROM knowledge_entries WHERE workspace_id = ?', { get: { n: 11 } })
    expect(countEntries('ws1')).toEqual({ total: 11, knowledge: 3, decision: 1, task: 5, openTask: 2 })
  })

  it('updateEntry with title/content rebuilds FTS index', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: entryRow })
    updateEntry('e1', { title: 'Renamed', content: 'new' })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE knowledge_entries'))
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO knowledge_fts'))
  })

  it('updateEntry with only status does not rebuild FTS', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: entryRow })
    updateEntry('e1', { status: 'done' })
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE knowledge_entries'))
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO knowledge_fts'))
  })

  it('updateEntry with empty patch returns existing entry', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: entryRow })
    expect(updateEntry('e1', {})?.id).toBe('e1')
  })

  it('toggleTask flips open to done', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: { ...entryRow, status: 'done' } })
    const updated = toggleTask('e1')
    expect(updated?.status).toBe('done')
  })

  it('toggleTask flips done to open', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: { ...entryRow, status: 'open' } })
    expect(toggleTask('e1')?.status).toBe('open')
  })

  it('toggleTask returns null when entry not found', () => {
    expect(toggleTask('nope')).toBeNull()
  })

  it('deleteEntry unindexes and deletes in a transaction', () => {
    deleteEntry('e1')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM knowledge_entries'))
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM knowledge_fts'))
  })

  it('searchEntries returns matching rows', () => {
    stmtResults.set('JOIN knowledge_fts ON ke.id = knowledge_fts.entry_id', { all: [entryRow] })
    const results = searchEntries('react', { workspaceId: 'ws1', type: 'knowledge' })
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('React')
  })

  it('searchEntries returns empty when fts query is empty', () => {
    vi.mocked(buildFtsQuery).mockReturnValueOnce('')
    expect(searchEntries('', {})).toEqual([])
  })

  it('findRelatedEntries returns empty when entry not found', () => {
    expect(findRelatedEntries('nope')).toEqual([])
  })

  it('findRelatedEntries returns related rows', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: entryRow })
    stmtResults.set('SELECT ke.* FROM knowledge_entries ke', { all: [{ ...entryRow, id: 'e2' }] })
    const related = findRelatedEntries('e1')
    expect(related).toHaveLength(1)
    expect(related[0].id).toBe('e2')
  })

  it('findRelatedEntries returns empty when fts query empty', () => {
    stmtResults.set('SELECT * FROM knowledge_entries WHERE id = ?', { get: entryRow })
    vi.mocked(buildFtsQuery).mockReturnValueOnce('')
    expect(findRelatedEntries('e1')).toEqual([])
  })

  it('addRelation runs INSERT OR IGNORE', () => {
    addRelation('a', 'b', 'supports')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO knowledge_relations'))
  })

  it('removeRelation runs DELETE', () => {
    removeRelation('a', 'b', 'supports')
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM knowledge_relations'))
  })

  it('listRelations returns out and incoming', () => {
    stmtResults.set('SELECT from_id, to_id, relation FROM knowledge_relations WHERE from_id = ?', {
      all: [{ from_id: 'a', to_id: 'b', relation: 'supports' }]
    })
    stmtResults.set('SELECT from_id, to_id, relation FROM knowledge_relations WHERE to_id = ?', {
      all: [{ from_id: 'c', to_id: 'a', relation: 'relates-to' }]
    })
    const rels = listRelations('a')
    expect(rels).toHaveLength(2)
    expect(rels[0].fromId).toBe('a')
    expect(rels[1].toId).toBe('a')
  })

  it('getGraphData returns explicit and implicit edges', () => {
    const nodeA = { ...entryRow, id: 'a', sessionId: 's1' }
    const nodeB = { ...entryRow, id: 'b', sessionId: 's1' }
    stmtResults.set('WHERE workspace_id = @workspaceId', { all: [nodeA, nodeB] })
    stmtResults.set('SELECT kr.from_id, kr.to_id, kr.relation FROM knowledge_relations kr', {
      all: [{ from_id: 'a', to_id: 'b', relation: 'supports' }]
    })
    const graph = getGraphData('ws1')
    expect(graph.nodes).toHaveLength(2)
    // explicit edge exists and implicit pair is deduped
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]).toMatchObject({ from: 'a', to: 'b', relation: 'supports', implicit: false })
  })

  it('getGraphData caps implicit edges at 20 for a large session', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => ({
      ...entryRow,
      id: `n${i}`,
      session_id: 's1',
      workspace_id: 'ws1'
    }))
    stmtResults.set('WHERE workspace_id = @workspaceId', { all: nodes })
    stmtResults.set('SELECT kr.from_id, kr.to_id, kr.relation FROM knowledge_relations kr', { all: [] })
    const graph = getGraphData('ws1')
    expect(graph.nodes).toHaveLength(7)
    expect(graph.edges).toHaveLength(20)
    expect(graph.edges.every((e) => e.implicit)).toBe(true)
  })
})