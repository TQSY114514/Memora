import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import { backgroundImporter } from '@importer/backgroundImporter'
import { getAllApiKeys, setApiKey, deleteApiKey, isPlaintextFallback } from '../../secretStore'

export function registerBgImportHandlers(): void {
  // ===== API Key 安全存储（safeStorage 加密，renderer 不接触明文存储） =====
  safeHandle(IPC.SECRET_GET_ALL, () => getAllApiKeys())
  safeHandle(IPC.SECRET_SET, (_e, provider: string, key: string) => setApiKey(provider, key))
  safeHandle(IPC.SECRET_DELETE, (_e, provider: string) => deleteApiKey(provider))
  /** 返回加密存储是否可用（false 表示明文降级，UI 应警告用户） */
  safeHandle(IPC.SECRET_ENCRYPTION_AVAILABLE, () => !isPlaintextFallback())

  // ===== 后台静默导入（P3） =====
  safeHandle(IPC.IMPORT_BG_CONFIG_GET, () => backgroundImporter.getConfig())
  safeHandle(IPC.IMPORT_BG_CONFIG_SET, (_e, patch) => backgroundImporter.setConfig(patch))
  safeHandle(IPC.IMPORT_BG_STATUS, () => backgroundImporter.getStatus())
  safeHandle(IPC.IMPORT_BG_START, () => {
    backgroundImporter.start()
    return true
  })
  safeHandle(IPC.IMPORT_BG_STOP, () => {
    backgroundImporter.stop()
    return true
  })
  safeHandle(IPC.IMPORT_BG_RUN_ONCE, () => backgroundImporter.runOnce())
}
