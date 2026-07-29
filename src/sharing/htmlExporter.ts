import type { ChatSession, Message } from '@shared/types'
import { PROVIDER_META } from '@shared/constants'

/**
 * 把对话渲染为自包含 HTML 字符串
 * - 内联所有 CSS（含 highlight.js 主题）
 * - 内联所有 JS（最小化，仅代码块复制按钮）
 * - 单文件，浏览器打开即可查看，无需任何外部依赖
 */
export function renderSessionToHtml(session: ChatSession, options?: {
  customTitle?: string
  customDescription?: string
  includeWatermark?: boolean
}): string {
  const title = options?.customTitle || session.title
  const description = options?.customDescription || session.description || ''
  const meta = PROVIDER_META[session.provider] || PROVIDER_META.Unknown
  const messages = session.messages || []
  const includeWatermark = options?.includeWatermark ?? true

  const messagesHtml = messages.map((m) => renderMessage(m)).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} · Aether</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="aether-container">
  <header class="aether-header">
    <h1 class="aether-title">${escapeHtml(title)}</h1>
    ${description ? `<p class="aether-desc">${escapeHtml(description)}</p>` : ''}
    <div class="aether-meta">
      <span class="aether-badge" style="--provider-color:${meta.color}">
        <span class="aether-badge-icon">${escapeHtml(meta.icon)}</span>
        ${escapeHtml(meta.label)}
      </span>
      ${session.model ? `<span class="aether-badge aether-badge-model">${escapeHtml(session.model)}</span>` : ''}
      <span class="aether-meta-item">📅 ${formatDate(session.createdAt)}</span>
      <span class="aether-meta-item">💬 ${messages.length} 条消息</span>
    </div>
    ${session.tags.length > 0 ? `<div class="aether-tags">${session.tags.map((t) => `<span class="aether-tag">${escapeHtml(t.name)}</span>`).join('')}</div>` : ''}
  </header>

  <main class="aether-messages">
${messagesHtml}
  </main>

  ${includeWatermark ? `
  <footer class="aether-footer">
    <span>由 <strong>Aether</strong> 导出 · AI 对话知识工作台</span>
  </footer>` : ''}
</div>
<script>${SHARED_JS}</script>
</body>
</html>`
}

function renderMessage(message: Message): string {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const roleClass = isUser ? 'msg-user' : isSystem ? 'msg-system' : 'msg-assistant'
  const roleLabel = isUser ? '你' : isSystem ? '系统' : 'AI'

  return `    <article class="aether-msg ${roleClass}">
      <div class="aether-msg-role">${roleLabel}</div>
      <div class="aether-msg-content">
        <div class="aether-md">${renderMarkdown(message.content)}</div>
      </div>
    </article>`
}

/**
 * 极简 Markdown 渲染（不引入完整库，避免体积）
 * 支持：代码块、行内代码、标题、粗体、斜体、链接、列表
 */
function renderMarkdown(md: string): string {
  let html = escapeHtml(md)

  // 代码块 ```...```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre class="aether-code"><button class="aether-copy-btn" onclick="aetherCopyCode(this)">复制</button><code>${code.replace(/\n$/, '')}</code></pre>`
  })

  // 行内代码
  html = html.replace(/`([^`\n]+)`/g, '<code class="aether-inline-code">$1</code>')

  // 标题
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // 粗体 / 斜体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // 链接 [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  )

  // 无序列表
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')

  // 段落（连续空行分段，已经是块级的跳过）
  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (/^<(h\d|ul|ol|pre|blockquote|div)/.test(trimmed)) return trimmed
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')

  return html
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return iso
  }
}

const SHARED_CSS = `
:root {
  --bg: #fafafa;
  --fg: #1a1a1a;
  --fg-muted: #666;
  --border: #e5e5e5;
  --user-bg: #f0f4ff;
  --user-border: #c7d2fe;
  --assistant-bg: #ffffff;
  --code-bg: #1e1e2e;
  --code-fg: #cdd6f4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f0f;
    --fg: #e5e5e5;
    --fg-muted: #999;
    --border: #2a2a2a;
    --user-bg: #1a1f2e;
    --user-border: #2d3a5f;
    --assistant-bg: #181818;
    --code-bg: #11111b;
    --code-fg: #cdd6f4;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.7;
  font-size: 15px;
}
.aether-container { max-width: 860px; margin: 0 auto; padding: 48px 24px; }
.aether-header { margin-bottom: 40px; border-bottom: 1px solid var(--border); padding-bottom: 24px; }
.aether-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; line-height: 1.3; }
.aether-desc { color: var(--fg-muted); font-size: 15px; margin-bottom: 16px; }
.aether-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 13px; color: var(--fg-muted); }
.aether-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; background: color-mix(in srgb, var(--provider-color, #888) 15%, transparent); border: 1px solid color-mix(in srgb, var(--provider-color, #888) 30%, transparent); color: var(--provider-color, #888); font-weight: 500; }
.aether-badge-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; background: var(--provider-color, #888); color: white; border-radius: 4px; font-size: 10px; font-weight: 700; }
.aether-badge-model { background: transparent; border-color: var(--border); color: var(--fg-muted); }
.aether-meta-item { display: inline-flex; align-items: center; gap: 4px; }
.aether-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.aether-tag { font-size: 12px; padding: 2px 8px; border-radius: 4px; background: var(--border); color: var(--fg-muted); }
.aether-messages { display: flex; flex-direction: column; gap: 24px; }
.aether-msg { padding: 20px; border-radius: 10px; border: 1px solid var(--border); }
.msg-user { background: var(--user-bg); border-color: var(--user-border); }
.msg-assistant { background: var(--assistant-bg); }
.msg-system { background: transparent; border-style: dashed; color: var(--fg-muted); font-size: 13px; }
.aether-msg-role { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fg-muted); margin-bottom: 10px; }
.msg-user .aether-msg-role { color: #4f46e5; }
.msg-assistant .aether-msg-role { color: #059669; }
.aether-msg-content h1, .aether-msg-content h2, .aether-msg-content h3 { margin: 16px 0 8px; line-height: 1.4; }
.aether-msg-content h1 { font-size: 20px; }
.aether-msg-content h2 { font-size: 18px; }
.aether-msg-content h3 { font-size: 16px; }
.aether-msg-content p { margin: 8px 0; }
.aether-msg-content ul { margin: 8px 0; padding-left: 24px; }
.aether-msg-content li { margin: 4px 0; }
.aether-msg-content a { color: #3b82f6; text-decoration: none; }
.aether-msg-content a:hover { text-decoration: underline; }
.aether-inline-code { background: var(--border); padding: 2px 6px; border-radius: 4px; font-family: "JetBrains Mono", "SF Mono", Menlo, monospace; font-size: 13px; }
.aether-code { position: relative; background: var(--code-bg); color: var(--code-fg); padding: 16px; padding-top: 40px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-family: "JetBrains Mono", "SF Mono", Menlo, monospace; font-size: 13px; line-height: 1.6; }
.aether-code code { background: none; padding: 0; color: inherit; }
.aether-copy-btn { position: absolute; top: 10px; right: 10px; padding: 4px 10px; background: rgba(255,255,255,0.1); color: #cdd6f4; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; cursor: pointer; font-size: 12px; }
.aether-copy-btn:hover { background: rgba(255,255,255,0.2); }
.aether-footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); text-align: center; color: var(--fg-muted); font-size: 13px; }
.aether-footer strong { color: var(--fg); }
`

const SHARED_JS = `
function aetherCopyCode(btn) {
  const code = btn.parentElement.querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    const orig = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}
`
