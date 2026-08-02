import { safeHandle } from '../safeHandle'
import { IPC } from '@shared/constants'
import {
  listTemplates,
  getTemplate,
  exportTemplate,
  importTemplate,
  filterByCategory,
  searchTemplates
} from '../../../templates/templateMarket'

export function registerTemplateHandlers(): void {
  // 列出模板
  safeHandle(IPC.TEMPLATE_LIST, () => {
    return listTemplates()
  })

  // 获取模板详情
  safeHandle(IPC.TEMPLATE_GET, (_e, id: string) => {
    return getTemplate(id)
  })

  // 导出模板
  safeHandle(IPC.TEMPLATE_EXPORT, (_e, id: string) => {
    const template = getTemplate(id)
    if (!template) return null
    return exportTemplate(template)
  })

  // 导入模板
  safeHandle(IPC.TEMPLATE_IMPORT, (_e, json: string) => {
    return importTemplate(json)
  })

  // 按分类过滤
  safeHandle(IPC.TEMPLATE_FILTER, (_e, category: string) => {
    const templates = listTemplates()
    return filterByCategory(templates, category)
  })

  // 搜索模板
  safeHandle(IPC.TEMPLATE_SEARCH, (_e, query: string) => {
    const templates = listTemplates()
    return searchTemplates(templates, query)
  })
}