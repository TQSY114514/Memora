/**
 * 全量数据迁移（v1.7.1）
 *
 * 支持将整个工作区（SQLite 数据库 + AI 配置）导出为单个归档文件，
 * 在另一台机器上导入恢复。适用于跨设备迁移、完整备份等场景。
 *
 * 归档格式（自描述，gzip 压缩）：
 *   - 4  字节  魔数 "MZDM"
 *   - 4  字节  文件数量（大端 uint32）
 *   - 每个文件：
 *       - 4  字节  名称长度（大端 uint32）
 *       - N  字节  名称（utf-8）
 *       - 8  字节  数据长度（大端 uint64）
 *       - M  字节  数据
 *
 * 导出：VACUUM INTO 生成干净的数据库副本 → 与 ai-config.json 一起打包 → gzip 写盘
 * 导入：解压 → 解析 → 校验完整性 → 关闭当前库 → 替换文件 → 重新初始化 → 恢复 AI 配置
 */
import { app, dialog } from 'electron'
import {
  createWriteStream,
  createReadStream,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  copyFileSync
} from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { createGzip, createGunzip } from 'zlib'
import { Readable, Writable } from 'stream'
import {
  getDbPath,
  getDatabase,
  checkpointDatabase,
  closeDatabase,
  initDatabase
} from '../database/connection'
import { logger } from './logger'

const MAGIC = 'MZDM'

/** AI 配置文件路径（与 aiConfigFile.ts 保持一致） */
function getAiConfigPath(): string {
  return join(app.getPath('userData'), 'ai-config.json')
}

/** 将多个文件打包为归档 Buffer */
function buildArchive(files: Array<{ name: string; data: Buffer }>): Buffer {
  const named = files.map((f) => ({ name: f.name, nameBuf: Buffer.from(f.name, 'utf-8'), data: f.data }))
  const totalLen =
    4 + // magic
    4 + // file count
    named.reduce((acc, f) => acc + 4 + f.nameBuf.length + 8 + f.data.length, 0)

  const buf = Buffer.alloc(totalLen)
  let off = 0
  buf.write(MAGIC, off, 'ascii')
  off += 4
  buf.writeUInt32BE(files.length, off)
  off += 4
  for (const f of named) {
    buf.writeUInt32BE(f.nameBuf.length, off)
    off += 4
    f.nameBuf.copy(buf, off)
    off += f.nameBuf.length
    buf.writeBigUInt64BE(BigInt(f.data.length), off)
    off += 8
    f.data.copy(buf, off)
    off += f.data.length
  }
  return buf
}

/** 解析归档 Buffer，返回 文件名 -> 数据 的映射 */
function parseArchive(buf: Buffer): Map<string, Buffer> {
  if (buf.length < 8 || buf.subarray(0, 4).toString('ascii') !== MAGIC) {
    throw new Error('无效的数据迁移文件：格式不匹配（缺少 MZDM 标识）')
  }
  let off = 4
  const count = buf.readUInt32BE(off)
  off += 4
  const files = new Map<string, Buffer>()
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt32BE(off)
    off += 4
    const name = buf.subarray(off, off + nameLen).toString('utf-8')
    off += nameLen
    const dataLen = Number(buf.readBigUInt64BE(off))
    off += 8
    const data = Buffer.from(buf.subarray(off, off + dataLen))
    off += dataLen
    files.set(name, data)
  }
  return files
}

/** 校验 SQLite 文件完整性 */
function validateSqliteFile(path: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3')
  const tmpDb = new Database(path, { readonly: true })
  try {
    const result = tmpDb.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (!result.length || result[0].integrity_check !== 'ok') {
      throw new Error('迁移文件中的数据库已损坏')
    }
  } finally {
    tmpDb.close()
  }
}

/**
 * 导出全量数据：将数据库文件 + AI 配置打包为 .zip
 * 使用 SQLite 的 VACUUM INTO 创建干净副本，然后与 aiConfig.json 一起打包
 */
export async function exportData(): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // 1. 选择保存路径
    const date = new Date().toISOString().slice(0, 10)
    const dlg = await dialog.showSaveDialog({
      defaultPath: `memora-workspace-${date}.zip`,
      filters: [{ name: 'Memora 数据迁移包', extensions: ['zip'] }]
    })
    if (dlg.canceled || !dlg.filePath) {
      return { success: false }
    }
    const savePath = dlg.filePath

    // 2. 刷新 WAL，确保数据落盘
    try {
      checkpointDatabase()
    } catch (e) {
      logger.warn('Export: WAL checkpoint failed (non-blocking)', { error: String(e) })
    }

    // 3. VACUUM INTO 生成干净紧凑的数据库副本
    const tempDbPath = join(app.getPath('userData'), 'memora-export-tmp.db')
    if (existsSync(tempDbPath)) {
      try {
        unlinkSync(tempDbPath)
      } catch {
        /* ignore */
      }
    }
    const db = getDatabase()
    // 转义 SQL 字符串字面量中的单引号
    const sqlPath = tempDbPath.replace(/'/g, "''")
    db.exec(`VACUUM INTO '${sqlPath}'`)

    // 4. 收集要打包的文件
    const files: Array<{ name: string; data: Buffer }> = []
    files.push({ name: 'Memora.db', data: readFileSync(tempDbPath) })

    const aiConfigPath = getAiConfigPath()
    if (existsSync(aiConfigPath)) {
      files.push({ name: 'ai-config.json', data: readFileSync(aiConfigPath) })
    }

    // 5. 构造归档并 gzip 压缩写盘
    const archiveBuf = buildArchive(files)
    await pipeline(Readable.from([archiveBuf]), createGzip(), createWriteStream(savePath))

    // 6. 清理临时文件
    try {
      unlinkSync(tempDbPath)
    } catch {
      /* ignore */
    }

    logger.info('Data exported', { path: savePath, files: files.length, rawSize: archiveBuf.length })
    return { success: true, path: savePath }
  } catch (err) {
    logger.error('Data export failed', { error: err instanceof Error ? err.stack : String(err) })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 导入全量数据：从 .zip 恢复数据库 + AI 配置
 * 1. 选择文件 2. 解压 3. 解析 4. 校验 5. 关闭当前库 → 替换文件 → 重开 6. 恢复 AI 配置
 */
export async function importData(): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. 选择文件
    const dlg = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Memora 数据迁移包', extensions: ['zip'] }]
    })
    if (dlg.canceled || dlg.filePaths.length === 0) {
      return { success: false }
    }
    const openPath = dlg.filePaths[0]

    // 2. gzip 解压到内存
    const chunks: Buffer[] = []
    const collect = new Writable({
      write(chunk: Buffer, _encoding: BufferEncoding, callback: (err?: Error | null) => void): void {
        chunks.push(chunk)
        callback()
      }
    })
    await pipeline(createReadStream(openPath), createGunzip(), collect)
    const archiveBuf = Buffer.concat(chunks)

    // 3. 解析归档
    const files = parseArchive(archiveBuf)
    const dbData = files.get('Memora.db')
    if (!dbData) {
      throw new Error('迁移文件中缺少数据库（Memora.db）')
    }

    // 4. 写入临时文件并校验完整性
    const dbPath = getDbPath()
    const tmpPath = dbPath + '.migrate.tmp'
    writeFileSync(tmpPath, dbData)
    try {
      validateSqliteFile(tmpPath)
    } catch (e) {
      try {
        unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
      throw e
    }

    // 5. 关闭当前数据库 → 替换文件 → 重新初始化
    closeDatabase()
    if (existsSync(dbPath)) {
      unlinkSync(dbPath)
    }
    for (const suffix of ['-wal', '-shm']) {
      const walPath = dbPath + suffix
      if (existsSync(walPath)) {
        try {
          unlinkSync(walPath)
        } catch {
          /* ignore */
        }
      }
    }
    copyFileSync(tmpPath, dbPath)
    try {
      unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    initDatabase()

    // 6. 恢复 AI 配置（若存在）
    const aiConfigData = files.get('ai-config.json')
    if (aiConfigData) {
      writeFileSync(getAiConfigPath(), aiConfigData)
    }

    logger.info('Data imported', { path: openPath, withAiConfig: !!aiConfigData })
    return { success: true }
  } catch (err) {
    logger.error('Data import failed', { error: err instanceof Error ? err.stack : String(err) })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
