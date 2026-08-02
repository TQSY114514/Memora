import { app } from 'electron'
import { safeHandle, assertSafePath, assertSafePaths, assertSafeId } from '../safeHandle'
import { existsSync } from 'fs'
import { IPC } from '@shared/constants'
import { importFile, importDirectory, importExtractedSessions } from '@importer/service'
import { scanDirectories } from '@importer/scanner'
import { detectInstalledApps } from '@importer/appDetector'
import { extractLocal } from '@importer/localExtractor'
import { z } from 'zod'

/** 安全获取 Electron 系统目录（目录不存在时返回 null） */
function safeGetPath(name: 'downloads' | 'documents' | 'desktop'): string | null {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}

export function registerImportHandlers(): void {
  // ===== Importer（大文件流式 + 进度推送） =====
  // 安全：所有接受路径的 IPC 通道均经 assertSafePath 白名单校验，
  // 防止被攻破的渲染进程通过任意路径读取/写入主进程可达文件。
  safeHandle(
    IPC.IMPORT_FILE,
    (e, filePath: string, options?: { folderId?: string }) => {
      const safePath = assertSafePath(filePath, 'filePath')
      return importFile(safePath, {
        folderId: options?.folderId,
        onProgress: (loaded, total) => {
          // 推送进度到渲染进程（非阻塞）
          e.sender.send(IPC.IMPORT_PROGRESS, { filePath: safePath, loaded, total })
        }
      })
    }
  )
  safeHandle(
    IPC.IMPORT_FILES,
    (e, filePaths: string[], options?: { folderId?: string }) => {
      const safePaths = assertSafePaths(filePaths, 'filePaths')
      const aggregated = { imported: 0, skipped: 0, failed: 0, errors: [] as string[], sessionIds: [] as string[] }
      for (const p of safePaths) {
        const r = importFile(p, {
          folderId: options?.folderId,
          onProgress: (loaded, total) => {
            e.sender.send(IPC.IMPORT_PROGRESS, { filePath: p, loaded, total })
          }
        })
        aggregated.imported += r.imported
        aggregated.skipped += r.skipped
        aggregated.failed += r.failed
        aggregated.sessionIds.push(...r.sessionIds)
        if (r.errors.length) aggregated.errors.push(`${p}: ${r.errors.join('; ')}`)
      }
      return aggregated
    }
  )
  safeHandle(
    IPC.IMPORT_DIRECTORY,
    (_e, dirPath: string, options?: { folderId?: string }) => {
      const safeDir = assertSafePath(dirPath, 'dirPath')
      return importDirectory(safeDir, options)
    }
  )

  // ===== 扫描器（智能导入中心） =====
  // 安全：默认仅扫描 Downloads / Documents / Desktop，且由用户主动触发
  safeHandle(IPC.SCANNER_GET_DEFAULT_DIRS, () => {
    const candidates = [
      safeGetPath('downloads'),
      safeGetPath('documents'),
      safeGetPath('desktop')
    ].filter((p): p is string => !!p)
    const uniq = Array.from(new Set(candidates))
    return uniq.filter((p) => {
      try {
        return existsSync(p)
      } catch {
        return false
      }
    })
  })

  safeHandle(
    IPC.SCANNER_SCAN,
    (_e, dirs: string[], options?: { maxDepth?: number; maxFiles?: number }) => {
      const safeDirs = assertSafePaths(dirs, 'dirs')
      return scanDirectories(safeDirs, options)
    }
  )

  // ===== AI 应用检测 + 本地扒取 =====
  safeHandle(IPC.DETECT_APPS, () => detectInstalledApps())

  // 安全：EXTRACT_APP 不信任渲染端传入的 dataPath（可能来自被攻破的渲染进程），
  // 改为主进程重新调用 detectInstalledApps()，按 provider 匹配已检测到的固定数据路径。
  // 这样即使渲染端传入任意路径，主进程也只会读取自己检测到的 AI 应用数据目录。
  safeHandle(
    IPC.EXTRACT_APP,
    (_e, provider: string, _dataPath: string, options?: { maxSessions?: number }) => {
      const safeProvider = z.string().trim().min(1).max(50).parse(provider)
      const detected = detectInstalledApps()
      const match = detected.find((a) => a.provider === safeProvider && a.dataPath)
      if (!match || !match.dataPath) {
        throw new Error(`[IPC] 未检测到 ${safeProvider} 的可扒取数据路径`)
      }
      const opts = options ? { maxSessions: z.number().int().min(1).max(10000).optional().parse(options.maxSessions) } : undefined
      return extractLocal(safeProvider as any, match.dataPath, opts)
    }
  )

  // 导入已扒取的对话（内存中，可编辑标题/来源）
  // 安全：用 Zod 校验 sessions 数组结构，防止畸形数据注入
  const extractedSessionSchema = z.object({
    id: z.string().min(1).max(128).optional(),
    provider: z.string().min(1).max(50),
    title: z.string().min(1).max(500),
    source: z.string().max(200).optional(),
    messageCount: z.number().int().min(0).optional(),
    createdAt: z.string().max(50).optional(),
    updatedAt: z.string().max(50).optional(),
    messages: z.array(z.object({
      role: z.string().min(1).max(20),
      content: z.string().max(500000),
      createdAt: z.string().max(50).optional()
    })).max(10000)
  }).strict()

  safeHandle(
    IPC.IMPORT_EXTRACTED,
    (_e, sessions: unknown[], options?: { folderId?: string }) => {
      const parsed = z.array(extractedSessionSchema).max(1000).parse(sessions)
      const folderId = options?.folderId ? assertSafeId(options.folderId, 'folderId') : undefined
      return importExtractedSessions(parsed as any, { folderId })
    }
  )
}
