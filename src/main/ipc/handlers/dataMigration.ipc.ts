import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import { exportData, importData } from '../../dataMigration'

/**
 * 数据迁移 IPC 处理器（v1.7.1）
 * 全量导出/导入工作区（数据库 + AI 配置）为单个归档文件
 */
export function registerDataMigrationHandlers(): void {
  safeHandle(IPC.SYSTEM_EXPORT_DATA, () => exportData())

  safeHandle(IPC.SYSTEM_IMPORT_DATA, () => importData())
}
