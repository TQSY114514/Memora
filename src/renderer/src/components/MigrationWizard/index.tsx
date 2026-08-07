import { useState, useEffect, useCallback, useRef } from 'react'
import type { DetectedApp, ExtractedSession, ImportResult } from '@shared/types'

interface MigrationWizardPanelProps {
  onClose: () => void
}

type Step = 'detect' | 'select' | 'migrate'

export function MigrationWizardPanel({ onClose }: MigrationWizardPanelProps) {
  const [step, setStep] = useState<Step>('detect')
  const [apps, setApps] = useState<DetectedApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [migrating, setMigrating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const loadApps = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.Memora.scanner.detectApps()
      setApps(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadApps() }, [loadApps])

  // 迁移结束清理
  useEffect(() => () => { cancelledRef.current = true }, [])

  const extractable = apps.filter((a) => a.canExtract)
  const cloudOnly = apps.filter((a) => !a.canExtract)

  function togglePlatform(provider: string) {
    const next = new Set(selected)
    if (next.has(provider)) next.delete(provider)
    else next.add(provider)
    setSelected(next)
  }

  async function handleStartMigration() {
    const targets = apps.filter((a) => a.canExtract && selected.has(a.provider))
    if (targets.length === 0) return
    setStep('migrate')
    setMigrating(true)
    setError(null)
    setResult(null)
    setResultMsg(null)
    setProgress(0)
    cancelledRef.current = false

    const agg: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [], sessionIds: [] }
    const total = targets.length
    let done = 0

    for (const app of targets) {
      if (cancelledRef.current) break
      try {
        // 1. 从本地数据源扒取对话（主进程按其自身检测到的路径，安全）
        const sessions: ExtractedSession[] = await window.Memora.scanner.extractApp(
          app.provider,
          app.dataPath || ''
        )
        // 2. 导入已扒取的对话
        if (sessions.length > 0) {
          const r: ImportResult = await window.Memora.import.extracted(sessions)
          agg.imported += r.imported
          agg.skipped += r.skipped
          agg.failed += r.failed
          agg.sessionIds.push(...r.sessionIds)
          if (r.errors.length) agg.errors.push(...r.errors)
        }
        setResultMsg(`${app.name}：扒取 ${sessions.length} 条对话`)
      } catch (e) {
        agg.failed += 1
        agg.errors.push(`${app.name}: ${e instanceof Error ? e.message : String(e)}`)
        setResultMsg(`${app.name}：迁移失败`)
      }
      done++
      setProgress(Math.round((done / total) * 100))
    }

    setMigrating(false)
    setResult(agg)
    setProgress(100)
  }

  const stepLabels: Record<Step, string> = {
    detect: '检测平台',
    select: '选择数据',
    migrate: '开始迁移'
  }

  const stepDescs: Record<Step, string> = {
    detect: '正在扫描本机已安装的 AI 工具，检测可导入的对话数据...',
    select: '选择要导入的平台，配置迁移选项...',
    migrate: '正在将对话数据导入 Memora，请耐心等待...'
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">AI 迁移向导</h2>
            <p className="text-xs text-fg-muted mt-0.5">三步迁移流程 · 本地优先</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-lg">&times;</button>
        </div>

        {/* 步骤指示器 */}
        <div className="flex items-center px-5 py-3 border-b border-border gap-2">
          {(['detect', 'select', 'migrate'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 ${step === s ? 'text-accent' : 'text-fg-muted'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s ? 'bg-accent text-white' : 'bg-bg-hover text-fg-muted'
                }`}>
                  {i + 1}
                </div>
                <span className="text-xs">{stepLabels[s]}</span>
              </div>
              {i < 2 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-fg-muted mb-4">{stepDescs[step]}</p>

          {step === 'detect' && (
            <div className="space-y-3">
              {loading ? (
                <div className="text-center text-xs text-fg-muted py-8">扫描中...</div>
              ) : (
                <>
                  {extractable.length > 0 && (
                    <>
                      <p className="text-[11px] font-medium text-fg-secondary">可本地扒取</p>
                      {extractable.map((app) => (
                        <div key={app.provider} className="bg-bg-hover rounded-md p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-bg-primary flex items-center justify-center text-sm font-bold">
                            {app.name[0]}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-medium">{app.name}</h3>
                            <p className="text-xs text-fg-muted">
                              {app.dataPath ? app.dataPath : '已找到本地数据'}
                            </p>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-500">
                            可导入
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                  {cloudOnly.length > 0 && (
                    <>
                      <p className="text-[11px] font-medium text-fg-secondary mt-2">检测到其他工具（对话在云端）</p>
                      {cloudOnly.map((app) => (
                        <div key={app.provider} className="bg-bg-hover rounded-md p-4 flex items-center gap-3">
                          <div className="flex-1">
                            <h3 className="text-sm font-medium">{app.name}</h3>
                            <p className="text-xs text-fg-muted">{app.hint || '对话存储在云端'}</p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {apps.length === 0 && (
                    <div className="text-center text-xs text-fg-muted py-8">
                      未检测到本机 AI 工具。可将导出的对话文件通过「导入」功能导入。
                    </div>
                  )}
                </>
              )}
              <button
                onClick={() => setStep('select')}
                disabled={extractable.length === 0}
                className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5 w-full mt-2"
              >
                下一步：选择数据
              </button>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-fg-secondary mb-2">选择要导入的平台</label>
                <div className="space-y-2">
                  {extractable.map((app) => (
                    <label key={app.provider} className="flex items-center gap-2 bg-bg-hover rounded-md p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(app.provider)}
                        onChange={() => togglePlatform(app.provider)}
                        className="w-4 h-4"
                      />
                      <div>
                        <span className="text-sm">{app.name}</span>
                        <span className="text-xs text-fg-muted ml-2">本地扒取</span>
                      </div>
                    </label>
                  ))}
                  {extractable.length === 0 && (
                    <p className="text-xs text-fg-muted">没有可导入的平台</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('detect')}
                  className="Memora-btn Memora-btn-ghost text-xs px-4 py-1.5"
                >上一步</button>
                <button
                  onClick={handleStartMigration}
                  disabled={selected.size === 0}
                  className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5 flex-1"
                >
                  开始迁移
                </button>
              </div>
            </div>
          )}

          {step === 'migrate' && (
            <div className="space-y-4">
              {migrating ? (
                <>
                  <div className="h-2 bg-bg-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-fg-muted text-center">{Math.round(progress)}%</p>
                  {resultMsg && <p className="text-xs text-fg-secondary text-center">{resultMsg}</p>}
                </>
              ) : (
                <>
                  {result && (
                    <div className="text-center py-6">
                      <div className="text-4xl mb-3">&#x2705;</div>
                      <p className="text-sm font-medium text-green-500">迁移完成！</p>
                      <div className="mt-3 flex items-center justify-center gap-2 flex-wrap text-[11px]">
                        <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-500">
                          导入 <span className="font-medium">{result.imported}</span>
                        </span>
                        <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-500">
                          跳过 <span className="font-medium">{result.skipped}</span>
                        </span>
                        <span className="px-2 py-1 rounded bg-red-500/15 text-red-500">
                          失败 <span className="font-medium">{result.failed}</span>
                        </span>
                      </div>
                      {result.errors.length > 0 && (
                        <div className="mt-3 text-left space-y-1">
                          {result.errors.slice(0, 5).map((err, i) => (
                            <p key={i} className="text-[10px] text-red-500/80 break-words">✗ {err}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={onClose}
                    className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5 w-full"
                  >完成</button>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-md text-xs bg-red-500/10 text-red-500">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}