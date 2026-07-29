import { useState } from 'react'
import { useAiConfigStore, PROVIDER_PRESETS, isAiConfigured } from '../../stores/aiConfigStore'
import type { AiConfig } from '@shared/types'

interface AiSettingsProps {
  onClose: () => void
}

/**
 * AI 配置弹窗
 * 配置 OpenAI 兼容的 API 端点、密钥、模型
 * 所有信息仅保存在本地 localStorage
 */
export function AiSettings({ onClose }: AiSettingsProps) {
  const { config, setConfig, setProvider } = useAiConfigStore()
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<null | 'testing' | 'ok' | 'fail'>(null)
  const [testMessage, setTestMessage] = useState('')

  function handleProviderChange(provider: AiConfig['provider']) {
    setProvider(provider)
    setTestStatus(null)
    setTestMessage('')
  }

  async function handleTest() {
    setTestStatus('testing')
    setTestMessage('')
    try {
      // 用 embeddings 接口测试一条短文本
      const url = `${config.baseUrl.replace(/\/$/, '')}/embeddings`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.embeddingModel,
          input: ['test']
        })
      })
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(`${resp.status}: ${txt.slice(0, 200)}`)
      }
      const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> }
      const dim = data.data?.[0]?.embedding?.length ?? 0
      if (dim === 0) throw new Error('返回向量为空')
      if (dim !== config.embeddingDim) {
        setTestStatus('ok')
        setTestMessage(`连接成功，但返回维度为 ${dim}（配置为 ${config.embeddingDim}），已自动修正`)
        setConfig({ embeddingDim: dim })
      } else {
        setTestStatus('ok')
        setTestMessage(`连接成功，向量维度 ${dim}`)
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
              用于生成对话总结和语义搜索向量。配置仅保存在本地。
            </p>
          </div>
          <button onClick={onClose} className="aether-btn aether-btn-ghost text-sm">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Provider 选择 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              服务商
            </label>
            <div className="flex gap-2">
              {(Object.keys(PROVIDER_PRESETS) as AiConfig['provider'][]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    config.provider === p
                      ? 'bg-accent text-white'
                      : 'bg-bg-hover text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  {PROVIDER_PRESETS[p].label}
                </button>
              ))}
            </div>
          </div>

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
              className="aether-input w-full"
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
                placeholder="sk-..."
                className="aether-input flex-1"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="aether-btn aether-btn-ghost text-xs"
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
              className="aether-input w-full"
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
                className="aether-input w-full"
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
                className="aether-input w-full"
              />
            </div>
          </div>

          {/* 测试连接 */}
          <div className="pt-2">
            <button
              onClick={handleTest}
              disabled={!configured || testStatus === 'testing'}
              className="aether-btn aether-btn-ghost text-xs"
            >
              {testStatus === 'testing' ? '测试中…' : '测试连接'}
            </button>
            {testStatus === 'ok' && (
              <p className="text-xs text-green-600 mt-2">✓ {testMessage}</p>
            )}
            {testStatus === 'fail' && (
              <p className="text-xs text-red-500 mt-2 break-all">✗ {testMessage}</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="aether-btn aether-btn-primary text-sm">
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
