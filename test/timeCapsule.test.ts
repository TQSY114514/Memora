import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../src/database/connection', () => ({
  getDatabase: vi.fn()
}))

import { getDatabase } from '../src/database/connection'
import { checkDueCapsules, createTimeCapsule, unlockCapsule } from '../src/capsule/timeCapsule'
import type { TimeCapsule } from '../src/capsule/timeCapsule'

function makeMockDb() {
  const entryRows = [
    { id: 'e1', title: '知识A', type: 'knowledge', content: '内容A' }
  ]
  const prefRows = [
    { id: 'p1', subject: '语言', value: 'TS' }
  ]
  const db = {
    prepare: vi.fn((sql: string) => {
      const ret = {
        all: vi.fn(() => []),
        get: vi.fn(() => ({ count: 0 }))
      }
      if (sql.includes('FROM knowledge_entries WHERE id IN')) {
        ret.all = vi.fn(() => entryRows)
        // Also need get for COUNT query that can match this prefix
        ret.get = vi.fn(() => ({ count: 1 }))
      } else if (sql.includes('FROM preferences WHERE id IN')) {
        ret.all = vi.fn(() => prefRows)
        // Also need get for COUNT query that can match this prefix
        ret.get = vi.fn(() => ({ count: 1 }))
      } else if (sql.includes('COUNT(*) as count FROM knowledge_entries')) {
        ret.get = vi.fn(() => ({ count: 1 }))
      } else if (sql.includes('COUNT(*) as count FROM preferences')) {
        ret.get = vi.fn(() => ({ count: 1 }))
      } else if (sql.includes('COUNT(*)')) {
        ret.get = vi.fn(() => ({ count: 0 }))
      }
      return ret
    })
  }
  return db
}

function makeCapsule(overrides: Partial<TimeCapsule> = {}): TimeCapsule {
  return {
    id: 'cap-1',
    name: 'test',
    description: '',
    sealedAt: '2026-01-01T00:00:00.000Z',
    unlockAt: '2030-01-01T00:00:00.000Z',
    unlocked: false,
    unlockedAt: null,
    encryptedData: {
      ciphertext: 'x',
      iv: 'x',
      authTag: 'x',
      salt: 'x',
      encryptedAt: '2026-01-01T00:00:00.000Z'
    },
    summary: 's',
    entryCount: 0,
    ...overrides
  }
}

describe('timeCapsule.checkDueCapsules', () => {
  it('returns only locked capsules whose unlockAt has passed', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const future = new Date(Date.now() + 24 * 3600_000).toISOString()
    const due = makeCapsule({ id: 'due', unlockAt: past })
    const notDue = makeCapsule({ id: 'future', unlockAt: future })
    const alreadyUnlocked = makeCapsule({ id: 'open', unlockAt: past, unlocked: true, unlockedAt: past })
    const result = checkDueCapsules([due, notDue, alreadyUnlocked])
    expect(result.map((c) => c.id)).toEqual(['due'])
  })

  it('returns empty for an empty list', () => {
    expect(checkDueCapsules([])).toEqual([])
  })
})

describe('timeCapsule.createTimeCapsule', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a capsule with encrypted data and summary', () => {
    const db = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)

    const capsule = createTimeCapsule({
      name: '我的胶囊',
      description: '描述',
      unlockAt: '2030-01-01T00:00:00.000Z',
      password: 'secret123',
      entryIds: ['e1'],
      preferenceIds: ['p1']
    })

    expect(capsule.id.startsWith('capsule_')).toBe(true)
    expect(capsule.name).toBe('我的胶囊')
    expect(capsule.description).toBe('描述')
    expect(capsule.unlocked).toBe(false)
    expect(capsule.unlockedAt).toBeNull()
    expect(capsule.entryCount).toBe(2)
    expect(capsule.summary).toBe('1 条知识, 1 条偏好')
    // 密文存在且非空
    expect(capsule.encryptedData.ciphertext.length).toBeGreaterThan(0)
  })

  it('creates empty capsule when no ids provided', () => {
    const db = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)

    const capsule = createTimeCapsule({
      name: '空胶囊',
      unlockAt: '2030-01-01T00:00:00.000Z',
      password: 'secret',
      entryIds: [],
      preferenceIds: []
    })
    expect(capsule.entryCount).toBe(0)
    expect(capsule.summary).toBe('0 条知识, 0 条偏好')
  })
})

describe('timeCapsule.unlockCapsule', () => {
  it('unlocks with correct password and builds report', () => {
    const db = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)

    const capsule = createTimeCapsule({
      name: '测试',
      unlockAt: '2030-01-01T00:00:00.000Z',
      password: 'secret123',
      entryIds: ['e1'],
      preferenceIds: ['p1']
    })

    const result = unlockCapsule(capsule, 'secret123')
    expect(result.success).toBe(true)
    expect(result.data?.capsule.unlocked).toBe(true)
    expect(result.data?.capsule.unlockedAt).toBeTruthy()
    expect(result.data?.sealedEntries).toHaveLength(1)
    expect(result.data?.sealedEntries[0].title).toBe('知识A')
    expect(result.data?.sealedPreferences).toHaveLength(1)
    expect(result.data?.sealedPreferences[0].subject).toBe('语言')
    // 当前仍存在 1 条 → 新增/删除均为 0
    expect(result.data?.newEntries).toBe(0)
    expect(result.data?.deletedEntries).toBe(0)
  })

  it('returns error on wrong password', () => {
    const db = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(db as any)

    const capsule = createTimeCapsule({
      name: '测试',
      unlockAt: '2030-01-01T00:00:00.000Z',
      password: 'secret123',
      entryIds: ['e1'],
      preferenceIds: ['p1']
    })

    const result = unlockCapsule(capsule, 'wrongpass')
    expect(result.success).toBe(false)
    expect(result.error).toBe('密码错误或数据损坏')
  })
})
