import { useEffect, useState } from 'react'
import type { DistillationTemplate, DistillationOutputFormat } from '@shared/types'

interface DistillationTemplatesProps {
  onClose: () => void
}

const OUTPUT_FORMAT_LABEL: Record<DistillationOutputFormat, string> = {
  json: 'JSON',
  markdown: 'Markdown',
  text: 'Text'
}

interface EditorState {
  /** 编辑模式：'create' 新建 / 'edit' 编辑现有 / 'view' 仅查看（内置模板） */
  mode: 'create' | 'edit' | 'view'
  /** 编辑中的模板 ID（create 时为 null） */
  id: string | null
  /** 原始模板（view 模式下用于"另存为副本"） */
  source?: DistillationTemplate
  name: string
  description: string
  systemPrompt: string
  outputFormat: DistillationOutputFormat
}

/** 空白编辑器状态 */
function blankEditor(): EditorState {
  return {
    mode: 'create',
    id: null,
    name: '',
    description: '',
    systemPrompt: '',
    outputFormat: 'json'
  }
}

/**
 * 蒸馏模板管理器（v1.9 自定义蒸馏模板）
 *
 * 功能：
 * - 列出全部模板（内置 + 自定义）为卡片
 * - 新建 / 编辑 / 删除自定义模板
 * - 内置模板可查看，编辑时转为"另存为副本"
 * - 编辑器：名称、描述、输出格式、system prompt（大文本框）、预览
 */
export function DistillationTemplates({ onClose }: DistillationTemplatesProps) {
  const [templates, setTemplates] = useState<DistillationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    try {
      const list = await window.Memora.distillation.list()
      setTemplates(list)
    } catch (e) {
      console.warn('[DistillationTemplates] 加载失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  function openCreate() {
    setErrorMsg(null)
    setEditor(blankEditor())
  }

  function openEdit(tpl: DistillationTemplate) {
    setErrorMsg(null)
    // 内置模板：以 view 模式打开，编辑后转为副本
    setEditor({
      mode: tpl.isBuiltin ? 'view' : 'edit',
      id: tpl.id,
      source: tpl,
      name: tpl.name,
      description: tpl.description ?? '',
      systemPrompt: tpl.systemPrompt,
      outputFormat: tpl.outputFormat
    })
  }

  /** view 模式下点击编辑 → 转为新建副本 */
  function convertToCopy() {
    if (!editor) return
    setEditor({
      ...editor,
      mode: 'create',
      id: null,
      name: `${editor.name} (副本)`,
      source: undefined
    })
  }

  async function handleSave() {
    if (!editor) return
    if (!editor.name.trim()) {
      setErrorMsg('请填写模板名称')
      return
    }
    if (!editor.systemPrompt.trim()) {
      setErrorMsg('请填写 System Prompt')
      return
    }
    setSaving(true)
    setErrorMsg(null)
    try {
      if (editor.mode === 'create') {
        await window.Memora.distillation.create({
          name: editor.name.trim(),
          description: editor.description.trim() || undefined,
          systemPrompt: editor.systemPrompt,
          outputFormat: editor.outputFormat
        })
      } else if (editor.mode === 'edit' && editor.id) {
        await window.Memora.distillation.update(editor.id, {
          name: editor.name.trim(),
          description: editor.description.trim() || undefined,
          systemPrompt: editor.systemPrompt,
          outputFormat: editor.outputFormat
        })
      }
      setEditor(null)
      await reload()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(tpl: DistillationTemplate) {
    if (tpl.isBuiltin) return
    if (!confirm(`确定删除模板「${tpl.name}」？`)) return
    try {
      await window.Memora.distillation.delete(tpl.id)
      await reload()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-[760px] max-w-[92vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">蒸馏模板</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              自定义记忆蒸馏的 System Prompt，选择不同模板生成不同结构的总结
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openCreate} className="Memora-btn Memora-btn-primary text-xs">
              + 新建模板
            </button>
            <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
              ✕
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {errorMsg && !editor && (
          <div className="px-6 pt-3">
            <p className="text-xs text-red-500">✗ {errorMsg}</p>
          </div>
        )}

        {/* 列表区 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-fg-muted text-center py-8">加载中…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-fg-muted text-center py-8">暂无模板</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="border border-border rounded-lg p-4 hover:border-accent/40 transition-colors bg-bg-secondary/40"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-fg-primary">{tpl.name}</h3>
                        {tpl.isBuiltin && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/15 text-accent font-medium">
                            内置
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-bg-hover text-fg-secondary font-medium">
                          {OUTPUT_FORMAT_LABEL[tpl.outputFormat]}
                        </span>
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-fg-muted mt-1">{tpl.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(tpl)}
                        className="Memora-btn Memora-btn-ghost text-xs"
                        title={tpl.isBuiltin ? '查看 / 另存为副本' : '编辑'}
                      >
                        {tpl.isBuiltin ? '👁 查看' : '✎ 编辑'}
                      </button>
                      {!tpl.isBuiltin && (
                        <button
                          onClick={() => handleDelete(tpl)}
                          className="Memora-btn Memora-btn-ghost text-xs text-red-500"
                          title="删除"
                        >
                          🗑 删除
                        </button>
                      )}
                    </div>
                  </div>
                  {/* System Prompt 预览（截断） */}
                  <pre className="text-[11px] text-fg-muted mt-2 bg-bg-tertiary/50 rounded p-2 max-h-24 overflow-hidden whitespace-pre-wrap break-all">
                    {tpl.systemPrompt.slice(0, 200)}
                    {tpl.systemPrompt.length > 200 ? '…' : ''}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="Memora-btn Memora-btn-primary text-sm">
            关闭
          </button>
        </div>

        {/* 编辑器弹层 */}
        {editor && (
          <EditorModal
            editor={editor}
            setEditor={setEditor}
            saving={saving}
            errorMsg={errorMsg}
            onSave={handleSave}
            onCancel={() => setEditor(null)}
            onConvertToCopy={convertToCopy}
          />
        )}
      </div>
    </div>
  )
}

/** 编辑器弹层（新建 / 编辑 / 查看） */
function EditorModal({
  editor,
  setEditor,
  saving,
  errorMsg,
  onSave,
  onCancel,
  onConvertToCopy
}: {
  editor: EditorState
  setEditor: (e: EditorState | null) => void
  saving: boolean
  errorMsg: string | null
  onSave: () => void
  onCancel: () => void
  onConvertToCopy: () => void
}) {
  const isView = editor.mode === 'view'
  const title = isView
    ? '查看模板'
    : editor.mode === 'create'
    ? editor.source
      ? '另存为副本'
      : '新建模板'
    : '编辑模板'

  return (
    <div
      className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl"
      onClick={onCancel}
    >
      <div
        className="bg-bg-primary border border-border rounded-lg shadow-2xl w-[680px] max-w-[90%] max-h-[85%] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onCancel} className="Memora-btn Memora-btn-ghost text-xs">
            ✕
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">名称</label>
            <input
              type="text"
              value={editor.name}
              disabled={isView}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              className="Memora-input w-full text-sm"
              placeholder="如：技术决策模板"
            />
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">描述（可选）</label>
            <input
              type="text"
              value={editor.description}
              disabled={isView}
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
              className="Memora-input w-full text-sm"
              placeholder="模板用途说明"
            />
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">输出格式</label>
            <select
              value={editor.outputFormat}
              disabled={isView}
              onChange={(e) =>
                setEditor({ ...editor, outputFormat: e.target.value as DistillationOutputFormat })
              }
              className="Memora-input w-full text-sm"
            >
              <option value="json">JSON（结构化，可解析为字段）</option>
              <option value="markdown">Markdown（自由文本）</option>
              <option value="text">Text（纯文本）</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">System Prompt</label>
            <textarea
              value={editor.systemPrompt}
              disabled={isView}
              onChange={(e) => setEditor({ ...editor, systemPrompt: e.target.value })}
              className="Memora-input w-full text-xs font-mono"
              rows={14}
              placeholder="输入蒸馏用的 System Prompt…"
            />
            <p className="text-[10px] text-fg-muted mt-1">
              提示：JSON 输出格式需保持与默认模板一致的字段（summary/keyPoints/todos/knowledge/suggestedTags/preferences），否则解析会降级为空数组。
            </p>
          </div>
          {errorMsg && <p className="text-xs text-red-500">✗ {errorMsg}</p>}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          {isView ? (
            <span className="text-[11px] text-fg-muted">内置模板不可直接修改，可另存为副本后编辑</span>
          ) : (
            <span className="text-[11px] text-fg-muted">
              {editor.mode === 'create' ? '将创建为自定义模板' : '修改将立即生效'}
            </span>
          )}
          <div className="flex items-center gap-2">
            {isView && (
              <button onClick={onConvertToCopy} className="Memora-btn Memora-btn-ghost text-xs">
                📋 另存为副本
              </button>
            )}
            {!isView && (
              <button
                onClick={onSave}
                disabled={saving}
                className="Memora-btn Memora-btn-primary text-xs"
              >
                {saving ? '⏳ 保存中…' : '保存'}
              </button>
            )}
            <button onClick={onCancel} className="Memora-btn Memora-btn-ghost text-xs">
              {isView ? '关闭' : '取消'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
