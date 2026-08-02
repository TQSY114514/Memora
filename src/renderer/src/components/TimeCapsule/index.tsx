import { useState, useEffect, useCallback } from 'react'

interface TimeCapsulePanelProps {
  onClose: () => void
}

interface Capsule {
  id: string; name: string; description: string
  sealedAt: string; unlockAt: string
  unlocked: boolean; unlockedAt: string | null
  summary: string; entryCount: number
}

export function TimeCapsulePanel({ onClose }: TimeCapsulePanelProps) {
  const [capsules, setCapsules] = useState<Capsule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [unlockResult, setUnlockResult] = useState<Record<string, unknown> | null>(null)

  // 创建表单
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unlockDate, setUnlockDate] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)

  // 解锁
  const [unlockId, setUnlockId] = useState<string | null>(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.Memora.capsule.list()
      setCapsules(list)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!name || !unlockDate || !password) return
    setCreating(true)
    try {
      await window.Memora.capsule.create({
        name, description, unlockAt: new Date(unlockDate).toISOString(),
        password, entryIds: [], preferenceIds: []
      })
      setName(''); setDescription(''); setUnlockDate(''); setPassword('')
      setShowCreate(false)
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  async function handleUnlock() {
    if (!unlockId || !unlockPassword) return
    setUnlocking(true)
    try {
      const result = await window.Memora.capsule.unlock(unlockId, unlockPassword)
      setUnlockResult(result)
      if (result.success) {
        setUnlockId(null)
        setUnlockPassword('')
        load()
      }
    } catch (e) {
      setUnlockResult({ success: false, error: String(e) })
    } finally {
      setUnlocking(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await window.Memora.capsule.delete(id)
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('zh-CN')
  }

  function isDue(capsule: Capsule): boolean {
    return !capsule.unlocked && new Date(capsule.unlockAt) <= new Date()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">记忆时间胶囊</h2>
            <p className="text-xs text-fg-muted mt-0.5">封存记忆，未来开启时生成对比报告</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-lg">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">{capsules.length} 个胶囊</span>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="Memora-btn Memora-btn-primary text-xs px-3 py-1"
            >
              {showCreate ? '取消' : '+ 创建胶囊'}
            </button>
          </div>

          {/* 创建表单 */}
          {showCreate && (
            <div className="bg-bg-hover rounded-md p-4 space-y-3">
              <h3 className="text-sm font-medium">创建新胶囊</h3>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">名称</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="Memora-input w-full text-sm" placeholder="如：2025 年度回顾" />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">描述（可选）</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                  className="Memora-input w-full text-sm" placeholder="封存了哪些记忆..." />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">解锁日期</label>
                <input type="date" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)}
                  className="Memora-input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">加密密码</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="Memora-input w-full text-sm" placeholder="用于解锁胶囊的密码" />
              </div>
              <button
                onClick={handleCreate}
                disabled={creating || !name || !unlockDate || !password}
                className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5"
              >
                {creating ? '创建中...' : '封存记忆'}
              </button>
            </div>
          )}

          {/* 胶囊列表 */}
          {loading ? (
            <div className="text-center text-xs text-fg-muted py-8">加载中...</div>
          ) : capsules.length === 0 ? (
            <div className="text-center text-xs text-fg-muted py-8">
              还没有时间胶囊，点击上方按钮创建第一个
            </div>
          ) : (
            <div className="space-y-3">
              {capsules.map((c) => (
                <div key={c.id} className={`bg-bg-hover rounded-md p-4 ${isDue(c) ? 'ring-1 ring-accent' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-medium">{c.name}</h3>
                      {c.description && <p className="text-xs text-fg-muted mt-0.5">{c.description}</p>}
                      <p className="text-xs text-fg-muted mt-1">{c.summary}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.unlocked ? (
                        <span className="text-xs text-green-500">已解锁</span>
                      ) : isDue(c) ? (
                        <span className="text-xs text-accent">已到期</span>
                      ) : (
                        <span className="text-xs text-fg-muted">封存中</span>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-xs text-fg-muted hover:text-red-500"
                      >删除</button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-[10px] text-fg-muted">
                    <span>封存：{formatDate(c.sealedAt)}</span>
                    <span>解锁：{formatDate(c.unlockAt)}</span>
                    {c.unlockedAt && <span>已解锁于：{formatDate(c.unlockedAt)}</span>}
                  </div>

                  {/* 解锁按钮 */}
                  {!c.unlocked && (
                    <div className="mt-3">
                      {unlockId === c.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={unlockPassword}
                            onChange={(e) => setUnlockPassword(e.target.value)}
                            className="Memora-input text-xs flex-1 py-1"
                            placeholder="输入密码解锁"
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                          />
                          <button
                            onClick={handleUnlock}
                            disabled={unlocking}
                            className="Memora-btn Memora-btn-primary text-xs px-3 py-1"
                          >
                            {unlocking ? '...' : '解锁'}
                          </button>
                          <button
                            onClick={() => { setUnlockId(null); setUnlockPassword('') }}
                            className="text-xs text-fg-muted"
                          >取消</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setUnlockId(c.id)}
                          className="text-xs text-accent hover:underline"
                        >
                          解锁查看
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 解锁结果 */}
          {unlockResult && (
            <div className="bg-bg-hover rounded-md p-4">
              <h3 className="text-sm font-medium mb-2">解锁报告</h3>
              <pre className="text-xs overflow-auto max-h-40">
                {JSON.stringify(unlockResult, null, 2)}
              </pre>
              <button
                onClick={() => setUnlockResult(null)}
                className="text-xs text-fg-muted mt-2 hover:underline"
              >关闭</button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md text-xs bg-red-500/10 text-red-500">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}