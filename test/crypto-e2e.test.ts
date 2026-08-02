import { describe, it, expect } from 'vitest'
import {
  encrypt,
  decrypt,
  verifyPassword,
  generateSalt,
  generateDeviceId,
  sha256,
  deriveKey
} from '../src/crypto/e2e'

describe('crypto/e2e (E2EE foundation for cloud sync + time capsules)', () => {
  it('encrypt/decrypt round-trips UTF-8 data (incl. CJK)', () => {
    const payload = JSON.stringify({ memory: '记忆同步测试', nested: { n: 42 }, arr: [1, 2, 3] })
    const pkg = encrypt(payload, 'correct horse battery staple')
    expect(decrypt(pkg, 'correct horse battery staple')).toBe(payload)
  })

  it('produces a fresh salt + IV per encryption (unique packages)', () => {
    const a = encrypt('same data', 'pw')
    const b = encrypt('same data', 'pw')
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(decrypt(a, 'pw')).toBe(decrypt(b, 'pw'))
  })

  it('rejects a wrong password', () => {
    const pkg = encrypt('secret', 'right-password')
    expect(verifyPassword(pkg, 'right-password')).toBe(true)
    expect(verifyPassword(pkg, 'wrong-password')).toBe(false)
    expect(() => decrypt(pkg, 'wrong-password')).toThrow()
  })

  it('detects tampered ciphertext via GCM auth tag', () => {
    const pkg = encrypt('integrity matters', 'pw')
    const tampered = { ...pkg, ciphertext: Buffer.from(pkg.ciphertext, 'base64').map((b) => b ^ 0xff).toString('base64') }
    expect(verifyPassword(tampered, 'pw')).toBe(false)
    expect(() => decrypt(tampered, 'pw')).toThrow()
  })

  it('detects tampered IV / authTag', () => {
    const pkg = encrypt('data', 'pw')
    const badIv = Buffer.from(pkg.iv, 'base64').map((b) => b ^ 1).toString('base64')
    expect(() => decrypt({ ...pkg, iv: badIv }, 'pw')).toThrow()
    const badTag = Buffer.from(pkg.authTag, 'base64').map((b) => b ^ 1).toString('base64')
    expect(() => decrypt({ ...pkg, authTag: badTag }, 'pw')).toThrow()
  })

  it('sha256 is stable and content-sensitive', () => {
    expect(sha256('hello')).toBe(sha256('hello'))
    expect(sha256('hello')).not.toBe(sha256('hello!'))
    expect(sha256('')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates valid device ids and salts', () => {
    expect(generateDeviceId()).toMatch(/^[0-9a-f]{32}$/)
    expect(generateDeviceId()).not.toBe(generateDeviceId())
    expect(generateSalt().length).toBe(32)
  })

  it('deriveKey is deterministic for the same salt', () => {
    const salt = generateSalt()
    expect(deriveKey('pw', salt).toString('hex')).toBe(deriveKey('pw', salt).toString('hex'))
    expect(deriveKey('pw', salt).toString('hex')).not.toBe(deriveKey('pw2', salt).toString('hex'))
  })
})
