/**
 * AI 迁移向导
 *
 * 三步迁移流程 + 多平台双向同步。
 * 帮助用户从其他 AI 工具迁移到 Memora，或保持双向同步。
 */

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

/** 支持的平台列表 */
const SUPPORTED_PLATFORMS: PlatformInfo[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: 'chatgpt',
    installed: false,
    dataPath: '',
    sessionCount: 0,
    formats: ['json'],
    supportsSync: false
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: 'claude',
    installed: false,
    dataPath: '',
    sessionCount: 0,
    formats: ['json'],
    supportsSync: false
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: 'cursor',
    installed: false,
    dataPath: '',
    sessionCount: 0,
    formats: ['json'],
    supportsSync: false
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    icon: 'opencode',
    installed: false,
    dataPath: '',
    sessionCount: 0,
    formats: ['json'],
    supportsSync: false
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'deepseek',
    installed: false,
    dataPath: '',
    sessionCount: 0,
    formats: ['json'],
    supportsSync: false
  },
  {
    id: 'kimi',
    name: 'Kimi',
    icon: 'kimi',
    installed: false,
    dataPath: '',
    sessionCount: 0,
    formats: ['json'],
    supportsSync: false
  },
  {
    id: 'tongyi',
    name: '通义千问',
    icon: 'tongyi',
    installed: false,
    dataPath: '',
    sessionCount: 0,
    formats: ['json'],
    supportsSync: false
  }
]

/** 获取支持的平台列表 */
export function getSupportedPlatforms(): PlatformInfo[] {
  return SUPPORTED_PLATFORMS
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