/**
 * AI 迁移向导 v2.0
 *
 * 三步迁移流程 + 多平台双向同步 + 本机平台自动检测。
 * 帮助用户从其他 AI 工具迁移到 Memora，或保持双向同步。
 *
 * v2.0: 新增平台自动检测 — 扫描本机已知路径，发现已安装的 AI 工具
 */

import { existsSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** 迁移步骤 */
export type MigrationStep = 'detect' | 'select' | 'migrate'

/** 平台信息 */
export interface PlatformInfo {
  id: string
  name: string
  /** 平台图标 */
  icon: string
  /** 是否已安装 */
  installed: boolean
  /** 数据路径 */
  dataPath: string
  /** 可导入的会话数 */
  sessionCount: number
  /** 支持的导入格式 */
  formats: string[]
  /** 是否支持双向同步 */
  supportsSync: boolean
}

/** 迁移配置 */
export interface MigrationConfig {
  /** 选中的平台 */
  selectedPlatforms: string[]
  /** 是否包含已归档的对话 */
  includeArchived: boolean
  /** 日期范围 */
  dateRange: { start: string; end: string } | null
  /** 目标工作区 */
  targetWorkspaceId: string
  /** 是否启用双向同步 */
  enableSync: boolean
  /** 同步方向 */
  syncDirection: 'import' | 'export' | 'bidirectional'
}

/** 迁移进度 */
export interface MigrationProgress {
  step: MigrationStep
  currentPlatform: string
  totalPlatforms: number
  platformIndex: number
  currentFile: string
  totalFiles: number
  fileIndex: number
  /** 百分比 */
  percent: number
  /** 已导入会话数 */
  importedSessions: number
  /** 已跳过会话数 */
  skippedSessions: number
  /** 失败数 */
  failedSessions: number
  /** 是否完成 */
  done: boolean
}

/** 迁移结果 */
export interface MigrationResult {
  platforms: Array<{
    name: string
    total: number
    imported: number
    skipped: number
    failed: number
  }>
  totalImported: number
  totalSkipped: number
  totalFailed: number
  duration: number
}

/** 平台检测定义 */
interface PlatformDetection {
  id: string
  name: string
  icon: string
  formats: string[]
  supportsSync: boolean
  /** 已知的安装路径（相对于用户目录） */
  knownPaths: string[]
  /** 检测方法：通过目录存在性 + 文件计数 */
  detectType: 'directory' | 'file' | 'sqlite'
}

/** 平台检测配置 */
const PLATFORM_DETECTIONS: PlatformDetection[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    icon: 'cursor',
    formats: ['internal'],
    supportsSync: false,
    knownPaths: [
      // Windows
      join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
      // macOS
      join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
      // Linux
      join(homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
    ],
    detectType: 'sqlite'
  },
  {
    id: 'claude',
    name: 'Claude Code',
    icon: 'claude',
    formats: ['internal'],
    supportsSync: false,
    knownPaths: [
      join(homedir(), '.claude', 'projects'),
      join(homedir(), 'AppData', 'Roaming', 'Claude', 'projects')
    ],
    detectType: 'directory'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    icon: 'opencode',
    formats: ['internal'],
    supportsSync: false,
    knownPaths: [
      join(homedir(), '.opencode')
    ],
    detectType: 'directory'
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    icon: 'windsurf',
    formats: ['internal'],
    supportsSync: false,
    knownPaths: [
      join(homedir(), '.windsurf', 'projects'),
      join(homedir(), '.codeium', 'windsurf')
    ],
    detectType: 'directory'
  },
  {
    id: 'cline',
    name: 'Cline',
    icon: 'cline',
    formats: ['internal'],
    supportsSync: false,
    knownPaths: [
      // VSCode extension storage
      join(homedir(), '.vscode', 'extensions')
    ],
    detectType: 'directory'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: 'chatgpt',
    formats: ['json'],
    supportsSync: false,
    knownPaths: [],
    detectType: 'directory'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'deepseek',
    formats: ['json'],
    supportsSync: false,
    knownPaths: [],
    detectType: 'directory'
  },
  {
    id: 'kimi',
    name: 'Kimi',
    icon: 'kimi',
    formats: ['json'],
    supportsSync: false,
    knownPaths: [],
    detectType: 'directory'
  },
  {
    id: 'tongyi',
    name: '通义千问',
    icon: 'tongyi',
    formats: ['json'],
    supportsSync: false,
    knownPaths: [],
    detectType: 'directory'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: 'gemini',
    formats: ['json'],
    supportsSync: false,
    knownPaths: [],
    detectType: 'directory'
  },
  {
    id: 'grok',
    name: 'Grok',
    icon: 'grok',
    formats: ['json'],
    supportsSync: false,
    knownPaths: [],
    detectType: 'directory'
  }
]

/** 安全读取目录 */
function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p)
  } catch {
    return []
  }
}

/** 判断是否为目录 */
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 递归统计目录中的文件数（限制深度） */
function countFilesRecursive(dir: string, maxDepth: number = 3, maxFiles: number = 10000): number {
  if (maxDepth <= 0) return 0
  let count = 0
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (count >= maxFiles) break
      const fullPath = join(dir, entry)
      try {
        if (statSync(fullPath).isDirectory()) {
          count += countFilesRecursive(fullPath, maxDepth - 1, maxFiles - count)
        } else {
          count++
        }
      } catch {
        // 跳过无法访问的文件
      }
    }
  } catch {
    // 目录不可读
  }
  return count
}

/** 在目录中计数 JSON/JSONL 文件 */
function countDataFiles(dir: string): number {
  let count = 0
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry.endsWith('.json') || entry.endsWith('.jsonl')) {
        count++
      }
    }
  } catch {
    // 忽略
  }
  return count
}

/** 扫描单个平台的安装状态 */
function detectPlatform(detection: PlatformDetection): PlatformInfo {
  let installed = false
  let dataPath = ''
  let sessionCount = 0

  for (const path of detection.knownPaths) {
    if (detection.detectType === 'sqlite') {
      // SQLite 文件检测
      if (existsSync(path)) {
        installed = true
        dataPath = path
        // 尝试读取会话数
        try {
          const Database = require('better-sqlite3')
          const db = new Database(path, { readonly: true, fileMustExist: true })
          try {
            const row = db.prepare('SELECT COUNT(*) as cnt FROM ItemTable').get() as { cnt: number } | undefined
            sessionCount = row?.cnt ?? 0
          } catch {
            sessionCount = 1 // 至少存在
          } finally {
            db.close()
          }
        } catch {
          sessionCount = 1
        }
        break
      }
    } else if (detection.detectType === 'directory') {
      if (existsSync(path) && isDir(path)) {
        installed = true
        dataPath = path
        // 统计文件/会话数
        if (detection.id === 'claude' || detection.id === 'windsurf') {
          // 项目目录：每个子目录是一个项目，统计 .jsonl 文件
          const subdirs = safeReaddir(path)
          for (const sub of subdirs) {
            const subPath = join(path, sub)
            if (isDir(subPath)) {
              sessionCount += countDataFiles(subPath)
            }
          }
        } else {
          sessionCount = countFilesRecursive(path, 3, 5000)
        }
        break
      }
    }
  }

  return {
    id: detection.id,
    name: detection.name,
    icon: detection.icon,
    installed,
    dataPath,
    sessionCount,
    formats: detection.formats,
    supportsSync: detection.supportsSync
  }
}

/** 获取支持的平台列表（自动检测安装状态） */
export function getSupportedPlatforms(): PlatformInfo[] {
  return PLATFORM_DETECTIONS.map(detectPlatform)
}

/** 仅获取已安装的平台 */
export function getInstalledPlatforms(): PlatformInfo[] {
  return getSupportedPlatforms().filter(p => p.installed && p.sessionCount > 0)
}

/** 获取迁移配置的默认值 */
export function getDefaultMigrationConfig(): MigrationConfig {
  return {
    selectedPlatforms: [],
    includeArchived: false,
    dateRange: null,
    targetWorkspaceId: '',
    enableSync: false,
    syncDirection: 'import'
  }
}

/** 获取迁移步骤对应的标签 */
export function getStepLabel(step: MigrationStep): string {
  switch (step) {
    case 'detect':
      return '检测平台'
    case 'select':
      return '选择数据'
    case 'migrate':
      return '开始迁移'
  }
}

/** 获取迁移步骤对应的描述 */
export function getStepDescription(step: MigrationStep): string {
  switch (step) {
    case 'detect':
      return '正在扫描本机已安装的 AI 工具，检测可导入的对话数据...'
    case 'select':
      return '选择要导入的平台和数据范围，配置迁移选项...'
    case 'migrate':
      return '正在将对话数据导入 Memora，请耐心等待...'
  }
}

/** 格式化迁移持续时间 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}分${remainingSeconds}秒`
}