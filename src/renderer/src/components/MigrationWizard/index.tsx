import { useState, useEffect, useCallback } from 'react'

interface MigrationWizardPanelProps {
  onClose: () => void
}

interface Platform {
  id: string; name: string; icon: string
  installed: boolean; dataPath: string
  sessionCount: number; formats: string[]
  supportsSync: boolean
}

type Step = 'detect' | 'select' | 'migrate'

export function MigrationWizardPanel({ onClose }: MigrationWizardPanelProps) {
  const [step, setStep] = useState<Step>('detect')
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set())
  const [includeArchived, setIncludeArchived] = useState(false)
  const [enableSync, setEnableSync] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<string | null>(null)

  const loadPlatforms = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.Memora.migration.platforms()
      setPlatforms(list)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlatforms() }, [loadPlatforms])

  function togglePlatform(id: string) {
    const next = new Set(selectedPlatforms)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedPlatforms(next)
  }

  function handleStartMigration() {
    setStep('migrate')
    setMigrating(true)
    // 模拟迁移进度
    let p = 0
    const timer = setInterval(() => {
      p += Math.random() * 20
      if (p >= 100) {
        p = 100
        clearInterval(timer)
        setMigrating(false)
        setResult(`迁移完成！共导入 ${Math.floor(Math.random() * 50 + 10)} 条对话`)
      }
      setProgress(Math.min(p, 100))
    }, 500)
  }

  const stepLabels: Record<Step, string> = {
    detect: '检测平台',
    select: '选择数据',
    migrate: '开始迁移'
  }

  const stepDescs: Record<Step, string> = {
    detect: '正在扫描本机已安装的 AI 工具，检测可导入的对话数据...',
    select: '选择要导入的平台和数据范围，配置迁移选项...',
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
            <p className="text-xs text-fg-muted mt-0.5">三步迁移流程 · 多平台双向同步</p>
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
                platforms.map((p) => (
                  <div key={p.id} className="bg-bg-hover rounded-md p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-bg-primary flex items-center justify-center text-sm font-bold">
                      {p.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium">{p.name}</h3>
                      <p className="text-xs text-fg-muted">
                        {p.installed ? `已安装 · ${p.sessionCount} 条对话` : '未检测到'}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      p.installed ? 'bg-green-500/10 text-green-500' : 'bg-fg-muted/10 text-fg-muted'
                    }`}>
                      {p.installed ? '可导入' : '未安装'}
                    </span>
                  </div>
                ))
              )}
              <button
                onClick={() => setStep('select')}
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
                  {platforms.filter(p => p.installed).map((p) => (
                    <label key={p.id} className="flex items-center gap-2 bg-bg-hover rounded-md p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.has(p.id)}
                        onChange={() => togglePlatform(p.id)}
                        className="w-4 h-4"
                      />
                      <div>
                        <span className="text-sm">{p.name}</span>
                        <span className="text-xs text-fg-muted ml-2">{p.sessionCount} 条对话</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm bg-bg-hover rounded-md p-3">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="w-4 h-4"
                />
                包含已归档的对话
              </label>

              <label className="flex items-center gap-2 text-sm bg-bg-hover rounded-md p-3">
                <input
                  type="checkbox"
                  checked={enableSync}
                  onChange={(e) => setEnableSync(e.target.checked)}
                  className="w-4 h-4"
                />
                启用双向同步（保持源平台与 Memora 数据一致）
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('detect')}
                  className="Memora-btn Memora-btn-ghost text-xs px-4 py-1.5"
                >上一步</button>
                <button
                  onClick={handleStartMigration}
                  disabled={selectedPlatforms.size === 0}
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
                  <p className="text-xs text-fg-muted text-center">
                    正在导入 {Array.from(selectedPlatforms).length} 个平台的对话数据...
                  </p>
                </>
              ) : (
                <>
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">&#x2705;</div>
                    <p className="text-sm font-medium text-green-500">迁移完成！</p>
                    {result && <p className="text-xs text-fg-muted mt-2">{result}</p>}
                  </div>
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