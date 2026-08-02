import { useState, useCallback, useEffect } from 'react'

interface SecurityReport {
  generatedAt: string
  encryption: {
    safeStorageAvailable: boolean
    encryptedKeysCount: number
    status: string
    note: string
  }
  sensitiveInfo: {
    total: number
    byType: Array<{ type: string; count: number; lastDetectedAt: string }>
    samples: Array<{ type: string; masked: string; source: string; detectedAt: string }>
  }
  dataSafety: {
    dbPath: string
    dbSizeMB: number
    encrypted: boolean
    backupCount: number
  }
  recommendations: string[]
}

interface SecurityCenterPanelProps {
  onClose: () => void
}

const TYPE_LABELS: Record<string, string> = {
  api_key: 'API Key',
  token: 'Token',
  password: '密码',
  phone: '手机号',
  email: '邮箱',
  ip: 'IP 地址',
  credit_card: '信用卡',
  ssn: '身份证号'
}

export function SecurityCenterPanel({ onClose }: SecurityCenterPanelProps) {
  const [report, setReport] = useState<SecurityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await window.Memora.security.report()
      setReport(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function statusBadge(status: string) {
    const map: Record<string, { label: string; color: string }> = {
      secure: { label: '安全', color: 'bg-green-500/20 text-green-400' },
      partial: { label: '部分安全', color: 'bg-yellow-500/20 text-yellow-400' },
      insecure: { label: '不安全', color: 'bg-red-500/20 text-red-400' }
    }
    const info = map[status] ?? { label: status, color: 'bg-gray-500/20 text-gray-400' }
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${info.color}`}>
        {info.label}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[560px] max-w-[92vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">安全中心</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="Memora-btn Memora-btn-ghost text-xs"
              disabled={loading}
            >
              {loading ? '扫描中...' : '刷新'}
            </button>
            <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm px-2">&times;</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-fg-muted text-sm">
              <div className="animate-pulse">扫描中...</div>
            </div>
          ) : error ? (
            <div className="text-red-400 text-sm text-center py-8">{error}</div>
          ) : report ? (
            <>
              {/* Encryption Status */}
              <div className="bg-bg-secondary rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">加密状态</h3>
                  {statusBadge(report.encryption.status)}
                </div>
                <div className="space-y-1.5 text-xs text-fg-muted">
                  <div className="flex justify-between">
                    <span>safeStorage</span>
                    <span className={report.encryption.safeStorageAvailable ? 'text-green-400' : 'text-red-400'}>
                      {report.encryption.safeStorageAvailable ? '可用' : '不可用'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>已加密 Key 数</span>
                    <span className="text-fg-primary">{report.encryption.encryptedKeysCount}</span>
                  </div>
                  <p className="text-fg-muted mt-1">{report.encryption.note}</p>
                </div>
              </div>

              {/* Sensitive Info */}
              <div className="bg-bg-secondary rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">敏感信息检测</h3>
                  <span className={`text-xs font-bold ${
                    report.sensitiveInfo.total > 0 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {report.sensitiveInfo.total} 处
                  </span>
                </div>

                {report.sensitiveInfo.byType.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {report.sensitiveInfo.byType.map((t) => (
                        <span key={t.type} className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px]">
                          {TYPE_LABELS[t.type] ?? t.type}: {t.count}
                        </span>
                      ))}
                    </div>

                    {report.sensitiveInfo.samples.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-fg-muted mb-1">最近检测到（已脱敏）:</p>
                        {report.sensitiveInfo.samples.slice(0, 5).map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px]">
                            <span className="text-fg-muted">{TYPE_LABELS[s.type] ?? s.type}</span>
                            <code className="text-fg-primary">{s.masked}</code>
                            <span className="text-fg-muted">{s.source}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-green-400">未检测到敏感信息</p>
                )}
              </div>

              {/* Data Safety */}
              <div className="bg-bg-secondary rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-2">数据安全</h3>
                <div className="space-y-1.5 text-xs text-fg-muted">
                  <div className="flex justify-between">
                    <span>数据库大小</span>
                    <span className="text-fg-primary">{report.dataSafety.dbSizeMB} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>备份数量</span>
                    <span className={report.dataSafety.backupCount > 0 ? 'text-green-400' : 'text-yellow-400'}>
                      {report.dataSafety.backupCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>数据库加密</span>
                    <span className={report.dataSafety.encrypted ? 'text-green-400' : 'text-fg-muted'}>
                      {report.dataSafety.encrypted ? '是' : '否（本地文件）'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="bg-bg-secondary rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-2">建议</h3>
                <ul className="space-y-1.5">
                  {report.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-fg-muted flex items-start gap-2">
                      <span className="text-accent mt-0.5">&#9654;</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-[10px] text-fg-muted text-center">
                报告生成于 {new Date(report.generatedAt).toLocaleString()}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}