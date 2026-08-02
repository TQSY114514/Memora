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

import { getDatabase } from '../src/database/connection'
import { generateIdentityProfile } from '../src/identity/identityProfile'

/** 构造一个 mock db：prepare().all() 返回空数组，.get() 返回 undefined */
function makeMockDb() {
  const stmt = {
    all: vi.fn(() => []),
    get: vi.fn(() => undefined)
  }
  return {
    prepare: vi.fn(() => stmt),
    _stmt: stmt
  }
}

describe('identityProfile.generateIdentityProfile', () => {
  it('returns correct profile structure when the database is empty', () => {
    const mockDb = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const profile = generateIdentityProfile()

    // generatedAt 是合法 ISO 字符串
    expect(typeof profile.generatedAt).toBe('string')
    expect(new Date(profile.generatedAt).toString()).not.toBe('Invalid Date')

    // basics 包含 role/techStack/editors/languages 数组
    expect(Array.isArray(profile.basics.role)).toBe(true)
    expect(Array.isArray(profile.basics.techStack)).toBe(true)
    expect(Array.isArray(profile.basics.editors)).toBe(true)
    expect(Array.isArray(profile.basics.languages)).toBe(true)

    // communication 包含 style/format/avoid 数组
    expect(Array.isArray(profile.communication.style)).toBe(true)
    expect(Array.isArray(profile.communication.format)).toBe(true)
    expect(Array.isArray(profile.communication.avoid)).toBe(true)

    // projects 是数组
    expect(Array.isArray(profile.projects)).toBe(true)

    // stats 全部归零（空库）
    expect(profile.stats.totalSessions).toBe(0)
    expect(profile.stats.totalMessages).toBe(0)
    expect(profile.stats.totalPreferences).toBe(0)
    expect(profile.stats.totalKnowledge).toBe(0)
    expect(profile.stats.activeSince).toBeNull()
    expect(Array.isArray(profile.stats.topProviders)).toBe(true)
    expect(profile.stats.topProviders).toHaveLength(0)
  })

  it('promptText contains the "# My AI Identity Profile" header', () => {
    const mockDb = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    const profile = generateIdentityProfile()
    expect(profile.promptText).toContain('# My AI Identity Profile')
  })

  it('does not import the real database connection (uses mocked getDatabase)', () => {
    const mockDb = makeMockDb()
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    generateIdentityProfile()
    // mock 的 db.prepare 至少被调用过一次
    expect(mockDb.prepare).toHaveBeenCalled()
  })
})
