import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import Module from 'node:module'
import { join } from 'path'
import {
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync,
  readFileSync,
  unlinkSync
} from 'fs'
import { gzipSync } from 'zlib'
import { createCipheriv, pbkdf2Sync, randomBytes } from 'crypto'

/**
 * Backup encryption tests.
 *
 * backup.ts uses Electron's `app`, the database connection, the logger, and an
 * inline `require('better-sqlite3')` for the restore-time integrity check. The
 * vitest node environment cannot load the native better-sqlite3 binding (ABI
 * mismatch), and `vi.mock` does not intercept raw `require()` of external
 * native modules — so we:
 *   - vi.mock electron / connection / logger (ESM imports -> intercepted)
 *   - monkeypatch Module._load to intercept the inline `require('better-sqlite3')`
 */

const PASSWORD = 'correct horse battery staple'

// Constants replicated from backup.ts (not exported) to craft/verify formats.
const ENC_MAGIC = Buffer.from('MEMORA_ENC_V1\n') // 14 bytes
const SALT_LENGTH = 16
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH = 32

// Create the temp userData dir at hoist time so the electron mock (which runs
// before module imports) can return it before BackupService's constructor runs.
const tmpDir = vi.hoisted<string>(() => {
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memora-backup-test-'))
})

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? tmpDir : '')
  }
}))

vi.mock('../src/database/connection', () => ({
  getDatabase: () => ({ pragma: () => {} }),
  closeDatabase: () => {},
  initDatabase: () => ({})
}))

vi.mock('../src/main/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}))

// Intercept the inline `require('better-sqlite3')` inside restoreBackup's
// integrity check so it does not try to load the broken native binding.
const originalLoad = (Module as any)._load
;(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'better-sqlite3') {
    return function MockDatabase(this: any) {
      return {
        pragma: () => [{ integrity_check: 'ok' }],
        close: () => {}
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

import { backupService } from '../src/main/backup'

const dbPath = join(tmpDir, 'memora.db')
const backupDir = join(tmpDir, 'backups')

const ORIGINAL_CONTENT = Buffer.from(
  'Memora backup round-trip payload\n' + 'X'.repeat(1024) + '\0\1\2\3'
)

/** Build a V0 (pre-magic-header) encrypted backup buffer for given content. */
function buildV0Buffer(content: Buffer, password: string): Buffer {
  const salt = randomBytes(SALT_LENGTH)
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(gzipSync(content)), cipher.final()])
  const tag = cipher.getAuthTag()
  // V0 layout: salt(16) + iv(12) + ciphertext + tag(16)  — NO magic header
  return Buffer.concat([salt, iv, ciphertext, tag])
}

beforeEach(() => {
  // Fresh backup dir + db file for each test.
  if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true })
  mkdirSync(backupDir, { recursive: true })
  if (existsSync(dbPath)) unlinkSync(dbPath)
  writeFileSync(dbPath, ORIGINAL_CONTENT)
})

afterAll(() => {
  ;(Module as any)._load = originalLoad
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
})

describe('backup encryption round-trip (V1 format)', () => {
  it('encrypts with the V1 magic header and decrypts back to the original data', async () => {
    backupService.setConfig({ encryptionKey: PASSWORD })

    const entry = await backupService.backupNow()

    // V1 format is selected when an encryption key is configured.
    expect(entry.encrypted).toBe(true)
    expect(entry.filename).toMatch(/\.db\.zip\.enc$/)

    const backupFile = readFileSync(join(backupDir, entry.filename))
    // V1 files begin with the version magic header.
    expect(backupFile.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)).toBe(true)

    // Round-trip: restore should recover the exact original bytes.
    const result = await backupService.restoreBackup(entry.filename, PASSWORD)
    expect(result.restored).toBe(true)

    const restored = readFileSync(dbPath)
    expect(restored.equals(ORIGINAL_CONTENT)).toBe(true)
  })

  it('V1 detection: a file starting with the magic header is read via the V1 path', async () => {
    // This is covered implicitly by the round-trip above (restore detected the
    // magic and succeeded). Here we assert the detection precondition directly:
    // the produced backup's first bytes are exactly ENC_MAGIC, which is what
    // restoreBackup checks to pick the V1 branch.
    backupService.setConfig({ encryptionKey: PASSWORD })
    const entry = await backupService.backupNow()
    const head = readFileSync(join(backupDir, entry.filename), { encoding: null }).subarray(
      0,
      ENC_MAGIC.length
    )

    expect(head.equals(ENC_MAGIC)).toBe(true)
  })
})

describe('backup V0 backward compatibility (no magic header)', () => {
  it('a V0-format encrypted backup (no magic header) can still be restored', async () => {
    const v0Buffer = buildV0Buffer(ORIGINAL_CONTENT, PASSWORD)
    const v0Filename = 'Memora_backup_v0_legacy.db.zip.enc'
    writeFileSync(join(backupDir, v0Filename), v0Buffer)

    // V0 file must NOT start with the magic (that's what makes it V0).
    expect(v0Buffer.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)).toBe(false)

    const result = await backupService.restoreBackup(v0Filename, PASSWORD)
    expect(result.restored).toBe(true)

    const restored = readFileSync(dbPath)
    expect(restored.equals(ORIGINAL_CONTENT)).toBe(true)
  })

  it('V0 and V1 backups restore to identical content for the same source', async () => {
    // Produce a V1 backup of the same content.
    backupService.setConfig({ encryptionKey: PASSWORD })
    const v1Entry = await backupService.backupNow()
    await backupService.restoreBackup(v1Entry.filename, PASSWORD)
    const fromV1 = readFileSync(dbPath)

    // Reset db file, then restore from a hand-crafted V0 backup of the same content.
    writeFileSync(dbPath, ORIGINAL_CONTENT)
    const v0Filename = 'Memora_backup_v0_compare.db.zip.enc'
    writeFileSync(join(backupDir, v0Filename), buildV0Buffer(ORIGINAL_CONTENT, PASSWORD))
    await backupService.restoreBackup(v0Filename, PASSWORD)
    const fromV0 = readFileSync(dbPath)

    expect(fromV0.equals(fromV1)).toBe(true)
    expect(fromV0.equals(ORIGINAL_CONTENT)).toBe(true)
  })
})

describe('backup restore error handling', () => {
  it('rejects an encrypted backup when no password is supplied', async () => {
    backupService.setConfig({ encryptionKey: PASSWORD })
    const entry = await backupService.backupNow()

    await expect(backupService.restoreBackup(entry.filename)).rejects.toThrow(
      /解密密码/
    )
  })

  it('a wrong password fails authentication (GCM auth tag mismatch)', async () => {
    backupService.setConfig({ encryptionKey: PASSWORD })
    const entry = await backupService.backupNow()

    await expect(backupService.restoreBackup(entry.filename, 'wrong-password')).rejects.toThrow()
  })
})
