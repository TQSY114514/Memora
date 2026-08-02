import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  createTimeCapsule,
  unlockCapsule,
  checkDueCapsules,
  type TimeCapsule,
  type CapsuleCreateInput
} from '../../../capsule/timeCapsule'

// 内存中存储胶囊（生产环境应持久化到数据库）
const capsules: TimeCapsule[] = []

export function registerCapsuleHandlers(): void {
  // 创建胶囊
  safeHandle(IPC.CAPSULE_CREATE, (_e, input: CapsuleCreateInput) => {
    const capsule = createTimeCapsule(input)
    capsules.push(capsule)
    return capsule
  })

  // 列出所有胶囊
  safeHandle(IPC.CAPSULE_LIST, () => {
    return capsules
  })

  // 解锁胶囊
  safeHandle(IPC.CAPSULE_UNLOCK, (_e, capsuleId: string, password: string) => {
    const capsule = capsules.find(c => c.id === capsuleId)
    if (!capsule) {
      return { success: false, error: '胶囊不存在' }
    }
    const result = unlockCapsule(capsule, password)
    if (result.success) {
      capsule.unlocked = true
      capsule.unlockedAt = new Date().toISOString()
    }
    return result
  })

  // 检查到期胶囊
  safeHandle(IPC.CAPSULE_CHECK_DUE, () => {
    return checkDueCapsules(capsules)
  })

  // 删除胶囊
  safeHandle(IPC.CAPSULE_DELETE, (_e, capsuleId: string) => {
    const idx = capsules.findIndex(c => c.id === capsuleId)
    if (idx === -1) return false
    capsules.splice(idx, 1)
    return true
  })
}