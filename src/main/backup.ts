/**
 * 自动热备份服务（v1.6）
 *
 * 定时自动压缩 SQLite 数据库文件到备份目录，实现数据安全保障。
 * 支持定时备份、手动备份、一键恢复、备份列表管理等。
 *
 * 备份策略：
 * - 备份目录: {userData}/backups/
 * - 文件命名: Memora_backup_{YYYYMMDD_HHmmss}.db.zip
 * - 备份内容: 完整 SQLite 数据库文件（WAL checkpoint 后压缩）
 * - 保留数量: 默认 10 份，可配置
 *
 * 恢复流程：
 * - 关闭当前数据库连接 → 解压备份文件 → 校验完整性 → 替换数据库 → 重新初始化
 */
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, readdirSync, statSync, unlinkSync, copyFileSync, existsSync, writeFileSync, readFileSync } from 'fs'
import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { createReadStream, createWriteStream } from 'fs'
import { getDatabase, closeDatabase, initDatabase } from '../database/connection'

export interface BackupConfig {
  /** 备份间隔（分钟），默认 60 */
  intervalMinutes: number
  /** 最大保留备份数，默认 10 */
  maxBackups: number
  /** 是否启用自动备份，默认 true */
  enabled: boolean
}

export interface BackupEntry {
  filename: string
  size: number
  createdAt: string
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
        console.error('[backup] 定时备份失败:', err)
      })
    }, this.config.intervalMinutes * 60 * 1000)

    console.log(`[backup] 自动备份已启动，间隔 ${this.config.intervalMinutes} 分钟，最大保留 ${this.config.maxBackups} 份`)
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
    const filename = `Memora_backup_${timestamp}.db.zip`
    const zipPath = join(this.backupDir, filename)

    // 压缩数据库文件
    await pipeline(
      createReadStream(dbPath),
      createGzip(),
      createWriteStream(zipPath)
    )

    const stat = statSync(zipPath)

    // 清理旧备份
    this.cleanupOldBackups()

    return {
      filename,
      size: stat.size,
      createdAt: now.toISOString()
    }
  }

  /** 列出所有备份 */
  listBackups(): BackupEntry[] {
    this.ensureDir()

    const files = readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.db.zip'))
      .map((f) => {
        const stat = statSync(join(this.backupDir, f))
        return {
          filename: f,
          size: stat.size,
          createdAt: stat.birthtime.toISOString()
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return files
  }

  /** 从备份恢复 */
  async restoreBackup(filename: string): Promise<{ restored: boolean }> {
    const zipPath = join(this.backupDir, filename)
    if (!existsSync(zipPath)) {
      throw new Error(`备份文件不存在: ${filename}`)
    }

    const dbPath = this.getDbPath()
    const tmpPath = dbPath + '.restore.tmp'

    // 1. 解压备份到临时路径
    await pipeline(
      createReadStream(zipPath),
      createGunzip(),
      createWriteStream(tmpPath)
    )

    // 2. 验证 SQLite 文件完整性
    // 使用临时数据库连接验证
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

    // 3. 关闭当前数据库连接
    closeDatabase()

    // 4. 替换当前数据库文件
    if (existsSync(dbPath)) {
      unlinkSync(dbPath)
    }
    // 也删除 WAL/SHM 文件
    for (const suffix of ['-wal', '-shm']) {
      const walPath = dbPath + suffix
      if (existsSync(walPath)) unlinkSync(walPath)
    }

    copyFileSync(tmpPath, dbPath)
    unlinkSync(tmpPath)

    // 5. 重新初始化数据库连接
    initDatabase()

    return { restored: true }
  }

  /** 删除指定备份 */
  deleteBackup(filename: string): { deleted: boolean } {
    const path = join(this.backupDir, filename)
    if (!existsSync(path)) {
      throw new Error(`备份文件不存在: ${filename}`)
    }
    unlinkSync(path)
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