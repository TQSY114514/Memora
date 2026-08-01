/**
 * 自动热备份服务（v1.6 + v1.6.1 加密增强 + v1.8 校验和/配置持久化）
 *
 * 定时自动压缩 SQLite 数据库文件到备份目录，支持 AES-256-GCM 加密。
 *
 * 备份策略：
 * - 备份目录: {userData}/backups/
 * - 文件命名: Memora_backup_{YYYYMMDD_HHmmss}.db.zip[.enc]
 * - 备份内容: 完整 SQLite 数据库文件（WAL checkpoint → Gzip 压缩 → AES-256-GCM 加密）
 * - 保留数量: 默认 10 份，可配置
 * - 加密: 可选，通过 PBKDF2 从密码派生 AES-256 密钥
 * - 校验和: 每份备份生成 sidecar {filename}.sha256（标准 sha256sum 格式），恢复时强制校验
 * - 配置持久化: 写入 {userData}/backup-config.json，重启后保留
 *
 * 恢复流程：
 * - SHA-256 校验 → 关闭当前数据库连接 → 解密 → 解压 → 校验完整性 → 替换数据库 → 重新初始化
 */
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, readdirSync, statSync, unlinkSync, renameSync, existsSync, openSync, writeSync, closeSync, fstatSync, readSync, readFileSync, writeFileSync } from 'fs'
import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { createReadStream, createWriteStream } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'crypto'
import { getDatabase, closeDatabase, initDatabase, getDbPath } from '../database/connection'
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
  /** SHA-256 校验和（v1.8，旧备份可能缺失） */
  sha256?: string
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
  private configPath: string

  constructor() {
    this.backupDir = join(app.getPath('userData'), 'backups')
    this.configPath = join(app.getPath('userData'), 'backup-config.json')
    this.loadConfig()
  }

  /** 配置持久化：从 backup-config.json 读取（v1.8） */
  private loadConfig(): void {
    try {
      if (!existsSync(this.configPath)) return
      const raw = readFileSync(this.configPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<BackupConfig>
      if (typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes >= 10) {
        this.config.intervalMinutes = parsed.intervalMinutes
      }
      if (typeof parsed.maxBackups === 'number' && parsed.maxBackups >= 1) {
        this.config.maxBackups = parsed.maxBackups
      }
      if (typeof parsed.enabled === 'boolean') {
        this.config.enabled = parsed.enabled
      }
      // 注意：encryptionKey 不持久化（明文密码写盘有风险），每次启动需重新设置
      logger.info('Backup config loaded', {
        intervalMinutes: this.config.intervalMinutes,
        maxBackups: this.config.maxBackups,
        enabled: this.config.enabled
      })
    } catch (err) {
      logger.warn('Failed to load backup config, using defaults', { error: String(err) })
    }
  }

  /** 配置持久化：写入 backup-config.json（v1.8，不写 encryptionKey） */
  private saveConfig(): void {
    try {
      const safe: BackupConfig = {
        intervalMinutes: this.config.intervalMinutes,
        maxBackups: this.config.maxBackups,
        enabled: this.config.enabled
        // encryptionKey 故意不持久化
      }
      writeFileSync(this.configPath, JSON.stringify(safe, null, 2), 'utf-8')
    } catch (err) {
      logger.warn('Failed to persist backup config', { error: String(err) })
    }
  }

  private ensureDir(): void {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true })
    }
  }

  /**
   * 计算文件 SHA-256（v1.8）
   * 使用流式哈希，避免大备份文件一次性读入内存。
   */
  private async computeSha256(filePath: string): Promise<string> {
    const hash = createHash('sha256')
    await pipeline(createReadStream(filePath), hash)
    // hash.read() 在 stream/promises pipeline 完成后可同步读出
    return hash.digest('hex')
  }

  /** 读取 sidecar .sha256 文件中的校验和（无则返回 null） */
  private readSidecarSha256(backupFilename: string): string | null {
    const sidecar = join(this.backupDir, backupFilename + '.sha256')
    if (!existsSync(sidecar)) return null
    try {
      // 标准 sha256sum 格式: "<hex>  <filename>"，取第一个字段
      const content = readFileSync(sidecar, 'utf-8').trim()
      const hex = content.split(/\s+/)[0]?.toLowerCase()
      return /^[0-9a-f]{64}$/.test(hex) ? hex : null
    } catch {
      return null
    }
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

    const dbPath = getDbPath()
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
    // 原子创建（v1.9）：先写 .tmp，全部完成后 rename 到最终路径
    // 避免写入中途崩溃留下损坏的备份文件（虽有 SHA-256 兜底，但原子替换更彻底）
    const tmpPath = zipPath + '.tmp'

    try {
      if (encrypted) {
        // 加密流程：写入版本头 → 压缩 → 加密
        const salt = randomBytes(SALT_LENGTH)
        const key = deriveKey(this.config.encryptionKey!, salt)
        const iv = randomBytes(IV_LENGTH)
        const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

        const writeStream = createWriteStream(tmpPath)
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
        const fd = openSync(tmpPath, 'a')
        writeSync(fd, tag)
        closeSync(fd)
      } else {
        // 普通压缩
        await pipeline(
          createReadStream(dbPath),
          createGzip(),
          createWriteStream(tmpPath)
        )
      }

      // 原子替换到最终路径
      renameSync(tmpPath, zipPath)
    } catch (err) {
      // 清理未完成的 tmp 文件，避免残留
      if (existsSync(tmpPath)) {
        try { unlinkSync(tmpPath) } catch { /* 忽略 */ }
      }
      throw err
    }

    const stat = statSync(zipPath)

    // 计算并写入 SHA-256 校验和 sidecar（v1.8）
    // 标准 sha256sum 格式，便于用 `sha256sum -c` 离线校验
    let sha256: string | undefined
    try {
      sha256 = await this.computeSha256(zipPath)
      const sidecarPath = zipPath + '.sha256'
      writeFileSync(sidecarPath, `${sha256}  ${filename}\n`, 'utf-8')
    } catch (err) {
      logger.warn('Failed to compute backup SHA-256', { filename, error: String(err) })
    }

    logger.info('Backup created', { filename, size: stat.size, encrypted, sha256: !!sha256 })

    // 清理旧备份
    this.cleanupOldBackups()

    return {
      filename,
      size: stat.size,
      createdAt: now.toISOString(),
      encrypted,
      sha256
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
          encrypted: f.endsWith('.enc'),
          sha256: this.readSidecarSha256(f) ?? undefined
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

    // SHA-256 完整性校验（v1.8）：有 sidecar 则强制校验，缺失则告警放行（兼容旧备份）
    const expectedSha = this.readSidecarSha256(filename)
    if (expectedSha) {
      const actualSha = await this.computeSha256(zipPath)
      if (actualSha !== expectedSha) {
        logger.error('Backup SHA-256 mismatch, abort restore', { filename, expected: expectedSha, actual: actualSha })
        throw new Error(`备份文件校验失败：SHA-256 不匹配，文件可能已损坏或被篡改`)
      }
      logger.info('Backup SHA-256 verified', { filename })
    } else {
      logger.warn('No SHA-256 sidecar for backup, skipping integrity check', { filename })
    }

    const dbPath = getDbPath()
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

    // 原子替换：先删 WAL/SHM（旧 WAL 不能与新库配对），再用 rename 原子覆盖主库
    // 关键改进（v1.9）：renameSync 在 POSIX 上原子，Windows 上用 MoveFileExW(MOVEFILE_REPLACE_EXISTING)
    // 失败时原 dbPath 未被破坏，可恢复连接继续使用，不再有 unlink+copy 之间的数据丢失窗口
    for (const suffix of ['-wal', '-shm']) {
      const walPath = dbPath + suffix
      if (existsSync(walPath)) unlinkSync(walPath)
    }

    try {
      renameSync(tmpPath, dbPath)
    } catch (renameErr) {
      // rename 失败（如 Windows 上文件被占用）：tmpPath 仍在，原库未破坏
      // 尝试清理 tmp，恢复旧连接，抛出错误让上层处理
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
      initDatabase()
      throw new Error(`恢复失败：无法替换数据库文件（${(renameErr as Error).message}），原数据库未受影响`)
    }

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
    // 同时清理 sidecar 校验和文件（v1.8）
    const sidecar = join(this.backupDir, filename + '.sha256')
    if (existsSync(sidecar)) {
      try {
        unlinkSync(sidecar)
      } catch {
        // sidecar 删除失败不阻塞
      }
    }
    logger.info('Backup deleted', { filename })
    return { deleted: true }
  }

  /** 获取配置 */
  getConfig(): BackupConfig {
    return { ...this.config }
  }

  /** 更新配置（变更会持久化到 backup-config.json，v1.8） */
  setConfig(patch: Partial<BackupConfig>): BackupConfig {
    let changed = false
    if (patch.intervalMinutes !== undefined) {
      this.config.intervalMinutes = Math.max(10, patch.intervalMinutes)
      changed = true
    }
    if (patch.maxBackups !== undefined) {
      this.config.maxBackups = Math.max(1, patch.maxBackups)
      changed = true
    }
    if (patch.enabled !== undefined) {
      this.config.enabled = patch.enabled
      if (patch.enabled) {
        this.start()
      } else {
        this.stop()
      }
      changed = true
    }
    if (patch.encryptionKey !== undefined) {
      // encryptionKey 仅存内存，不持久化
      this.config.encryptionKey = patch.encryptionKey || undefined
    }
    if (changed) this.saveConfig()
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
        // 一并清理 sidecar（v1.8）
        const sidecar = join(this.backupDir, b.filename + '.sha256')
        if (existsSync(sidecar)) unlinkSync(sidecar)
      } catch {
        // 删除失败不阻塞
      }
    }
  }
}

export const backupService = new BackupService()