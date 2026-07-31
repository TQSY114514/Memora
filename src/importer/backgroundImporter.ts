/**
 * 后台静默导入服务（P3）
 *
 * 职责：
 * - 配置持久化到 <userData>/bg-import-config.json（主进程可在渲染进程加载前读取）
 * - 复用 detectInstalledApps() + extractLocal() + importExtractedSessions()
 * - 定时器调度，启动时可选立即执行一次
 * - 通过 BrowserWindow.webContents.send 推送 IMPORT_BG_PROGRESS / IMPORT_BG_DONE 事件
 * - 幂等由 persistSessions 的 findBySourceId 保证，重复对话自动跳过
 *
 * 只扒取 canExtract=true 的应用（Cursor/ClaudeCode/OpenCode/Windsurf/Cline）
 * 目标文件夹必须选择，否则不执行（避免导入到「全部聊天」）
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { detectInstalledApps } from './appDetector'
import { extractLocal } from './localExtractor'
import { importExtractedSessions } from './service'
import { IPC } from '@shared/constants'
import type {
  BackgroundImportConfig,
  BackgroundImportStatus,
  BackgroundImportProgress,
  BackgroundImportRunResult,
  Provider
} from '@shared/types'

const DEFAULT_CONFIG: BackgroundImportConfig = {
  enabled: false,
  targetFolderId: null,
  providers: [],
  intervalMinutes: 30,
  runOnStartup: true
}

function emptyResult(errors: string[] = []): BackgroundImportRunResult {
  return {
    detected: 0,
    extracted: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    errors,
    durationMs: 0
  }
}

class BackgroundImporter {
  private win: BrowserWindow | null = null
  private timer: NodeJS.Timeout | null = null
  private startupTimer: NodeJS.Timeout | null = null
  private status: BackgroundImportStatus = {
    running: false,
    lastRunAt: null,
    lastResult: null,
    nextRunAt: null,
    currentProgress: null
  }
  private config: BackgroundImportConfig = { ...DEFAULT_CONFIG }

  setWindow(win: BrowserWindow | null): void {
    this.win = win
  }

  getConfig(): BackgroundImportConfig {
    return { ...this.config }
  }

  getStatus(): BackgroundImportStatus {
    return { ...this.status }
  }

  /** 从 <userData>/bg-import-config.json 读取配置 */
  loadConfig(): void {
    try {
      const p = join(app.getPath('userData'), 'bg-import-config.json')
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, 'utf-8'))
        this.config = { ...DEFAULT_CONFIG, ...raw }
      }
    } catch {
      // 读取失败保持默认配置
    }
  }

  /** 更新配置并持久化；启用状态变化时重启调度 */
  setConfig(patch: Partial<BackgroundImportConfig>): BackgroundImportConfig {
    this.config = { ...this.config, ...patch }
    try {
      const p = join(app.getPath('userData'), 'bg-import-config.json')
      writeFileSync(p, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch {
      // 写入失败不阻塞
    }
    // 重启调度
    if (this.config.enabled) this.start()
    else this.stop()
    return { ...this.config }
  }

  /** 启动定时调度 */
  start(): void {
    if (!this.config.enabled) return
    if (this.timer) return
    this.scheduleNext()
    if (this.config.runOnStartup) {
      // 启动 5s 后首次执行（避开启动高峰）
      if (this.startupTimer) clearTimeout(this.startupTimer)
      this.startupTimer = setTimeout(() => {
        this.startupTimer = null
        this.runOnce()
      }, 5000)
    }
  }

  /** 停止定时调度 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer)
      this.startupTimer = null
    }
    this.status.nextRunAt = null
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer)
    const ms = Math.max(1, this.config.intervalMinutes) * 60 * 1000
    const next = new Date(Date.now() + ms)
    this.status.nextRunAt = next.toISOString()
    this.timer = setTimeout(() => {
      this.runOnce()
      this.scheduleNext()
    }, ms)
  }

  /** 执行一次扒取+导入 */
  async runOnce(): Promise<BackgroundImportRunResult> {
    if (this.status.running) {
      return emptyResult(['已有任务在执行'])
    }
    if (!this.config.targetFolderId) {
      return emptyResult(['未配置目标文件夹'])
    }

    this.status.running = true
    const t0 = Date.now()
    const result = emptyResult()

    try {
      // 1. 检测已安装的 AI 应用
      this.emit({
        phase: 'detecting',
        provider: null,
        current: 0,
        total: 0,
        message: '检测已安装的 AI 应用…'
      })
      const apps = detectInstalledApps().filter((a) => a.canExtract && a.dataPath)
      // 按 providers 过滤（空=全部可扒取的）
      const filtered =
        this.config.providers.length === 0
          ? apps
          : apps.filter((a) => this.config.providers.includes(a.provider as Provider))
      result.detected = filtered.length

      // 2. 逐个扒取 + 导入
      for (let i = 0; i < filtered.length; i++) {
        const appInfo = filtered[i]
        this.emit({
          phase: 'extracting',
          provider: appInfo.provider,
          current: i + 1,
          total: filtered.length,
          message: `扒取 ${appInfo.name}…`
        })
        try {
          const sessions = extractLocal(appInfo.provider as Provider, appInfo.dataPath!, {
            maxSessions: 5000
          })
          result.extracted += sessions.length
          if (sessions.length === 0) continue

          this.emit({
            phase: 'importing',
            provider: appInfo.provider,
            current: i + 1,
            total: filtered.length,
            message: `导入 ${sessions.length} 条来自 ${appInfo.name} 的对话…`
          })
          const r = importExtractedSessions(sessions, {
            folderId: this.config.targetFolderId!
          })
          result.imported += r.imported
          result.skipped += r.skipped
          result.failed += r.failed
          if (r.errors.length) result.errors.push(...r.errors)
        } catch (e) {
          result.failed++
          result.errors.push(`${appInfo.name}: ${(e as Error).message}`)
        }
      }
    } finally {
      result.durationMs = Date.now() - t0
      this.status.running = false
      this.status.lastRunAt = new Date().toISOString()
      this.status.lastResult = result
      this.status.currentProgress = null
      this.emitDone(result)
    }
    return result
  }

  private emit(p: BackgroundImportProgress): void {
    this.status.currentProgress = p
    this.win?.webContents.send(IPC.IMPORT_BG_PROGRESS, p)
  }

  private emitDone(r: BackgroundImportRunResult): void {
    this.win?.webContents.send(IPC.IMPORT_BG_DONE, r)
  }
}

export const backgroundImporter = new BackgroundImporter()
