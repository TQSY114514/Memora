import { safeHandle, assertSafeId } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  listDistillationTemplates,
  getDistillationTemplate,
  createDistillationTemplate,
  updateDistillationTemplate,
  deleteDistillationTemplate
} from '@db/repositories'

/** 蒸馏模板 IPC 处理器（v1.9 自定义蒸馏模板） */
export function registerDistillationHandlers(): void {
  safeHandle(IPC.DISTILL_LIST, () => {
    return listDistillationTemplates()
  })

  safeHandle(IPC.DISTILL_GET, (_e, id: string) => {
    return getDistillationTemplate(assertSafeId(id, 'id'))
  })

  safeHandle(
    IPC.DISTILL_CREATE,
    (_e, input: Parameters<typeof createDistillationTemplate>[0]) => {
      if (!input || typeof input.name !== 'string' || typeof input.systemPrompt !== 'string') {
        throw new Error('[IPC] 非法模板输入：name 和 systemPrompt 必填')
      }
      return createDistillationTemplate(input)
    }
  )

  safeHandle(
    IPC.DISTILL_UPDATE,
    (_e, id: string, patch: Parameters<typeof updateDistillationTemplate>[1]) => {
      return updateDistillationTemplate(assertSafeId(id, 'id'), patch ?? {})
    }
  )

  safeHandle(IPC.DISTILL_DELETE, (_e, id: string) => {
    deleteDistillationTemplate(assertSafeId(id, 'id'))
  })
}
