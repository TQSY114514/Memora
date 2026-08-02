import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  getSupportedPlatforms,
  getDefaultMigrationConfig,
  getStepLabel,
  getStepDescription,
  formatDuration,
  type MigrationStep
} from '../../../migration/migrationWizard'

export function registerMigrationHandlers(): void {
  // 获取支持的平台
  safeHandle(IPC.MIGRATION_PLATFORMS, () => {
    return getSupportedPlatforms()
  })

  // 获取默认配置
  safeHandle(IPC.MIGRATION_DEFAULT_CONFIG, () => {
    return getDefaultMigrationConfig()
  })

  // 获取步骤标签
  safeHandle(IPC.MIGRATION_STEP_LABEL, (_e, step: MigrationStep) => {
    return getStepLabel(step)
  })

  // 获取步骤描述
  safeHandle(IPC.MIGRATION_STEP_DESC, (_e, step: MigrationStep) => {
    return getStepDescription(step)
  })

  // 格式化持续时间
  safeHandle(IPC.MIGRATION_FORMAT_DURATION, (_e, ms: number) => {
    return formatDuration(ms)
  })
}