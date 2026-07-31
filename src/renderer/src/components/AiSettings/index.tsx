import { useState } from 'react'
import { useAiConfigStore, PROVIDER_PRESETS, isAiConfigured } from '../../stores/aiConfigStore'
import type { AiConfig } from '@shared/types'

interface AiSettingsProps {
  onClose: () => void
}

/**
 * AI 配置弹窗（多供应商版）
 * 每个 provider 独立配置，互不干扰
 * 所有信息仅保存在本地 localStorage
 */
export function AiSettings({ onClose }: AiSettingsProps) {
  const { config, activeProvider, configs, setConfig, setActiveProvider, resetProvider } = useAiConfigStore()
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<null | 'testing' | 'ok' | 'fail'>(null)
  const [testMessage, setTestMessage] = useState('')

  async function handleTest() {
    setTestStatus('testing')
    setTestMessage('')
    try {
      const result = await window.Memora.ai.testConnection({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        chatModel: config.chatModel,
        embeddingModel: config.embeddingModel
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
      setTestStatus('ok')
      setTestMessage(result.message || '连接成功')
      if (result.dim && result.dim !== config.embeddingDim && result.dim > 0) {
        setConfig({ embeddingDim: result.dim })
      }
    } catch (e) {
      setTestStatus('fail')
      setTestMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const configured = isAiConfigured(config)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">AI 配置</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              每个供应商独立配置，互不干扰。配置仅保存在本地。
            </p>
          </div>
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Provider 选择（标签页风格） */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              供应商（各自独立配置）
            </label>
            <div className="flex gap-1 border-b border-border">
              {(Object.keys(PROVIDER_PRESETS) as AiConfig['provider'][]).map((p) => {
                const cfg = configs[p]
                const isConfigured = !!(cfg.baseUrl && (cfg.hasApiKey || cfg.apiKey) && cfg.chatModel && cfg.embeddingModel)
                return (
                  <button
                    key={p}
                    onClick={() => setActiveProvider(p)}
                    className={`px-3 py-2 text-xs transition-colors border-b-2 -mb-px ${
                      activeProvider === p
                        ? 'border-accent text-fg-primary font-medium'
                        : 'border-transparent text-fg-muted hover:text-fg-secondary'
                    }`}
                  >
                    {PROVIDER_PRESETS[p].label}
                    {isConfigured && <span className="ml-1 text-green-500">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 当前供应商的配置 */}
          <div className="space-y-4 pt-2">
            {/* API Base URL */}
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                API 基地址
              </label>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({ baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="Memora-input w-full"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                API Key
              </label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={config.apiKey}
                  onChange={(e) => setConfig({ apiKey: e.target.value })}
                  placeholder={config.hasApiKey ? '密钥已加密保存，重新输入可覆盖' : 'sk-...'}
                  className="Memora-input flex-1"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="Memora-btn Memora-btn-ghost text-xs"
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            {/* 对话模型 */}
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                对话模型（用于总结）
              </label>
              <input
                type="text"
                value={config.chatModel}
                onChange={(e) => setConfig({ chatModel: e.target.value })}
                placeholder="gpt-4o-mini"
                className="Memora-input w-full"
              />
            </div>

            {/* 嵌入模型 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                  嵌入模型（用于语义搜索）
                </label>
                <input
                  type="text"
                  value={config.embeddingModel}
                  onChange={(e) => setConfig({ embeddingModel: e.target.value })}
                  placeholder="text-embedding-3-small"
                  className="Memora-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                  向量维度
                </label>
                <input
                  type="number"
                  value={config.embeddingDim}
                  onChange={(e) => setConfig({ embeddingDim: Number(e.target.value) || 0 })}
                  placeholder="1536"
                  className="Memora-input w-full"
                />
              </div>
            </div>

            {/* 测试连接 + 重置 */}
            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={!configured || testStatus === 'testing'}
                className="Memora-btn Memora-btn-ghost text-xs disabled:opacity-50"
              >
                {testStatus === 'testing' ? '测试中…' : '测试连接'}
              </button>
              <button
                onClick={() => resetProvider(activeProvider)}
                className="Memora-btn Memora-btn-ghost text-xs text-red-500"
              >
                重置此供应商
              </button>
              {testStatus === 'ok' && (
                <p className="text-xs text-green-600">✓ {testMessage}</p>
              )}
              {testStatus === 'fail' && (
                <p className="text-xs text-red-500 break-all">✗ {testMessage}</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="Memora-btn Memora-btn-primary text-sm">
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
