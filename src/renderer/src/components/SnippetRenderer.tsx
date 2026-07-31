import { Fragment } from 'react'

/**
 * 安全渲染搜索高亮片段
 *
 * 主进程的 `buildSnippet` 先 `escapeHtml` 再添加 `<mark>` 标签，
 * 因此 snippet 中唯一的 HTML 是 `<mark></mark>`，其余内容均已转义。
 * 本组件将 `<mark>` 解析为 React `<mark>` 元素，避免使用 `dangerouslySetInnerHTML`。
 */
export function SnippetRenderer({ html }: { html: string }) {
  if (!html) return null

  const parts = html.split(/(<mark>|<\/mark>)/g)
  const elements: React.ReactNode[] = []
  let inMark = false
  let key = 0

  for (const part of parts) {
    if (part === '<mark>') {
      inMark = true
    } else if (part === '</mark>') {
      inMark = false
    } else if (part) {
      elements.push(
        inMark ? <mark key={key}>{part}</mark> : <Fragment key={key}>{part}</Fragment>
      )
      key++
    }
  }

  return <>{elements}</>
}