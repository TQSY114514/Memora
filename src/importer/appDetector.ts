/**
 * AI 应用探测器 —— 检测本机已安装的 AI 客户端软件
 *
 * 检测策略（按可靠度排序）：
 * 1. 检查已知安装目录是否存在（%APPDATA% / %LOCALAPPDATA% / %USERPROFILE%）
 * 2. 检查 PATH 中是否有 CLI 工具（claude / codex 等）
 * 3. 检查 VSCode 扩展目录（通义千问等插件）
 *
 * 不扫描：注册表深度遍历、浏览器 Cookie、用户隐私数据
 * 仅检测「是否安装」+「本地数据路径」，不读取任何对话内容
 */
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import type { Provider, DetectedApp } from '@shared/types'

/** Windows 环境变量根目录 */
const APPDATA = process.env.APPDATA || ''
const LOCALAPPDATA = process.env.LOCALAPPDATA || ''
const USERPROFILE = process.env.USERPROFILE || ''
const HOME = process.env.HOME || USERPROFILE

/** 安全检查路径存在 */
function safeExists(p: string): boolean {
  try {
    return existsSync(p)
  } catch {
    return false
  }
}

/** 安全读取目录（失败返回空数组） */
function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p)
  } catch {
    return []
  }
}

/** 检测 PATH 中是否有某命令（Windows 用 where，Unix 用 which） */
function hasCommand(cmd: string): boolean {
  try {
    const tool = process.platform === 'win32' ? 'where' : 'which'
    execSync(`${tool} ${cmd}`, { stdio: 'ignore', timeout: 3000 })
    return true
  } catch {
    return false
  }
}

/** 查找 VSCode 扩展目录中匹配关键字的扩展 */
function findVscodeExtension(keyword: string): string | null {
  const extDirs = [
    join(HOME, '.vscode', 'extensions'),
    join(USERPROFILE, '.vscode', 'extensions'),
    join(HOME, '.cursor', 'extensions'),
    join(USERPROFILE, '.cursor', 'extensions')
  ]
  for (const dir of extDirs) {
    if (!safeExists(dir)) continue
    const found = safeReaddir(dir).find((n) => n.toLowerCase().includes(keyword))
    if (found) return join(dir, found)
  }
  return null
}

/** Cursor 数据库候选路径（多版本兼容） */
function findCursorDb(): string | null {
  const base = join(APPDATA, 'Cursor', 'User', 'globalStorage')
  if (!safeExists(base)) return null
  // 新版：cursor.cursor/state.vscdb
  const v2 = join(base, 'cursor.cursor', 'state.vscdb')
  if (safeExists(v2)) return v2
  // 旧版：state.vscdb
  const v1 = join(base, 'state.vscdb')
  if (safeExists(v1)) return v1
  return null
}

/** Claude Code 项目日志目录 */
function findClaudeCodeDir(): string | null {
  const dir = join(HOME, '.claude', 'projects')
  if (safeExists(dir)) return dir
  const dir2 = join(USERPROFILE, '.claude', 'projects')
  if (safeExists(dir2)) return dir2
  return null
}

/**
 * 检测所有已安装的 AI 应用
 * 返回顺序：可扒取的在前，云端应用在后，未安装不返回
 */
export function detectInstalledApps(): DetectedApp[] {
  const apps: DetectedApp[] = []

  // ===== Cursor（可扒取：本地 SQLite） =====
  const cursorInstall = join(APPDATA, 'Cursor')
  const cursorDb = findCursorDb()
  apps.push({
    provider: 'Cursor' as Provider,
    name: 'Cursor',
    installed: safeExists(cursorInstall) || !!cursorDb,
    installPath: safeExists(cursorInstall) ? cursorInstall : undefined,
    dataPath: cursorDb || undefined,
    canExtract: !!cursorDb,
    hint: cursorDb
      ? undefined
      : safeExists(cursorInstall)
        ? '已安装，未找到对话数据库（可能版本不兼容）'
        : undefined
  })

  // ===== Claude Code（可扒取：~/.claude/projects 日志） =====
  const claudeCodeDir = findClaudeCodeDir()
  const claudeCodeCmd = hasCommand('claude')
  apps.push({
    provider: 'ClaudeCode' as Provider,
    name: 'Claude Code',
    installed: !!claudeCodeDir || claudeCodeCmd,
    installPath: claudeCodeCmd ? 'claude (CLI)' : undefined,
    dataPath: claudeCodeDir || undefined,
    canExtract: !!claudeCodeDir,
    hint: claudeCodeDir
      ? undefined
      : claudeCodeCmd
        ? 'CLI 已安装，未找到项目日志目录'
        : undefined
  })

  // ===== ChatGPT Desktop（云端，仅检测安装） =====
  const chatgptPaths = [
    join(APPDATA, 'ChatGPT'),
    join(LOCALAPPDATA, 'Programs', 'ChatGPT'),
    join(LOCALAPPDATA, 'chatgpt')
  ]
  const chatgptInstalled = chatgptPaths.some(safeExists)
  apps.push({
    provider: 'ChatGPT' as Provider,
    name: 'ChatGPT Desktop',
    installed: chatgptInstalled,
    installPath: chatgptPaths.find(safeExists),
    canExtract: false,
    hint: chatgptInstalled
      ? '桌面端对话存储在云端，请从 chat.openai.com → Settings → Data export 导出'
      : undefined
  })

  // ===== Claude Desktop（云端，仅检测安装） =====
  const claudePaths = [join(APPDATA, 'Claude'), join(LOCALAPPDATA, 'AnthropicClaude')]
  const claudeInstalled = claudePaths.some(safeExists)
  apps.push({
    provider: 'Claude' as Provider,
    name: 'Claude Desktop',
    installed: claudeInstalled,
    installPath: claudePaths.find(safeExists),
    canExtract: false,
    hint: claudeInstalled
      ? '桌面端对话存储在云端，请从 claude.ai → Settings → Export 导出'
      : undefined
  })

  // ===== 通义千问（VSCode 扩展，检测插件） =====
  const qwenExt = findVscodeExtension('tongyi') || findVscodeExtension('qwen') || findVscodeExtension('alibaba')
  apps.push({
    provider: 'Qwen' as Provider,
    name: '通义千问（VSCode 插件）',
    installed: !!qwenExt,
    installPath: qwenExt || undefined,
    canExtract: false,
    hint: qwenExt
      ? '插件已安装，对话在云端，请从插件内导出'
      : undefined
  })

  // ===== Kimi Desktop（云端，仅检测安装） =====
  const kimiPaths = [join(APPDATA, 'Kimi'), join(LOCALAPPDATA, 'Kimi'), join(LOCALAPPDATA, 'Programs', 'Kimi')]
  const kimiInstalled = kimiPaths.some(safeExists)
  apps.push({
    provider: 'Kimi' as Provider,
    name: 'Kimi',
    installed: kimiInstalled,
    installPath: kimiPaths.find(safeExists),
    canExtract: false,
    hint: kimiInstalled
      ? '对话存储在云端，请从 kimi.com 导出'
      : undefined
  })

  // ===== Codex CLI（检测 PATH） =====
  const codexCmd = hasCommand('codex')
  apps.push({
    provider: 'Codex' as Provider,
    name: 'Codex CLI',
    installed: codexCmd,
    installPath: codexCmd ? 'codex (CLI)' : undefined,
    canExtract: false,
    hint: codexCmd ? 'CLI 工具，对话在云端' : undefined
  })

  // ===== OpenCode（CLI，本地有数据） =====
  const opencodeCmd = hasCommand('opencode')
  const opencodeDir = safeExists(join(HOME, '.opencode')) ? join(HOME, '.opencode')
    : safeExists(join(HOME, '.local', 'share', 'opencode')) ? join(HOME, '.local', 'share', 'opencode')
    : null
  apps.push({
    provider: 'OpenCode' as Provider,
    name: 'OpenCode',
    installed: opencodeCmd || !!opencodeDir,
    installPath: opencodeCmd ? 'opencode (CLI)' : opencodeDir || undefined,
    dataPath: opencodeDir || undefined,
    canExtract: !!opencodeDir,
    hint: opencodeDir
      ? undefined
      : opencodeCmd
        ? 'CLI 已安装，未找到本地数据目录'
        : undefined
  })

  // ===== Windsurf（Codeium IDE，类似 Cursor） =====
  const windsurfInstall = join(APPDATA, 'Windsurf')
  const windsurfDb = (() => {
    const base = join(windsurfInstall, 'User', 'globalStorage')
    if (!safeExists(base)) return null
    return safeExists(join(base, 'state.vscdb')) ? join(base, 'state.vscdb') : null
  })()
  apps.push({
    provider: 'Cursor' as Provider,  // Windsurf 复用 Cursor 的扒取逻辑
    name: 'Windsurf',
    installed: safeExists(windsurfInstall),
    installPath: safeExists(windsurfInstall) ? windsurfInstall : undefined,
    dataPath: windsurfDb || undefined,
    canExtract: !!windsurfDb,
    hint: windsurfDb
      ? undefined
      : safeExists(windsurfInstall)
        ? '已安装，未找到对话数据库'
        : undefined
  })

  // ===== TRAE（字节跳动 AI IDE，对话在云端） =====
  // TRAE SOLO / TRAE SOLO CN 是 VSCode fork，本地 state.vscdb 只存元数据，
  // 对话内容在云端，无法本地扒取
  const traePaths = [
    join(APPDATA, 'TRAE SOLO CN'),
    join(APPDATA, 'TRAE SOLO'),
    join(LOCALAPPDATA, 'TRAE SOLO CN'),
    join(LOCALAPPDATA, 'TRAE SOLO')
  ]
  const traeInstalled = traePaths.find(safeExists)
  apps.push({
    provider: 'TRAE' as Provider,
    name: traeInstalled && traeInstalled.includes('CN') ? 'TRAE SOLO CN' : 'TRAE',
    installed: !!traeInstalled,
    installPath: traeInstalled,
    canExtract: false,
    hint: traeInstalled
      ? '已安装，但 TRAE 的对话内容存储在云端，本地无法直接扒取。请在 TRAE 内手动导出对话后用「扫描文件」导入。'
      : undefined
  })

  // ===== Cline（VSCode 扩展，本地有 SQLite） =====
  const clineExt = findVscodeExtension('cline') || findVscodeExtension('saoudrizwan')
  const clineDb = (() => {
    // Cline 把任务存在 globalStorage 下的 SQLite
    const dirs = [
      join(APPDATA, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev'),
      join(APPDATA, 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev')
    ]
    for (const d of dirs) {
      if (safeExists(d)) {
        const tasks = safeReaddir(d).filter((f) => f.endsWith('.db') || f.endsWith('.sqlite'))
        if (tasks.length > 0) return join(d, tasks[0])
      }
    }
    return null
  })()
  apps.push({
    provider: 'ClaudeCode' as Provider,  // Cline 复用对话扒取
    name: 'Cline（VSCode 扩展）',
    installed: !!clineExt || !!clineDb,
    installPath: clineExt || undefined,
    dataPath: clineDb || undefined,
    canExtract: !!clineDb,
    hint: clineDb ? undefined : clineExt ? '扩展已安装，未找到任务数据库' : undefined
  })

  // ===== Codex CLI（检测 PATH） =====
  // 已有 Codex 检测，保留

    // 仅返回已安装的
  return apps.filter((a) => a.installed)
}
