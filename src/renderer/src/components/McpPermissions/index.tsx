import { useState, useEffect, useCallback } from 'react'
import { useDialog, PromptDialog } from '../PromptDialog'

interface McpPermission {
  id: string
  clientId: string
  clientName: string
  level: string
  allowedTools: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface McpPermissionsPanelProps {
  onClose: () => void
}

const LEVEL_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  readonly: { label: '只读', color: 'bg-blue-500/15 text-blue-500', desc: '只能读取数据，不能修改' },
  write: { label: '可写', color: 'bg-green-500/15 text-green-500', desc: '可以读写数据，但不能删除' },
  full: { label: '完全', color: 'bg-red-500/15 text-red-500', desc: '完全权限，包括删除操作' }
}

const MCP_TOOLS = [
  { name: 'search_sessions', group: '会话', desc: '搜索会话' },
  { name: 'get_session', group: '会话', desc: '获取会话详情' },
  { name: 'list_sessions', group: '会话', desc: '列出会话' },
  { name: 'add_session', group: '会话', desc: '添加会话' },
  { name: 'add_message', group: '会话', desc: '添加消息' },
  { name: 'update_session', group: '会话', desc: '更新会话' },
  { name: 'delete_session', group: '会话', desc: '删除会话' },
  { name: 'get_session_summary', group: '会话', desc: '获取会话摘要' },
  { name: 'summarize_session', group: '会话', desc: '生成会话摘要' },
  { name: 'export_session', group: '会话', desc: '导出会话' },
  { name: 'knowledge_search', group: '知识库', desc: '搜索知识' },
  { name: 'decision_search', group: '知识库', desc: '搜索决策' },
  { name: 'project_context', group: '知识库', desc: '项目上下文' },
  { name: 'knowledge_entry_update', group: '知识库', desc: '更新知识条目' },
  { name: 'knowledge_entry_delete', group: '知识库', desc: '删除知识条目' },
  { name: 'memory_recall', group: '记忆', desc: '回忆记忆' },
  { name: 'memory_write', group: '记忆', desc: '写入记忆' },
  { name: 'memory_save_preference', group: '记忆', desc: '保存偏好' },
  { name: 'memory_profile', group: '记忆', desc: '用户画像' },
  { name: 'memory_forget', group: '记忆', desc: '遗忘记忆' },
  { name: 'preference_search', group: '记忆', desc: '搜索偏好' },
  { name: 'list_workspaces', group: '工作区', desc: '列出工作区' },
  { name: 'list_tags', group: '工作区', desc: '列出标签' },
  { name: 'create_folder', group: '工作区', desc: '创建文件夹' },
  { name: 'list_folders', group: '工作区', desc: '列出文件夹' }
]

export function McpPermissionsPanel({ onClose }: McpPermissionsPanelProps) {
  const [permissions, setPermissions] = useState<McpPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<McpPermission | null>(null)
  const [creating, setCreating] = useState(false)
  const dialog = useDialog()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.Memora.mcpPermissions.list()
      setPermissions(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(clientId: string, clientName: string) {
    const ok = await dialog.confirm(`确定删除客户端「${clientName}」的权限配置？`)
    if (!ok) return
    try {
      await window.Memora.mcpPermissions.delete(clientId)
      setPermissions((prev) => prev.filter((p) => p.clientId !== clientId))
    } catch (e) {
      dialog.alert(e instanceof Error ? e.message : String(e))
    }
  }

  function handleSaved(p: McpPermission) {
    setPermissions((prev) => {
      const exists = prev.some((x) => x.clientId === p.clientId)
      return exists ? prev.map((x) => (x.clientId === p.clientId ? p : x)) : [p, ...prev]
    })
    setEditing(null)
    setCreating(false)
  }

  /** 统计某客户端可访问的工具数（基于权限级别 + 白名单） */
  function toolAccessCount(p: McpPermission): number {
    if (!p.allowedTools) return MCP_TOOLS.length
    const set = new Set(p.allowedTools.split(',').map((t) => t.trim()).filter(Boolean))
    return MCP_TOOLS.filter((t) => set.has(t.name)).length
  }

  const totalClients = permissions.length
  const countsByLevel = permissions.reduce<Record<string, number>>((acc, p) => {
    acc[p.level] = (acc[p.level] ?? 0) + 1
    return acc
  }, {})
  const toolCount = MCP_TOOLS.length

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">MCP 工具权限</h3>
            <p className="text-[10px] text-fg-muted mt-0.5">按客户端粒度控制 MCP 工具访问权限</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreating(true)}
              className="Memora-btn Memora-btn-primary text-xs"
            >
              + 添加客户端
            </button>
            <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <div className="text-center text-red-500 text-sm py-4">{error}</div>}
          {!loading && !error && permissions.length === 0 && (
            <div className="text-center py-12">
              <div className="mb-2 opacity-30 text-accent">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </div>
              <p className="text-sm text-fg-muted mb-1">暂无客户端权限配置</p>
              <p className="text-xs text-fg-muted mb-4">未配置时使用环境变量回退模式</p>
              <button onClick={() => setCreating(true)} className="Memora-btn Memora-btn-primary text-xs">
                + 添加第一个客户端
              </button>
            </div>
          )}
          {!loading && !error && permissions.length > 0 && (
            <>
              {/* 聚合统计 */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="rounded-lg border border-border border-l-2 border-l-accent bg-bg-secondary p-2.5">
                  <span className="block text-xl font-bold tabular-nums text-fg-primary leading-none">{totalClients}</span>
                  <span className="block text-[10px] text-fg-muted mt-1">客户端</span>
                </div>
                <div className="rounded-lg border border-border border-l-2 border-l-blue-500 bg-bg-secondary p-2.5">
                  <span className="block text-xl font-bold tabular-nums text-fg-primary leading-none">{countsByLevel.readonly ?? 0}</span>
                  <span className="block text-[10px] text-fg-muted mt-1">只读</span>
                </div>
                <div className="rounded-lg border border-border border-l-2 border-l-green-500 bg-bg-secondary p-2.5">
                  <span className="block text-xl font-bold tabular-nums text-fg-primary leading-none">{countsByLevel.write ?? 0}</span>
                  <span className="block text-[10px] text-fg-muted mt-1">可写</span>
                </div>
                <div className="rounded-lg border border-border border-l-2 border-l-red-500 bg-bg-secondary p-2.5">
                  <span className="block text-xl font-bold tabular-nums text-fg-primary leading-none">{countsByLevel.full ?? 0}</span>
                  <span className="block text-[10px] text-fg-muted mt-1">完全</span>
                </div>
              </div>
              <div className="space-y-2">
              {permissions.map((p) => {
                const access = toolAccessCount(p)
                const accessPct = Math.round((access / toolCount) * 100)
                return (
                <div key={p.id} className="border border-border rounded-lg bg-bg-secondary p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <span className="text-sm font-medium">{p.clientName}</span>
                      <span className="text-[10px] text-fg-muted">({p.clientId})</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${LEVEL_LABELS[p.level]?.color ?? ''}`}>
                        {LEVEL_LABELS[p.level]?.label ?? p.level}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-xs text-fg-muted hover:text-accent px-1"
                        title="编辑"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(p.clientId, p.clientName)}
                        className="text-xs text-fg-muted hover:text-red-500 px-1"
                        title="删除"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-bg-hover overflow-hidden">
                      <div
                        className={`h-full rounded-full ${p.enabled ? 'bg-accent' : 'bg-gray-500'}`}
                        style={{ width: `${accessPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-fg-muted tabular-nums flex-shrink-0">
                      {access}/{toolCount} 工具
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-fg-muted">
                    <span>{p.enabled ? '已启用' : '已禁用'}</span>
                    {p.allowedTools && (
                      <>
                        <span>·</span>
                        <span>工具白名单: {p.allowedTools.split(',').length} 个</span>
                      </>
                    )}
                    {!p.allowedTools && <><span>·</span><span>所有工具可用</span></>}
                  </div>
                </div>
                )
              })}
            </div>
            </>
          )}
        </div>
      </div>

      {/* 编辑/新建弹层 */}
      {(editing || creating) && (
        <PermissionEditor
          permission={editing}
          onCancel={() => { setEditing(null); setCreating(false) }}
          onSaved={handleSaved}
        />
      )}

      <PromptDialog state={dialog.state} onClose={dialog.handleClose} />
    </div>
  )
}

function PermissionEditor({
  permission,
  onCancel,
  onSaved
}: {
  permission: McpPermission | null
  onCancel: () => void
  onSaved: (p: McpPermission) => void
}) {
  const isEdit = !!permission
  const [clientId, setClientId] = useState(permission?.clientId ?? '')
  const [clientName, setClientName] = useState(permission?.clientName ?? '')
  const [level, setLevel] = useState(permission?.level ?? 'readonly')
  const [enabled, setEnabled] = useState(permission?.enabled ?? true)
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    permission?.allowedTools ? new Set(permission.allowedTools.split(',').map((t) => t.trim())) : new Set()
  )
  const [useWhitelist, setUseWhitelist] = useState(!!permission?.allowedTools)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!clientId.trim() || !clientName.trim()) {
      setErr('客户端 ID 和名称不能为空')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const result = await window.Memora.mcpPermissions.save({
        clientId: clientId.trim(),
        clientName: clientName.trim(),
        level,
        enabled,
        allowedTools: useWhitelist ? Array.from(selectedTools).join(',') : null
      })
      onSaved(result)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function toggleTool(tool: string) {
    const next = new Set(selectedTools)
    if (next.has(tool)) next.delete(tool)
    else next.add(tool)
    setSelectedTools(next)
  }

  const groupedTools = MCP_TOOLS.reduce((acc, t) => {
    const group = acc.get(t.group) ?? []
    group.push(t)
    acc.set(t.group, group)
    return acc
  }, new Map<string, typeof MCP_TOOLS>())

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center" onClick={onCancel}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl p-5 w-[520px] max-w-[90vw] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-4">{isEdit ? '编辑权限' : '添加客户端权限'}</h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-fg-secondary mb-1">客户端 ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="Memora-input w-full text-sm"
              placeholder="如: claude-desktop"
              disabled={isEdit}
            />
          </div>
          <div>
            <label className="block text-xs text-fg-secondary mb-1">客户端名称</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="Memora-input w-full text-sm"
              placeholder="如: Claude Desktop"
            />
          </div>
        </div>

        <label className="block text-xs text-fg-secondary mb-1">权限级别</label>
        <div className="flex items-center gap-1.5 mb-3">
          {Object.entries(LEVEL_LABELS).map(([key, { label, color: _color, desc }]) => (
            <button
              key={key}
              onClick={() => setLevel(key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                level === key ? 'bg-accent text-white' : 'bg-bg-hover text-fg-secondary'
              }`}
              title={desc}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-fg-secondary">启用</span>
          </label>
        </div>

        <div className="mb-3">
          <label className="flex items-center gap-1.5 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={useWhitelist}
              onChange={(e) => setUseWhitelist(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-fg-secondary">工具白名单（仅允许选中的工具）</span>
          </label>
          {useWhitelist && (
            <div className="border border-border rounded-lg p-2 max-h-48 overflow-y-auto">
              {Array.from(groupedTools.entries()).map(([group, tools]) => (
                <div key={group} className="mb-2 last:mb-0">
                  <p className="text-[10px] text-fg-muted mb-1">{group}</p>
                  <div className="flex flex-wrap gap-1">
                    {tools.map((t) => (
                      <button
                        key={t.name}
                        onClick={() => toggleTool(t.name)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          selectedTools.has(t.name)
                            ? 'bg-accent text-white'
                            : 'bg-bg-hover text-fg-muted hover:text-fg-secondary'
                        }`}
                        title={t.desc}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <p className="text-xs text-red-500 mb-2">✗ {err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="Memora-btn Memora-btn-ghost text-xs">取消</button>
          <button onClick={handleSave} disabled={saving} className="Memora-btn Memora-btn-primary text-xs">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}