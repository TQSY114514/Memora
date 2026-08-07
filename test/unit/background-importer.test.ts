import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BackgroundImporter } from '../../src/importer/backgroundImporter'
import { IPC } from '@shared/constants'

// mock Electron：app.getPath 指向临时目录
const userData = mkdtempSync(join(tmpdir(), 'bg-import-test-'))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userData) },
  BrowserWindow: class {}
}))

// mock 依赖：appDetector / localExtractor / service
const detectInstalledApps = vi.fn()
const extractLocal = vi.fn()
const importExtractedSessions = vi.fn()
vi.mock('../../src/importer/appDetector', () => ({ detectInstalledApps: () => detectInstalledApps() }))
vi.mock('../../src/importer/localExtractor', () => ({ extractLocal: (...a: unknown[]) => extractLocal(...a) }))
vi.mock('../../src/importer/service', () => ({ importExtractedSessions: (...a: unknown[]) => importExtractedSessions(...a) }))

function makeWin() {
  const send = vi.fn()
  return {
    win: { isDestroyed: () => false, webContents: { send } },
    send
  }
}

const cursorApp = { provider: 'Cursor', name: 'Cursor', dataPath: '/c', canExtract: true }
const claudeCodeApp = { provider: 'ClaudeCode', name: 'Claude Code', dataPath: '/cc', canExtract: true }
const chatgptApp = { provider: 'ChatGPT', name: 'ChatGPT', dataPath: '/g', canExtract: false } // 不可扒取

function makeSessions(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    provider: 'Cursor',
    title: `会话${i}`,
    source: 'cursor',
    messageCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [{ role: 'user', content: `内容${i}`, createdAt: new Date().toISOString() }]
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mkdirSync(userData, { recursive: true }) // 每测重建临时目录（上一测 afterEach 已清理）
  detectInstalledApps.mockReturnValue([cursorApp, claudeCodeApp, chatgptApp])
  extractLocal.mockReturnValue(makeSessions(2))
  importExtractedSessions.mockReturnValue({ imported: 2, skipped: 0, failed: 0, errors: [] })
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('BackgroundImporter', () => {
  it('runOnce 未配置目标文件夹时短路，返回错误结果', async () => {
    const importer = new BackgroundImporter()
    const r = await importer.runOnce()
    expect(r.detected).toBe(0)
    expect(r.imported).toBe(0)
    expect(r.errors).toContain('未配置目标文件夹')
    expect(detectInstalledApps).not.toHaveBeenCalled()
    expect(importer.getStatus().running).toBe(false)
  })

  it('runOnce 已有任务在执行时短路', async () => {
    const importer = new BackgroundImporter()
    importer.setConfig({ enabled: true, targetFolderId: 'f1' })
    // 手动置 running=true 模拟并发
    ;(importer as unknown as { status: { running: boolean } }).status.running = true
    const r = await importer.runOnce()
    expect(r.errors).toContain('已有任务在执行')
    expect(detectInstalledApps).not.toHaveBeenCalled()
  })

  it('runOnce 成功：检测→扒取→导入，聚合计数并推送事件', async () => {
    const importer = new BackgroundImporter()
    importer.setConfig({ enabled: true, targetFolderId: 'f1', providers: [] })
    const { win, send } = makeWin()
    importer.setWindow(win as never)

    const r = await importer.runOnce()

    expect(detectInstalledApps).toHaveBeenCalled()
    // 只处理 canExtract=true 的应用（Cursor + ClaudeCode）
    expect(r.detected).toBe(2)
    expect(r.extracted).toBe(4)
    expect(r.imported).toBe(4)
    expect(r.failed).toBe(0)
    expect(importExtractedSessions).toHaveBeenCalledTimes(2)
    // 进度 + 完成事件
    expect(send).toHaveBeenCalledWith(IPC.IMPORT_BG_DONE, expect.objectContaining({ imported: 4 }))
    expect(send).toHaveBeenCalledWith(IPC.DATA_CHANGED)
    expect(importer.getStatus().lastRunAt).toBeTruthy()
    expect(importer.getStatus().running).toBe(false)
  })

  it('providers 过滤：只处理指定 provider', async () => {
    const importer = new BackgroundImporter()
    importer.setConfig({ enabled: true, targetFolderId: 'f1', providers: ['ClaudeCode'] })
    const { win } = makeWin()
    importer.setWindow(win as never)

    const r = await importer.runOnce()
    expect(r.detected).toBe(1)
    expect(extractLocal).toHaveBeenCalledTimes(1)
    expect(extractLocal).toHaveBeenCalledWith('ClaudeCode', '/cc', expect.anything())
  })

  it('extractLocal 抛错时计入失败，runOnce 仍 resolve', async () => {
    const importer = new BackgroundImporter()
    importer.setConfig({ enabled: true, targetFolderId: 'f1', providers: ['Cursor'] })
    extractLocal.mockImplementation(() => {
      throw new Error('parse boom')
    })

    const r = await importer.runOnce()
    expect(r.failed).toBe(1)
    expect(r.imported).toBe(0)
    expect(r.errors.join(' ')).toContain('parse boom')
  })

  it('emits 时窗口已销毁不抛错', async () => {
    const importer = new BackgroundImporter()
    importer.setConfig({ enabled: true, targetFolderId: 'f1', providers: ['Cursor'] })
    importer.setWindow({ isDestroyed: () => true, webContents: { send: vi.fn() } } as never)
    const r = await importer.runOnce()
    expect(r.imported).toBe(2) // 无窗口也能完成导入
  })

  it('setConfig 持久化配置并重启调度（enabled=true 时）', () => {
    const importer = new BackgroundImporter()
    const cfg = importer.setConfig({ enabled: true, targetFolderId: 'f1', intervalMinutes: 5 })
    expect(cfg.enabled).toBe(true)
    expect(cfg.intervalMinutes).toBe(5)
    // 配置文件已写入
    const p = join(userData, 'bg-import-config.json')
    expect(existsSync(p)).toBe(true)
    const saved = JSON.parse(readFileSync(p, 'utf-8'))
    expect(saved.targetFolderId).toBe('f1')
    // 调度已启动 → nextRunAt 被设置
    expect(importer.getStatus().nextRunAt).toBeTruthy()
  })

  it('loadConfig 读取已存在配置', () => {
    const p = join(userData, 'bg-import-config.json')
    const { writeFileSync } = require('fs')
    writeFileSync(p, JSON.stringify({ enabled: true, targetFolderId: 'f9', intervalMinutes: 99 }), 'utf-8')
    const importer = new BackgroundImporter()
    importer.loadConfig()
    expect(importer.getConfig()).toMatchObject({ enabled: true, targetFolderId: 'f9', intervalMinutes: 99 })
  })

  it('stop 清理定时器并清空 nextRunAt', () => {
    const importer = new BackgroundImporter()
    importer.setConfig({ enabled: true, targetFolderId: 'f1' })
    expect(importer.getStatus().nextRunAt).toBeTruthy()
    importer.stop()
    expect(importer.getStatus().nextRunAt).toBeNull()
  })
})