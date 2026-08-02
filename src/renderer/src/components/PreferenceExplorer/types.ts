import type { PreferenceStatus, PreferenceSource } from '@shared/types'

export const STATUS_META: Record<PreferenceStatus, { label: string; badge: string }> = {
  active: { label: '生效中', badge: 'bg-emerald-500/15 text-emerald-500' },
  superseded: { label: '已取代', badge: 'bg-yellow-500/15 text-yellow-500' },
  archived: { label: '已归档', badge: 'bg-bg-hover text-fg-muted' }
}

export const SOURCE_META: Record<PreferenceSource, string> = {
  manual: '手动',
  conversation: '对话提取',
  mcp: 'MCP',
  inferred: '推断',
  constitution: '宪法'
}

/** 相对时间格式化：今天 / 昨天 / N天前 / N月N日 */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 30) return `${days}天前`
    return `${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return ''
  }
}

/** 置信度对应颜色：>0.7 绿、>0.3 黄、<=0.3 红 */
export function confidenceColor(c: number): string {
  if (c > 0.7) return 'bg-green-500'
  if (c > 0.3) return 'bg-yellow-500'
  return 'bg-red-500'
}
