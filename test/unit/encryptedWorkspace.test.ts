import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/database/repositories', () => ({
  createPreference: vi.fn(),
  listPreferences: vi.fn(() => []),
  createEntry: vi.fn(),
  listEntries: vi.fn(() => [])
}))

import {
  encryptSharedWorkspace,
  decryptSharedWorkspace,
  importSharedWorkspace
} from '../../src/sharing/encryptedWorkspace'

const sampleData = {
  workspace: { id: 'ws-1', name: '团队' },
  preferences: [{ id: 'p1', subject: '语言', value: 'TS', confidence: 0.9 } as any],
  constitution: [{ id: 'c1', subject: '规则', value: '简洁', confidence: 0.8 } as any],
  knowledge: [{ id: 'k1', title: '知识', content: '内容' } as any],
  auditLogs: [{ id: 'a1', action: 'create' } as any]
}

describe('encryptedWorkspace', () => {
  it('encrypts then decrypts to the original MMF data', () => {
    const payload = encryptSharedWorkspace(sampleData, 'secret123')
    expect(payload.format).toBe('memora-shared-workspace')
    expect(payload.workspace.id).toBe('ws-1')
    expect(payload.checksum).toBeTruthy()

    const file = decryptSharedWorkspace(payload, 'secret123')
    expect(file.format).toBe('memora-memory-format')
    expect(file.preferences).toHaveLength(1)
    expect(file.constitution).toHaveLength(1)
    expect(file.knowledge).toHaveLength(1)
    expect(file.preferences[0].subject).toBe('语言')
  })

  it('encrypts the content (ciphertext differs from plaintext MMF)', () => {
    const payload = encryptSharedWorkspace(sampleData, 'secret123')
    // 密文不应直接包含明文内容
    expect(payload.package.ciphertext).not.toContain('语言')
    expect(payload.package.ciphertext.length).toBeGreaterThan(0)
  })

  it('throws on wrong password', () => {
    const payload = encryptSharedWorkspace(sampleData, 'secret123')
    expect(() => decryptSharedWorkspace(payload, 'wrongpass')).toThrow()
  })

  it('throws when format is not memora-shared-workspace', () => {
    const payload = encryptSharedWorkspace(sampleData, 'secret123')
    const bad = { ...payload, format: 'other' as any }
    expect(() => decryptSharedWorkspace(bad, 'secret123')).toThrow(/格式/)
  })

  it('throws on checksum mismatch (tampered payload)', () => {
    const payload = encryptSharedWorkspace(sampleData, 'secret123')
    const tampered = { ...payload, checksum: 'deadbeef' }
    expect(() => decryptSharedWorkspace(tampered, 'secret123')).toThrow(/校验和不匹配/)
  })

  it('importSharedWorkspace decrypts and imports into the target workspace', () => {
    const payload = encryptSharedWorkspace(sampleData, 'secret123')
    const result = importSharedWorkspace(payload, 'secret123', 'ws-target')
    expect(result.imported.preferences).toBe(1)
    expect(result.imported.constitution).toBe(1)
    expect(result.imported.knowledge).toBe(1)
  })
})