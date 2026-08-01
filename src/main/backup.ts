/**
 * 自动热备份服务（v1.6 + v1.6.1 加密增强）
 *
 * 定时自动压缩 SQLite 数据库文件到备份目录，支持 AES-256-GCM 加密。
 *
 * 备份策略：
 * - 备份目录: {userData}/backups/
 * - 文件命名: Memora_backup_{YYYYMMDD_HHmmss}.db.zip[.enc]
 * - 备份内容: 完整 SQLite 数据库文件（WAL checkpoint → Gzip 压缩 → AES-256-GCM 加密）
 * - 保留数量: 默认 10 份，可配置
 * - 加密: 可选，通过 PBKDF2 从密码派生 AES-256 密钥
 *
 * 恢复流程：
 * - 关闭当前数据库连接 → 解密 → 解压 → 校验完整性 → 替换数据库 → 重新初始化
 */
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, readdirSync, statSync, unlinkSync, copyFileSync, existsSync, openSync, writeSync, closeSync, fstatSync, readSync } from 'fs'
import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { createReadStream, createWriteStream } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto'
import { getDatabase, closeDatabase, initDatabase } from '../database/connection'
import { logger } from './logger'

export interface BackupConfig {
  /** 备份间隔（分钟），默认 60 */
  intervalMinutes: number
  /** 最大保留备份数，默认 10 */
  maxBackups: number
  /** 是否启用自动备份，默认 true */
  enabled: boolean
  /** 加密密码（可选，不设置则不加密备份） */
  encryptionKey?: string
}

export interface BackupEntry {
  filename: string
  size: number
  createdAt: string
  /** 是否加密 */
  encrypted: boolean
}

const AES_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12  // GCM 推荐 12 字节
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 16
const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH = 32  // 256 bits

/** 加密版本标记：用于区分不同加密格式，确保旧备份可兼容 */
const ENC_MAGIC = Buffer.from('MEMORA_ENC_V1\n')  // 14 bytes
const ENC_HEADER_LENGTH = ENC_MAGIC.length + SALT_LENGTH + IV_LENGTH  // 14 + 16 + 12 = 42

/**
 * 从密码派生 AES-256 密钥
 * 使用 PBKDF2-SHA256 + 随机 salt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
}

class BackupService {
  private config: BackupConfig = {
    intervalMinutes: 60,
    maxBackups: 10,
    enabled: true
  }
  private timer: ReturnType<typeof setInterval> | null = null
  private backupDir: string

  constructor() {
    this.backupDir = join(app.getPath('userData'), 'backups')
  }

  private ensureDir(): void {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true })
    }
  }

  private getDbPath(): string {
    return join(app.getPath('userData'), 'memora.db')
  }

  /** 启动定时备份 */
  start(): void {
    if (!this.config.enabled) return
    if (this.timer) return

    this.ensureDir()
    this.timer = setInterval(() => {
      this.backupNow().catch((err) => {
        logger.error('Scheduled backup failed', { error: String(err) })
      })
    }, this.config.intervalMinutes * 60 * 1000)

    logger.info('Auto backup started', {
      intervalMinutes: this.config.intervalMinutes,
      maxBackups: this.config.maxBackups,
      encrypted: !!this.config.encryptionKey
    })
  }

  /** 停止定时备份 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 手动执行一次备份 */
  async backupNow(): Promise<BackupEntry> {
    this.ensureDir()

    const dbPath = this.getDbPath()
    if (!existsSync(dbPath)) {
      throw new Error('数据库文件不存在，无法备份')
    }

    // WAL checkpoint 确保数据落盘
    try {
      const db = getDatabase()
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // 数据库可能未初始化，跳过 checkpoint
    }

    const now = new Date()
    const timestamp = now.toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15)
    const encrypted = !!this.config.encryptionKey
    const suffix = encrypted ? '.db.zip.enc' : '.db.zip'
    const filename = `Memora_backup_${timestamp}${suffix}`
    const zipPath = join(this.backupDir, filename)

    // 压缩数据库文件
    if (encrypted) {
      // 加密流程：写入版本头 → 压缩 → 加密
      const salt = randomBytes(SALT_LENGTH)
      const key = deriveKey(this.config.encryptionKey!, salt)
      const iv = randomBytes(IV_LENGTH)
      const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

      const writeStream = createWriteStream(zipPath)
      // 写入版本标记 + salt + iv 作为文件头
      writeStream.write(ENC_MAGIC)
      writeStream.write(salt)
      writeStream.write(iv)

      await pipeline(
        createReadStream(dbPath),
        createGzip(),
        cipher,
        writeStream
      )

      // 获取 auth tag 并追加到文件末尾
      const tag = cipher.getAuthTag()
      const fd = openSync(zipPath, 'a')
      writeSync(fd, tag)
      closeSync(fd)
    } else {
      // 普通压缩
      await pipeline(
        createReadStream(dbPath),
        createGzip(),
        createWriteStream(zipPath)
      )
    }

    const stat = statSync(zipPath)

    logger.info('Backup created', { filename, size: stat.size, encrypted })

    // 清理旧备份
    this.cleanupOldBackups()

    return {
      filename,
      size: stat.size,
      createdAt: now.toISOString(),
      encrypted
    }
  }

  /** 列出所有备份 */
  listBackups(): BackupEntry[] {
    this.ensureDir()

    const files = readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.db.zip') || f.endsWith('.db.zip.enc'))
      .map((f) => {
        const stat = statSync(join(this.backupDir, f))
        return {
          filename: f,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          encrypted: f.endsWith('.enc')
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return files
  }

  /** 从备份恢复 */
  async restoreBackup(filename: string, password?: string): Promise<{ restored: boolean }> {
    const zipPath = join(this.backupDir, filename)
    if (!existsSync(zipPath)) {
      throw new Error(`备份文件不存在: ${filename}`)
    }

    const isEncrypted = filename.endsWith('.enc')
    if (isEncrypted && !password) {
      throw new Error('加密备份需要提供解密密码')
    }

    const dbPath = this.getDbPath()
    const tmpPath = dbPath + '.restore.tmp'

    if (isEncrypted) {
      // 加密备份：读取文件头 → 检测版本 → 解密 → 解压
      const fd = openSync(zipPath, 'r')
      const fileSize = fstatSync(fd).size

      // 读取足够的前缀来检测版本：ENC_MAGIC(14) + salt(16) + iv(12) = 42 bytes
      const headerBuf = Buffer.alloc(ENC_HEADER_LENGTH)
      readSync(fd, headerBuf, 0, ENC_HEADER_LENGTH, 0)

      let salt: Buffer
      let iv: Buffer
      let ciphertextStart: number

      // 检测是否为 V1 格式（含版本标记）
      const magicBytes = headerBuf.subarray(0, ENC_MAGIC.length)
      if (magicBytes.equals(ENC_MAGIC)) {
        // V1 格式：magic(14) + salt(16) + iv(12) + ciphertext + authTag(16)
        salt = headerBuf.subarray(ENC_MAGIC.length, ENC_MAGIC.length + SALT_LENGTH)
        iv = headerBuf.subarray(ENC_MAGIC.length + SALT_LENGTH, ENC_HEADER_LENGTH)
        ciphertextStart = ENC_HEADER_LENGTH
      } else {
        // V0 旧格式：salt(16) + iv(12) + ciphertext + authTag(16)（无版本标记）
        salt = headerBuf.subarray(0, SALT_LENGTH)
        iv = headerBuf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
        ciphertextStart = SALT_LENGTH + IV_LENGTH
      }

      // 读取 auth tag (16 bytes) 从文件末尾
      const tag = Buffer.alloc(AUTH_TAG_LENGTH)
      readSync(fd, tag, 0, AUTH_TAG_LENGTH, fileSize - AUTH_TAG_LENGTH)
      closeSync(fd)

      const key = deriveKey(password!, salt)

      const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
      decipher.setAuthTag(tag)

      // 读取加密数据（跳过 header 和 tag）
      const readStream = createReadStream(zipPath, {
        start: ciphertextStart,
        end: fileSize - AUTH_TAG_LENGTH - 1
      })

      await pipeline(
        readStream,
        decipher,
        createGunzip(),
        createWriteStream(tmpPath)
      )
    } else {
      // 普通备份：直接解压
      await pipeline(
        createReadStream(zipPath),
        createGunzip(),
        createWriteStream(tmpPath)
      )
    }

    // 验证 SQLite 文件完整性
    try {
      const Database = require('better-sqlite3')
      const tmpDb = new Database(tmpPath, { readonly: true })
      const result = tmpDb.pragma('integrity_check')
      tmpDb.close()
      if (result[0]?.integrity_check !== 'ok') {
        unlinkSync(tmpPath)
        throw new Error('备份文件校验失败: 数据库文件已损坏')
      }
    } catch (err) {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
      throw err
    }

    // 关闭当前数据库连接
    closeDatabase()

    // 替换当前数据库文件
    if (existsSync(dbPath)) {
      unlinkSync(dbPath)
    }
    for (const suffix of ['-wal', '-shm']) {
      const walPath = dbPath + suffix
      if (existsSync(walPath)) unlinkSync(walPath)
    }

    copyFileSync(tmpPath, dbPath)
    unlinkSync(tmpPath)

    // 重新初始化数据库连接
    initDatabase()

    logger.info('Backup restored', { filename, encrypted: isEncrypted })
    return { restored: true }
  }

  /** 删除指定备份 */
  deleteBackup(filename: string): { deleted: boolean } {
    const path = join(this.backupDir, filename)
    if (!existsSync(path)) {
      throw new Error(`备份文件不存在: ${filename}`)
    }
    unlinkSync(path)
    logger.info('Backup deleted', { filename })
    return { deleted: true }
  }

  /** 获取配置 */
  getConfig(): BackupConfig {
    return { ...this.config }
  }

  /** 更新配置 */
  setConfig(patch: Partial<BackupConfig>): BackupConfig {
    if (patch.intervalMinutes !== undefined) {
      this.config.intervalMinutes = Math.max(10, patch.intervalMinutes)
    }
    if (patch.maxBackups !== undefined) {
      this.config.maxBackups = Math.max(1, patch.maxBackups)
    }
    if (patch.enabled !== undefined) {
      this.config.enabled = patch.enabled
      if (patch.enabled) {
        this.start()
      } else {
        this.stop()
      }
    }
    if (patch.encryptionKey !== undefined) {
      this.config.encryptionKey = patch.encryptionKey || undefined
    }
    return { ...this.config }
  }

  /** 清理超出数量的旧备份 */
  private cleanupOldBackups(): void {
    const backups = this.listBackups()
    if (backups.length <= this.config.maxBackups) return

    const toDelete = backups.slice(this.config.maxBackups)
    for (const b of toDelete) {
      try {
        unlinkSync(join(this.backupDir, b.filename))
      } catch {
        // 删除失败不阻塞
      }
    }
  }
}

export const backupService = new BackupService()