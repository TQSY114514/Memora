import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import { logger } from './logger'

/**
 * 初始化自动更新检查
 * - 启动后 10 秒检查更新
 * - 发现新版本时弹窗提示用户
 * - 用户确认后下载并安装
 * - 下载完成后提示重启
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Configure autoUpdater
  autoUpdater.autoDownload = false  // Don't auto-download, ask user first
  autoUpdater.autoInstallOnAppQuit = true  // Install on quit if downloaded

  autoUpdater.on('update-available', (info) => {
    logger.info('Update available', { version: info.version })
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `Memora ${info.version} 已发布`,
      detail: '是否立即下载更新？',
      buttons: ['下载更新', '稍后提醒'],
      noLink: true
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate()
      }
    })
  })

  autoUpdater.on('update-not-available', () => {
    logger.info('Update not available - running latest version')
  })

  autoUpdater.on('download-progress', (progress) => {
    // Send progress to renderer
    mainWindow.webContents.send('update-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    logger.info('Update downloaded')
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下载',
      message: '更新已下载完成，是否立即重启以应用更新？',
      buttons: ['立即重启', '稍后'],
      noLink: true
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    logger.error('Auto updater error', { error: String(err) })
  })

  // Check for updates 10 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('Update check failed', { error: String(err) })
    })
  }, 10_000)
}
