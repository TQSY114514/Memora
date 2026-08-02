import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { getDefaultSyncConfig } from '../src/sync/cloudSync'

describe('cloudSync.getDefaultSyncConfig', () => {
  it('returns safe defaults (sync disabled, no credentials persisted)', () => {
    const cfg = getDefaultSyncConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.protocol).toBe('webdav')
    expect(cfg.intervalMinutes).toBe(30)
    expect(cfg.lastSyncAt).toBeNull()
    expect(cfg.endpoint).toBe('')
    expect(cfg.username).toBeUndefined()
    expect(cfg.password).toBeUndefined()
    expect(cfg.encryptionPassword).toBeUndefined()
  })

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = getDefaultSyncConfig()
    const b = getDefaultSyncConfig()
    a.intervalMinutes = 5
    expect(b.intervalMinutes).toBe(30)
  })
})
