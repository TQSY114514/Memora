import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { logger } from '../logger'

/**
 * 共享 IPC 处理器包装：统一 try/catch + 日志
 * 
 * 所有 ipcMain.handle 调用都应通过此函数注册，
 * 确保异常被捕获并记录，未处理异常不会导致进程崩溃。
 */
export function safeHandle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => any
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      logger.error(`[IPC] ${channel} failed`, { error: String(err) })
      throw err  // Electron 会传给 renderer 的 reject
    }
  })
}
