import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Lazy-loaded markdown renderer.
 * react-markdown + remark-gfm are heavy (~370KB chunk); keeping them in a separate
 * module lets ChatViewer code-split them away from the first-paint path.
 *
 * 排版完全交给 .Memora-md（styles/index.css 手写的 markdown 排版），
 * 这里只保留语义化元素与横向溢出控制。
 */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ node: _node, children, ...props }) => (
          <pre className="overflow-x-auto" {...props}>
            {children}
          </pre>
        )
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default MarkdownMessage
