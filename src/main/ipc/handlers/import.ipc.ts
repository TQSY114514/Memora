import { app } from 'electron'
import { safeHandle } from '../safeHandle'
import { existsSync } from 'fs'
import { IPC } from '@shared/constants'
import { importFile, importDirectory, importExtractedSessions } from '@importer/service'
import { scanDirectories } from '@importer/scanner'
import { detectInstalledApps } from '@importer/appDetector'
import { extractLocal } from '@importer/localExtractor'

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
  safeHandle(
    IPC.IMPORT_FILE,
    (e, filePath: string, options?: { folderId?: string }) =>
      importFile(filePath, {
        folderId: options?.folderId,
        onProgress: (loaded, total) => {
          // 推送进度到渲染进程（非阻塞）
          e.sender.send(IPC.IMPORT_PROGRESS, { filePath, loaded, total })
        }
      })
  )
  safeHandle(
    IPC.IMPORT_FILES,
    (e, filePaths: string[], options?: { folderId?: string }) => {
      const aggregated = { imported: 0, skipped: 0, failed: 0, errors: [] as string[], sessionIds: [] as string[] }
      for (const p of filePaths) {
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
    (_e, dirPath: string, options?: { folderId?: string }) => importDirectory(dirPath, options)
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
      return scanDirectories(dirs, options)
    }
  )

  // ===== AI 应用检测 + 本地扒取 =====
  safeHandle(IPC.DETECT_APPS, () => detectInstalledApps())

  safeHandle(
    IPC.EXTRACT_APP,
    (_e, provider: string, dataPath: string, options?: { maxSessions?: number }) => {
      return extractLocal(provider as any, dataPath, options)
    }
  )

  // 导入已扒取的对话（内存中，可编辑标题/来源）
  safeHandle(
    IPC.IMPORT_EXTRACTED,
    (_e, sessions: any[], options?: { folderId?: string }) => {
      return importExtractedSessions(sessions, options)
    }
  )
}
