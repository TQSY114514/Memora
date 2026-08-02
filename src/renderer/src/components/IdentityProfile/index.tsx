import { useState, useCallback, useEffect } from 'react'

interface IdentityProfileData {
  generatedAt: string
  basics: { role: string[]; techStack: string[]; editors: string[]; languages: string[] }
  communication: { style: string[]; format: string[]; avoid: string[] }
  projects: Array<{ name: string; description: string; techStack: string[]; status: string }>
  preferences: Array<{ subject: string; value: string; confidence: number }>
  knowledge: Array<{ title: string; type: string; snippet: string }>
  constitution: Array<{ subject: string; value: string }>
  stats: { totalSessions: number; totalMessages: number; totalPreferences: number; totalKnowledge: number; activeSince: string | null; topProviders: string[] }
  promptText: string
}

interface IdentityProfilePanelProps {
  onClose: () => void
}

export function IdentityProfilePanel({ onClose }: IdentityProfilePanelProps) {
  const [profile, setProfile] = useState<IdentityProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'prompt' | 'details'>('overview')

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await window.Memora.identity.generate()
      setProfile(p)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { generate() }, [generate])

  async function handleCopyPrompt() {
    if (!profile?.promptText) return
    try {
      await navigator.clipboard.writeText(profile.promptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API may not be available
      const textarea = document.createElement('textarea')
      textarea.value = profile.promptText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function confidenceColor(c: number): string {
    if (c >= 0.8) return 'text-green-500'
    if (c >= 0.5) return 'text-yellow-500'
    return 'text-red-400'
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[640px] max-w-[92vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">AI 身份画像</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              className="Memora-btn Memora-btn-ghost text-xs"
              disabled={loading}
            >
              {loading ? '生成中...' : '刷新'}
            </button>
            <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm px-2">&times;</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {(['overview', 'prompt', 'details'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-fg-muted hover:text-fg-primary'
              }`}
            >
              {tab === 'overview' ? '概览' : tab === 'prompt' ? 'Prompt 文本' : '详情'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-fg-muted text-sm">
              <div className="animate-pulse">分析记忆中...</div>
            </div>
          ) : error ? (
            <div className="text-red-400 text-sm text-center py-8">{error}</div>
          ) : profile ? (
            activeTab === 'overview' ? (
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <StatCard label="对话数" value={profile.stats.totalSessions} />
                  <StatCard label="消息数" value={profile.stats.totalMessages} />
                  <StatCard label="偏好" value={profile.stats.totalPreferences} />
                  <StatCard label="知识" value={profile.stats.totalKnowledge} />
                </div>

                {profile.stats.activeSince && (
                  <p className="text-xs text-fg-muted">
                    记忆始于 {new Date(profile.stats.activeSince).toLocaleDateString()}
                    {profile.stats.topProviders.length > 0 && (
                      <> · 常用平台: {profile.stats.topProviders.join(', ')}</>
                    )}
                  </p>
                )}

                {/* Basics */}
                {profile.basics.role.length > 0 && (
                  <Section title="身份">
                    <Tags items={profile.basics.role} />
                  </Section>
                )}

                {profile.basics.techStack.length > 0 && (
                  <Section title="技术栈">
                    <Tags items={profile.basics.techStack} color="blue" />
                  </Section>
                )}

                {profile.basics.editors.length > 0 && (
                  <Section title="工具">
                    <Tags items={profile.basics.editors} color="purple" />
                  </Section>
                )}

                {/* Communication */}
                {(profile.communication.style.length > 0 || profile.communication.format.length > 0) && (
                  <Section title="沟通偏好">
                    {profile.communication.style.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-fg-muted">风格:</span>
                        <Tags items={profile.communication.style} color="green" />
                      </div>
                    )}
                    {profile.communication.format.length > 0 && (
                      <div className="flex items-center gap-2 text-xs mt-1">
                        <span className="text-fg-muted">格式:</span>
                        <Tags items={profile.communication.format} color="green" />
                      </div>
                    )}
                  </Section>
                )}

                {profile.communication.avoid.length > 0 && (
                  <Section title="避免">
                    <Tags items={profile.communication.avoid} color="red" />
                  </Section>
                )}

                {/* Constitution */}
                {profile.constitution.length > 0 && (
                  <Section title="宪法级偏好">
                    {profile.constitution.map((c, i) => (
                      <div key={i} className="text-xs text-fg-primary py-0.5">
                        <span className="text-accent">{c.subject}</span>: {c.value}
                      </div>
                    ))}
                  </Section>
                )}

                {/* Projects */}
                {profile.projects.length > 0 && (
                  <Section title="项目">
                    {profile.projects.map((p, i) => (
                      <div key={i} className="mb-2">
                        <div className="text-xs font-medium">{p.name}</div>
                        <div className="text-xs text-fg-muted line-clamp-2">{p.description}</div>
                        {p.techStack.length > 0 && (
                          <div className="mt-1"><Tags items={p.techStack} color="blue" /></div>
                        )}
                      </div>
                    ))}
                  </Section>
                )}
              </div>
            ) : activeTab === 'prompt' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-fg-muted">
                    将此文本粘贴到新 AI 对话开头，让 AI 立刻了解你
                  </p>
                  <button
                    onClick={handleCopyPrompt}
                    className="Memora-btn Memora-btn-primary text-xs px-3 py-1"
                  >
                    {copied ? '已复制' : '复制到剪贴板'}
                  </button>
                </div>
                <pre className="bg-bg-secondary rounded-lg p-4 text-xs text-fg-primary whitespace-pre-wrap font-mono max-h-[50vh] overflow-y-auto border border-border">
                  {profile.promptText}
                </pre>
              </div>
            ) : (
              <div className="space-y-4">
                <Section title={`全部偏好 (${profile.preferences.length})`}>
                  {profile.preferences.slice(0, 30).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span>
                        <span className="text-fg-muted">{p.subject}:</span>{' '}
                        <span className="text-fg-primary">{p.value}</span>
                      </span>
                      <span className={`${confidenceColor(p.confidence)}`}>
                        {(p.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </Section>

                <Section title={`知识条目 (${profile.knowledge.length})`}>
                  {profile.knowledge.map((k, i) => (
                    <div key={i} className="text-xs py-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1 rounded text-[10px] ${
                          k.type === 'knowledge' ? 'bg-blue-500/20 text-blue-400' :
                          k.type === 'decision' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          {k.type === 'knowledge' ? '知识' : k.type === 'decision' ? '决策' : '任务'}
                        </span>
                        <span className="text-fg-primary">{k.title}</span>
                      </div>
                      <div className="text-fg-muted line-clamp-1 mt-0.5">{k.snippet}</div>
                    </div>
                  ))}
                </Section>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-fg-muted mb-1.5 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-secondary rounded-lg p-2 text-center">
      <div className="text-lg font-bold text-accent">{value.toLocaleString()}</div>
      <div className="text-[10px] text-fg-muted">{label}</div>
    </div>
  )
}

function Tags({ items, color = 'default' }: { items: string[]; color?: string }) {
  const colorClasses: Record<string, string> = {
    default: 'bg-accent/10 text-accent',
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    purple: 'bg-purple-500/10 text-purple-400',
    red: 'bg-red-500/10 text-red-400'
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={i}
          className={`px-1.5 py-0.5 rounded text-[10px] ${colorClasses[color] ?? colorClasses.default}`}
        >
          {item}
        </span>
      ))}
    </div>
  )
}