import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  getDefaultSyncConfig,
  testCloudConnection,
  performSync,
  uploadToCloud,
  downloadFromCloud,
  listCloudFiles,
  deleteCloudFile,
  type CloudSyncConfig
} from '../../../sync/cloudSync'

let syncConfig: CloudSyncConfig = getDefaultSyncConfig()

export function registerSyncHandlers(): void {
  // 获取/设置同步配置
  safeHandle(IPC.SYNC_CONFIG_GET, () => {
    return syncConfig
  })

  safeHandle(IPC.SYNC_CONFIG_SET, (_e, config: Partial<CloudSyncConfig>) => {
    syncConfig = { ...syncConfig, ...config }
    return syncConfig
  })

  // 测试连接
  safeHandle(IPC.SYNC_TEST_CONNECTION, async (_e) => {
    return testCloudConnection(syncConfig)
  })

  // 上传
  safeHandle(IPC.SYNC_UPLOAD, async (_e, key: string, data: string) => {
    return uploadToCloud(syncConfig, key, data)
  })

  // 下载
  safeHandle(IPC.SYNC_DOWNLOAD, async (_e, key: string) => {
    return downloadFromCloud(syncConfig, key)
  })

  // 列出云端文件
  safeHandle(IPC.SYNC_LIST_FILES, async (_e) => {
    return listCloudFiles(syncConfig)
  })

  // 删除云端文件
  safeHandle(IPC.SYNC_DELETE_FILE, async (_e, key: string) => {
    return deleteCloudFile(syncConfig, key)
  })

  // 执行全量同步
  safeHandle(IPC.SYNC_PERFORM, async (_e, localData: Record<string, string>) => {
    return performSync(syncConfig, localData)
  })
}