import { useState } from 'react'
import {
  useAiConfigStore,
  isAiConfigured
} from '../../stores/aiConfigStore'
import { API_STYLE_META } from '@shared/constants'
import type { AiApiStyle } from '@shared/types'

interface AiSettingsProps {
  onClose: () => void
}

/**
 * AI 配置弹窗（v1.2 多供应商版，支持无限添加）
 *
 * 功能：
 * - 左侧供应商列表（内置 + 自定义），可新增/删除/重命名
 * - 右侧配置面板：API 协议选择 + baseUrl + apiKey + 模型 + 维度
 * - 测试连接（通过 main 进程，支持多协议）
 */
export function AiSettings({ onClose }: AiSettingsProps) {
  const {
    config,
    activeProvider,
    configs,
    setConfig,
    setActiveProvider,
    addProvider,
    removeProvider,
    renameProvider,
    setProviderApiStyle
  } = useAiConfigStore()

  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<null | 'testing' | 'ok' | 'fail'>(null)
  const [testMessage, setTestMessage] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [newProviderLabel, setNewProviderLabel] = useState('')
  const [newProviderStyle, setNewProviderStyle] = useState<AiApiStyle>('openai')

  async function handleTest() {
    setTestStatus('testing')
    setTestMessage('')
    try {
      const result = await window.Memora.ai.testConnection({
        apiStyle: config.apiStyle,
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

  function handleAddProvider() {
    if (!newProviderLabel.trim()) return
    const key = addProvider(newProviderLabel.trim(), newProviderStyle)
    setActiveProvider(key)
    setShowAddDialog(false)
    setNewProviderLabel('')
    setNewProviderStyle('openai')
  }

  function handleRemoveProvider() {
    if (Object.keys(configs).length <= 1) {
      alert('至少保留一个供应商')
      return
    }
    if (!confirm(`确定删除「${config.label}」？此操作不可撤销。`)) return
    removeProvider(activeProvider)
    setTestStatus(null)
    setTestMessage('')
  }

  function handleStartRename() {
    setRenameValue(config.label)
    setRenaming(true)
  }

  function handleSaveRename() {
    if (renameValue.trim()) {
      renameProvider(activeProvider, renameValue.trim())
    }
    setRenaming(false)
  }

  const configured = isAiConfigured(config)
  const providerKeys = Object.keys(configs)
  const currentStyleMeta = API_STYLE_META[config.apiStyle]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-[680px] max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">AI 配置</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              支持无限添加供应商，每个独立配置。配置仅保存在本地。
            </p>
          </div>
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：供应商列表 */}
          <div className="w-48 border-r border-border bg-bg-secondary overflow-y-auto">
            <div className="p-2 space-y-0.5">
              {providerKeys.map((p) => {
                const cfg = configs[p]
                const isConfigured = !!(cfg.baseUrl && cfg.chatModel && cfg.embeddingModel &&
                  (!API_STYLE_META[cfg.apiStyle].needsApiKey || cfg.hasApiKey || cfg.apiKey))
                return (
                  <button
                    key={p}
                    onClick={() => setActiveProvider(p)}
                    className={`w-full text-left px-2.5 py-2 rounded text-xs transition-colors ${
                      activeProvider === p
                        ? 'bg-accent text-white'
                        : 'text-fg-secondary hover:bg-bg-hover'
                    }`}
                    title={cfg.label}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{cfg.label}</span>
                      {isConfigured && (
                        <span className={activeProvider === p ? 'text-white' : 'text-green-500'}>✓</span>
                      )}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${activeProvider === p ? 'text-white/70' : 'text-fg-muted'}`}>
                      {API_STYLE_META[cfg.apiStyle].label}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="p-2 border-t border-border">
              <button
                onClick={() => setShowAddDialog(true)}
                className="w-full px-2.5 py-2 rounded text-xs text-accent hover:bg-accent/10 transition-colors border border-dashed border-accent/30"
              >
                + 新增供应商
              </button>
            </div>
          </div>

          {/* 右侧：配置面板 */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* 供应商名称（可编辑） */}
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                供应商名称
              </label>
              {renaming ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                    className="Memora-input flex-1"
                    autoFocus
                  />
                  <button onClick={handleSaveRename} className="Memora-btn Memora-btn-primary text-xs">
                    保存
                  </button>
                  <button onClick={() => setRenaming(false)} className="Memora-btn Memora-btn-ghost text-xs">
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-1.5 bg-bg-secondary rounded text-sm">
                    {config.label}
                  </span>
                  <button onClick={handleStartRename} className="Memora-btn Memora-btn-ghost text-xs" title="重命名">
                    ✎
                  </button>
                  <button
                    onClick={handleRemoveProvider}
                    className="Memora-btn Memora-btn-ghost text-xs text-red-500"
                    title="删除此供应商"
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>

            {/* API 协议风格 */}
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                API 协议风格
              </label>
              <select
                value={config.apiStyle}
                onChange={(e) => setProviderApiStyle(activeProvider, e.target.value as AiApiStyle)}
                className="Memora-input w-full"
              >
                {(Object.keys(API_STYLE_META) as AiApiStyle[]).map((s) => (
                  <option key={s} value={s}>
                    {API_STYLE_META[s].label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-fg-muted mt-1 leading-relaxed">
                {currentStyleMeta.description}
              </p>
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
                placeholder={currentStyleMeta.defaultBaseUrl}
                className="Memora-input w-full"
              />
            </div>

            {/* API Key（ollama 无需鉴权，隐藏） */}
            {currentStyleMeta.needsApiKey && (
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
            )}

            {/* 对话模型 */}
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                对话模型（用于总结）
              </label>
              <input
                type="text"
                value={config.chatModel}
                onChange={(e) => setConfig({ chatModel: e.target.value })}
                placeholder={config.apiStyle === 'gemini' ? 'gemini-1.5-flash' : config.apiStyle === 'anthropic' ? 'claude-3-5-sonnet-20241022' : config.apiStyle === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'}
                className="Memora-input w-full"
              />
            </div>

            {/* 嵌入模型 + 维度 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                  嵌入模型（用于语义搜索）
                </label>
                <input
                  type="text"
                  value={config.embeddingModel}
                  onChange={(e) => setConfig({ embeddingModel: e.target.value })}
                  placeholder={config.apiStyle === 'gemini' ? 'text-embedding-004' : config.apiStyle === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small'}
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

            {/* 测试连接 */}
            <div className="pt-2 flex items-center gap-2 flex-wrap">
              <button
                onClick={handleTest}
                disabled={!configured || testStatus === 'testing'}
                className="Memora-btn Memora-btn-ghost text-xs disabled:opacity-50"
              >
                {testStatus === 'testing' ? '测试中…' : '测试连接'}
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

        {/* 底部 */}
        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="Memora-btn Memora-btn-primary text-sm">
            完成
          </button>
        </div>

        {/* 新增供应商对话框 */}
        {showAddDialog && (
          <div
            className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl"
            onClick={() => setShowAddDialog(false)}
          >
            <div
              className="bg-bg-primary border border-border rounded-lg shadow-xl w-80 p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold">新增供应商</h3>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">名称</label>
                <input
                  type="text"
                  value={newProviderLabel}
                  onChange={(e) => setNewProviderLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddProvider()}
                  placeholder="如：SiliconFlow / Kimi / 本地 Ollama"
                  className="Memora-input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-fg-secondary mb-1">API 协议</label>
                <select
                  value={newProviderStyle}
                  onChange={(e) => setNewProviderStyle(e.target.value as AiApiStyle)}
                  className="Memora-input w-full"
                >
                  {(Object.keys(API_STYLE_META) as AiApiStyle[]).map((s) => (
                    <option key={s} value={s}>
                      {API_STYLE_META[s].label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-fg-muted mt-1 leading-relaxed">
                  {API_STYLE_META[newProviderStyle].description}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowAddDialog(false)} className="Memora-btn Memora-btn-ghost text-xs">
                  取消
                </button>
                <button
                  onClick={handleAddProvider}
                  disabled={!newProviderLabel.trim()}
                  className="Memora-btn Memora-btn-primary text-xs disabled:opacity-50"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
