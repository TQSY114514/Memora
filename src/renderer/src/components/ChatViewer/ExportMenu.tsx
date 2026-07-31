import { useEffect, useRef, useState } from 'react'
import type { ChatSession } from '@shared/types'

/**
 * 导出菜单——把多个导出格式收进一个精致的下拉面板
 *
 * 设计取向：克制的精致感（quiet luxury / editorial）
 * - 弃用 emoji，全部自绘 SVG 图标，线条统一 1.5px
 * - 分组：「归档与分享」(HTML/MD) vs「迁移到其他 AI」(Claude Code)
 * - 玻璃质感背板 + 错峰进场动画 + 精确的排版间距
 * - Claude Code 作为跨平台迁移重点，单独突出
 */
interface ExportMenuProps {
  session: ChatSession
}

type FormatKey = 'html' | 'md' | 'claudeCode'

interface FormatItem {
  key: FormatKey
  title: string
  desc: string
  ext: string
  icon: React.ReactNode
  /** 迁移类（突出显示） */
  accent?: boolean
}

export function ExportMenu({ session }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<FormatKey | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 外部点击 / Esc 关闭
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function runExport(kind: FormatKey) {
    if (busy) return
    setBusy(kind)
    try {
      const safeName = session.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')
      let content: string | null = null
      let ext = ''
      if (kind === 'html') {
        content = await window.Memora.share.exportHtml(session.id)
        ext = 'html'
      } else if (kind === 'md') {
        content = await window.Memora.share.exportMd(session.id)
        ext = 'md'
      } else {
        content = await window.Memora.share.exportClaudeCode(session.id)
        ext = 'jsonl'
      }
      if (!content) return
      await window.Memora.saveFileDialog({ defaultName: `${safeName}.${ext}`, content })
      setOpen(false)
    } finally {
      setBusy(null)
    }
  }

  const items: FormatItem[] = [
    {
      key: 'html',
      title: 'HTML 单文件',
      desc: '自包含，可分享给任何人',
      ext: '.html',
      icon: <IconHtml />
    },
    {
      key: 'md',
      title: 'Markdown',
      desc: '导入 Obsidian / Notion / 语雀',
      ext: '.md',
      icon: <IconMd />
    },
    {
      key: 'claudeCode',
      title: 'Claude Code 对话',
      desc: '迁移：放到 ~/.claude/projects/ 即可',
      ext: '.jsonl',
      icon: <IconClaude />,
      accent: true
    }
  ]

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`export-trigger ${open ? 'is-open' : ''}`}
        title="导出对话"
      >
        <IconDownload />
        <span>导出</span>
        <IconChevron open={open} />
      </button>

      {open && (
        <div className="export-panel" role="menu">
          {/* 分组 1：归档与分享 */}
          <div className="export-group">
            <div className="export-group-label">归档与分享</div>
            {items.slice(0, 2).map((it, i) => (
              <FormatRow
                key={it.key}
                item={it}
                index={i}
                busy={busy === it.key}
                onClick={() => runExport(it.key)}
              />
            ))}
          </div>

          <div className="export-divider" />

          {/* 分组 2：迁移到其他 AI */}
          <div className="export-group">
            <div className="export-group-label">迁移到其他 AI</div>
            {items.slice(2).map((it, i) => (
              <FormatRow
                key={it.key}
                item={it}
                index={i + 2}
                busy={busy === it.key}
                onClick={() => runExport(it.key)}
              />
            ))}
            <div className="export-hint">
              跨平台迁移：将导出的 .jsonl 放入目标软件本地目录，重启后即出现在其历史中
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormatRow({
  item,
  index,
  busy,
  onClick
}: {
  item: FormatItem
  index: number
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`export-row ${item.accent ? 'is-accent' : ''}`}
      style={{ animationDelay: `${60 + index * 45}ms` }}
      onClick={onClick}
      disabled={busy}
      role="menuitem"
    >
      <span className="export-row-icon">{item.icon}</span>
      <span className="export-row-text">
        <span className="export-row-title">
          {item.title}
          <span className="export-row-ext">{item.ext}</span>
        </span>
        <span className="export-row-desc">{item.desc}</span>
      </span>
      {busy && <span className="export-row-spinner" />}
    </button>
  )
}

/* ===== 自绘 SVG 图标（1.5px 线条，统一风格） ===== */

function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'none', opacity: 0.55 }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function IconHtml() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" opacity="0.25" />
      <path d="m9 9-3 3 3 3" />
      <path d="m15 9 3 3-3 3" />
      <path d="M13 8l-2 8" />
    </svg>
  )
}

function IconMd() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" opacity="0.25" />
      <path d="M7 15V9l2.5 3L12 9v6" />
      <path d="M16 9v6" />
      <path d="m14 13 2 2 2-2" />
    </svg>
  )
}

function IconClaude() {
  // Claude Code 迁移：用「箭头跨越边界」表达跨平台流转
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h7" />
      <path d="M8 6l3 3-3 3" />
      <rect x="14" y="4" width="6" height="16" rx="1.2" opacity="0.3" />
      <path d="M14 12h6" opacity="0.6" />
      <path d="M14 15h4" opacity="0.6" />
    </svg>
  )
}
