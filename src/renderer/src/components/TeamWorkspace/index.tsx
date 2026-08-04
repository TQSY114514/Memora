import { useState, useEffect, useCallback } from 'react'

interface TeamWorkspacePanelProps {
  onClose: () => void
}

interface Workspace {
  id: string; name: string; description: string
  inviteCode: string; createdBy: string; createdAt: string
  members: Array<{ id: string; name: string; role: string; joinedAt: string }>
  defaultVisibility?: string
}

interface Comment {
  id: string; entryId: string; entityType: string
  author: string; content: string; createdAt: string
  replyTo: string | null; resolved: boolean
}

export function TeamWorkspacePanel({ onClose }: TeamWorkspacePanelProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'workspaces' | 'visibility' | 'comments' | 'share'>('workspaces')

  // 创建表单
  const [showCreate, setShowCreate] = useState(false)
  const [wsName, setWsName] = useState('')
  const [wsDesc, setWsDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // 加入
  const [memberName, setMemberName] = useState('')

  // 评论
  const [comments, setComments] = useState<Comment[]>([])
  const [commentEntryId, setCommentEntryId] = useState('')
  const [commentContent, setCommentContent] = useState('')

  // 加密共享
  const [sharePassword, setSharePassword] = useState('')
  const [sharePayload, setSharePayload] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [importPayload, setImportPayload] = useState('')
  const [importTargetId, setImportTargetId] = useState('')
  const [importPassword, setImportPassword] = useState('')

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.Memora.team.listWorkspaces()
      setWorkspaces(list)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])

  async function handleCreate() {
    if (!wsName) return
    setCreating(true)
    try {
      await window.Memora.team.createWorkspace(wsName, wsDesc, 'me')
      setWsName(''); setWsDesc(''); setShowCreate(false)
      loadWorkspaces()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(wsId: string) {
    try {
      await window.Memora.team.joinWorkspace(wsId, {
        id: `member_${Date.now()}`,
        name: memberName || '新成员',
        role: 'editor',
        joinedAt: new Date().toISOString()
      })
      setMemberName('')
      loadWorkspaces()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleLoadComments() {
    if (!commentEntryId) return
    try {
      const list = await window.Memora.team.listComments(commentEntryId)
      setComments(list)
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleAddComment() {
    if (!commentEntryId || !commentContent) return
    try {
      await window.Memora.team.addComment(commentEntryId, 'knowledge', 'me', commentContent)
      setCommentContent('')
      handleLoadComments()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleExportEncrypted(wsId: string, wsName: string) {
    if (!sharePassword) return
    try {
      const payload = await window.Memora.team.exportEncrypted(wsId, sharePassword)
      setSharePayload(JSON.stringify(payload, null, 2))
      setShareMessage(`已加密导出工作区「${wsName}」，请复制下方载荷发送给接收方`)
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleImportEncrypted() {
    if (!importPayload || !importPassword || !importTargetId) return
    try {
      const payload = JSON.parse(importPayload)
      const result = await window.Memora.team.importEncrypted(payload, importPassword, importTargetId)
      setShareMessage(`导入完成：偏好 ${result.imported.preferences} / 宪法 ${result.imported.constitution} / 知识 ${result.imported.knowledge}，跳过 ${result.skipped}`)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">团队记忆共享</h2>
            <p className="text-xs text-fg-muted mt-0.5">协作工作区 · 可见性控制 · 评论</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-lg">&times;</button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-border px-5">
          {(['workspaces', 'visibility', 'comments', 'share'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-fg-muted hover:text-fg-secondary'
              }`}
            >
              {tab === 'workspaces' ? '工作区' : tab === 'visibility' ? '可见性' : tab === 'comments' ? '评论' : '加密共享'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'workspaces' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-muted">{workspaces.length} 个工作区</span>
                <button
                  onClick={() => setShowCreate(!showCreate)}
                  className="Memora-btn Memora-btn-primary text-xs px-3 py-1"
                >
                  {showCreate ? '取消' : '+ 创建工作区'}
                </button>
              </div>

              {showCreate && (
                <div className="bg-bg-hover rounded-md p-4 space-y-3">
                  <input type="text" value={wsName} onChange={(e) => setWsName(e.target.value)}
                    className="Memora-input w-full text-sm" placeholder="工作区名称" />
                  <input type="text" value={wsDesc} onChange={(e) => setWsDesc(e.target.value)}
                    className="Memora-input w-full text-sm" placeholder="描述" />
                  <button
                    onClick={handleCreate}
                    disabled={creating || !wsName}
                    className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5"
                  >创建</button>
                </div>
              )}

              {workspaces.length === 0 && !loading && (
                <div className="text-center text-xs text-fg-muted py-8">暂无工作区</div>
              )}

              {workspaces.map((ws) => (
                <div key={ws.id} className="bg-bg-hover rounded-md p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-medium">{ws.name}</h3>
                      {ws.description && <p className="text-xs text-fg-muted mt-0.5">{ws.description}</p>}
                    </div>
                    <span className="text-[10px] text-fg-muted bg-bg-primary px-2 py-0.5 rounded">
                      邀请码：{ws.inviteCode}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-[10px] text-fg-muted mb-1">
                      {ws.members.length} 名成员
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {ws.members.map((m) => (
                        <span key={m.id} className="text-[10px] bg-bg-primary px-2 py-0.5 rounded">
                          {m.name} ({m.role === 'admin' ? '管理员' : m.role === 'editor' ? '编辑' : '只读'})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 加入表单 */}
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                      className="Memora-input text-xs flex-1 py-1"
                      placeholder="你的名字"
                    />
                    <button
                      onClick={() => handleJoin(ws.id)}
                      disabled={!memberName}
                      className="Memora-btn Memora-btn-ghost text-xs px-3 py-1"
                    >加入</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'visibility' && (
            <div className="text-center text-xs text-fg-muted py-12">
              <p className="mb-2">为每个记忆条目设置可见性级别</p>
              <p>支持：私有 · 共享只读 · 共享读写 · 管理员可见</p>
              <p className="mt-2">选择知识条目后，可在其详情页设置可见性</p>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentEntryId}
                  onChange={(e) => setCommentEntryId(e.target.value)}
                  className="Memora-input text-xs flex-1 py-1"
                  placeholder="知识条目 ID"
                />
                <button
                  onClick={handleLoadComments}
                  className="Memora-btn Memora-btn-ghost text-xs px-3 py-1"
                >加载</button>
              </div>

              {comments.length > 0 && (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-bg-hover rounded-md p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{c.author}</span>
                        <span className="text-[10px] text-fg-muted">
                          {new Date(c.createdAt).toLocaleString('zh-CN')}
                        </span>
                        {c.resolved && <span className="text-[10px] text-green-500">已解决</span>}
                      </div>
                      <p className="text-xs">{c.content}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  className="Memora-input text-xs flex-1 py-1"
                  placeholder="添加评论..."
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentEntryId || !commentContent}
                  className="Memora-btn Memora-btn-primary text-xs px-3 py-1"
                >发送</button>
              </div>
            </div>
          )}

          {activeTab === 'share' && (
            <div className="space-y-4">
              <div className="bg-bg-hover rounded-md p-4 space-y-3">
                <p className="text-xs font-medium">导出加密工作区</p>
                <p className="text-[10px] text-fg-muted">选择工作区并设置密码，将记忆打包为 AES-256-GCM 加密载荷，只有持有正确密码的接收方才能解密。可为 Claude Code / Cursor / OpenCode 等共享。</p>
                <select
                  value={importTargetId}
                  onChange={(e) => setImportTargetId(e.target.value)}
                  className="Memora-input text-xs w-full py-1"
                >
                  <option value="">选择工作区...</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
                <input
                  type="password"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="Memora-input text-xs w-full py-1"
                  placeholder="加密密码"
                />
                <button
                  onClick={() => {
                    const ws = workspaces.find(w => w.id === importTargetId)
                    if (ws) handleExportEncrypted(ws.id, ws.name)
                  }}
                  disabled={!importTargetId || !sharePassword}
                  className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5"
                >导出加密载荷</button>
                {sharePayload && (
                  <textarea
                    readOnly
                    value={sharePayload}
                    className="Memora-input w-full text-[10px] font-mono h-32"
                    onFocus={(e) => e.target.select()}
                  />
                )}
              </div>

              <div className="bg-bg-hover rounded-md p-4 space-y-3">
                <p className="text-xs font-medium">导入加密工作区</p>
                <input
                  type="text"
                  value={importPayload}
                  onChange={(e) => setImportPayload(e.target.value)}
                  className="Memora-input text-xs w-full py-1"
                  placeholder="粘贴加密载荷 JSON"
                />
                <input
                  type="password"
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  className="Memora-input text-xs w-full py-1"
                  placeholder="解密密码"
                />
                <button
                  onClick={handleImportEncrypted}
                  disabled={!importPayload || !importPassword || !importTargetId}
                  className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5"
                >解密并导入</button>
              </div>

              {shareMessage && (
                <div className="p-3 rounded-md text-xs bg-green-500/10 text-green-500">{shareMessage}</div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="px-5 py-2">
            <div className="p-3 rounded-md text-xs bg-red-500/10 text-red-500">{error}</div>
          </div>
        )}
      </div>
    </div>
  )
}