import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../src/database/connection', () => ({
  getDatabase: vi.fn()
}))

import { checkDueCapsules } from '../src/capsule/timeCapsule'
import type { TimeCapsule } from '../src/capsule/timeCapsule'

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
