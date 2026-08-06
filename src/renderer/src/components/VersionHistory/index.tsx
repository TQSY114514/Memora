import { useState, useEffect, useCallback } from 'react'
import type { AuditLog } from '@shared/types'

interface VersionHistoryProps {
  entityId: string
  entityType: string
  entityName: string
  onClose: () => void
}

const ACTION_LABELS: Record<string, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  archive: '归档',
  supersede: '取代',
  conflict_resolve: '冲突解决',
  rollback: '回滚'
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/15 text-green-500',
  update: 'bg-blue-500/15 text-blue-500',
  delete: 'bg-red-500/15 text-red-500',
  archive: 'bg-gray-500/15 text-gray-500',
  supersede: 'bg-orange-500/15 text-orange-500',
  conflict_resolve: 'bg-purple-500/15 text-purple-500',
  rollback: 'bg-yellow-500/15 text-yellow-500'
}

export function VersionHistory({ entityId, entityType, entityName, onClose }: VersionHistoryProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const history = await window.Memora.audit.versionHistory(entityId, entityType)
      setLogs(history)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [entityId, entityType])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  async function handleRollback(log: AuditLog) {
    if (!log.beforeValue) {
      setRollbackMsg('该版本没有可回滚的之前状态（可能是创建操作）')
      return
    }
    setRollingBack(true)
    setRollbackMsg(null)
    try {
      const result = await window.Memora.audit.rollback(entityType, log.id)
      if (result.success) {
        setRollbackMsg(`✓ 回滚成功：${result.message}`)
        loadHistory()
      } else {
        setRollbackMsg(`✗ 回滚失败：${result.message}`)
      }
    } catch (e) {
      setRollbackMsg(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRollingBack(false)
    }
  }

  function formatValue(value: string | undefined): string {
    if (!value) return '(空)'
    try {
      const obj = JSON.parse(value)
      // 过滤掉内部字段，只显示有意义的内容
      const filtered: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'id' || k === 'workspace_id' || k === 'session_id' || k === 'created_at' || k === 'updated_at') continue
        filtered[k] = v
      }
      return JSON.stringify(filtered, null, 2)
    } catch {
      return value
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">版本历史</h3>
            <p className="text-[10px] text-fg-muted mt-0.5">
              {entityType === 'preference' ? '偏好' : entityType === 'knowledge' ? '知识' : '会话'}
              {' · '}{entityName}
            </p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="p-5 text-center text-red-500 text-sm">{error}</div>
          )}
          {!loading && !error && logs.length === 0 && (
            <div className="p-8 text-center text-fg-muted text-sm">暂无版本历史记录</div>
          )}
          {!loading && !error && logs.length > 0 && (
            <div className="p-3 space-y-2">
              {logs.map((log) => {
                const isSelected = selectedLog?.id === log.id
                return (
                  <div
                    key={log.id}
                    className={`rounded-lg border transition-colors ${
                      isSelected ? 'border-accent bg-accent-muted' : 'border-border bg-bg-secondary'
                    }`}
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2 cursor-pointer"
                      onClick={() => setSelectedLog(isSelected ? null : log)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTION_COLORS[log.action] ?? 'bg-gray-500/15 text-gray-500'}`}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                        <span className="text-xs text-fg-muted">
                          {new Date(log.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.beforeValue && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRollback(log) }}
                            disabled={rollingBack}
                            className="text-[10px] text-accent hover:underline disabled:opacity-50"
                            title="回滚到此版本之前的状态"
                          >
                            {rollingBack ? '回滚中…' : '回滚'}
                          </button>
                        )}
                        <span className="text-fg-muted text-[10px]">{isSelected ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="px-3 pb-3 space-y-2">
                        {log.reason && (
                          <div className="text-[10px] text-fg-muted">
                            <span className="text-fg-secondary">原因：</span>{log.reason}
                          </div>
                        )}
                        {log.beforeValue && log.afterValue && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] text-fg-muted mb-1">变更前</p>
                              <pre className="text-[10px] bg-bg-tertiary rounded p-2 max-h-32 overflow-auto text-fg-secondary whitespace-pre-wrap">
                                {formatValue(log.beforeValue)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[10px] text-fg-muted mb-1">变更后</p>
                              <pre className="text-[10px] bg-bg-tertiary rounded p-2 max-h-32 overflow-auto text-fg-secondary whitespace-pre-wrap">
                                {formatValue(log.afterValue)}
                              </pre>
                            </div>
                          </div>
                        )}
                        {log.beforeValue && !log.afterValue && (
                          <div>
                            <p className="text-[10px] text-fg-muted mb-1">删除前的状态</p>
                            <pre className="text-[10px] bg-bg-tertiary rounded p-2 max-h-32 overflow-auto text-fg-secondary whitespace-pre-wrap">
                              {formatValue(log.beforeValue)}
                            </pre>
                          </div>
                        )}
                        {!log.beforeValue && log.afterValue && (
                          <div>
                            <p className="text-[10px] text-fg-muted mb-1">创建时的状态</p>
                            <pre className="text-[10px] bg-bg-tertiary rounded p-2 max-h-32 overflow-auto text-fg-secondary whitespace-pre-wrap">
                              {formatValue(log.afterValue)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {rollbackMsg && (
          <div className={`px-5 py-2 text-xs border-t border-border ${rollbackMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
            {rollbackMsg}
          </div>
        )}
      </div>
    </div>
  )
}