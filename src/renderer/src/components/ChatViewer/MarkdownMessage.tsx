import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Lazy-loaded markdown renderer.
 * react-markdown + remark-gfm are heavy (~370KB chunk); keeping them in a separate
 * module lets ChatViewer code-split them away from the first-paint path.
 */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: ({ node: _node, className, children, ...props }) => (
          <code className={`px-1 py-0.5 rounded text-xs ${className ?? ''}`} {...props}>
            {children}
          </code>
        ),
        pre: ({ node: _node, children, ...props }) => (
          <pre
            className="bg-bg-primary dark:bg-black/40 rounded-md p-3 overflow-x-auto my-2 text-xs"
            {...props}
          >
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
