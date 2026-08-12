import { useState, useEffect } from 'react'
import {
  useAiConfigStore,
  isAiConfigured
} from '../../stores/aiConfigStore'
import { API_STYLE_META } from '@shared/constants'
import type { AiApiStyle, EmbeddingMode } from '@shared/types'
import { Modal } from '../Modal'

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
  // safeStorage 不可用时（无 libsecret 的 Linux）API Key 会明文降级存储
  const [encryptionAvailable, setEncryptionAvailable] = useState(true)
  // v1.8 #15：本地嵌入模型状态
  const [localEmbedderStatus, setLocalEmbedderStatus] = useState<{
    state: 'idle' | 'loading' | 'ready' | 'error'
    model?: string
    dim?: number
    error?: string
    progress?: {
      status?: string
      file?: string | null
      percent?: number | null
      loaded?: number | null
      total?: number | null
    }
  }>({ state: 'idle' })
  // 本地模型下载镜像与缓存管理
  const [mirror, setMirror] = useState('')
  const [cacheInfo, setCacheInfo] = useState<{
    models: Array<{ id: string; sizeBytes: number }>
    totalBytes: number
  } | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)

  useEffect(() => {
    window.Memora.secret.isEncryptionAvailable().then(setEncryptionAvailable).catch(() => {})
  }, [])

  // 轮询本地嵌入模型状态
  useEffect(() => {
    if (config.embeddingMode !== 'local') return
    let cancelled = false
    window.Memora.ai.getLocalModelMirror().then((m) => { if (!cancelled) setMirror(m ?? '') }).catch(() => {})
    window.Memora.ai.getLocalModelCacheInfo().then((info) => { if (!cancelled && info.ok) setCacheInfo(info) }).catch(() => {})
    const fetchStatus = () => {
      window.Memora.ai.getLocalEmbedderStatus().then((s) => {
        if (!cancelled) {
          setLocalEmbedderStatus(s)
          if (s.state === 'loading') {
            setTimeout(fetchStatus, 1000)
          }
        }
      }).catch(() => {})
    }
    fetchStatus()
    return () => { cancelled = true }
  }, [config.embeddingMode])

  async function handleSaveMirror() {
    try {
      const next = await window.Memora.ai.setLocalModelMirror(mirror)
      setMirror(next ?? '')
    } catch { /* ignore */ }
  }

  async function handleCleanModelCache() {
    if (cacheBusy) return
    setCacheBusy(true)
    try {
      await window.Memora.ai.deleteLocalModel(config.embeddingModel)
      const info = await window.Memora.ai.getLocalModelCacheInfo()
      if (info.ok) setCacheInfo(info)
    } catch { /* ignore */ } finally {
      setCacheBusy(false)
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const idx = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
    return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
  }

  async function handleTest() {
    setTestStatus('testing')
    setTestMessage('')
    try {
      const result = await window.Memora.ai.testConnection({
        apiStyle: config.apiStyle,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        chatModel: config.chatModel,
        embeddingModel: config.embeddingModel,
        embeddingMode: config.embeddingMode
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
    <Modal onClose={onClose} className="w-[680px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">AI 配置</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              支持无限添加供应商，每个独立配置。配置仅保存在本地。
            </p>
          </div>
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
          </button>
        </div>

        {/* 明文降级警告：safeStorage 不可用时 API Key 将明文存储 */}
        {!encryptionAvailable && (
          <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
            <span className="mt-0.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            </span>
            <span>
              当前系统不支持加密存储（safeStorage 不可用），API Key 将以<b>明文</b>保存在本地 <code>secrets.enc</code> 文件中。建议安装 libsecret / gnome-keyring 以启用加密存储。
            </span>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：供应商列表 */}
          <div className="w-48 border-r border-border bg-bg-secondary overflow-y-auto">
            <div className="p-2 space-y-0.5">
              {providerKeys.map((p) => {
                const cfg = configs[p]
                // v1.8 #15：local 模式下 embeddingModel 为本地模型 ID（非空即算配置）
                const needsKey = API_STYLE_META[cfg.apiStyle].needsApiKey
                const isConfigured = cfg.embeddingMode === 'local'
                  ? !!(cfg.baseUrl && cfg.chatModel && (!needsKey || cfg.hasApiKey || cfg.apiKey))
                  : !!(cfg.baseUrl && cfg.chatModel && cfg.embeddingModel && (!needsKey || cfg.hasApiKey || cfg.apiKey))
                return (
                  <button
                    key={p}
                    onClick={() => setActiveProvider(p)}
                    className={`w-full text-left px-2.5 py-2 rounded text-xs transition-colors ${
                      activeProvider === p
                        ? 'Memora-chip-accent'
                        : 'text-fg-secondary hover:bg-bg-hover'
                    }`}
                    title={cfg.label}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{cfg.label}</span>
                      {isConfigured && (
                        <span className={activeProvider === p ? 'text-accent-ink' : 'text-green-500'}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                      )}
                    </div>
                    <div className={`text-xs mt-0.5 ${activeProvider === p ? 'text-accent-ink/70' : 'text-fg-muted'}`}>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                  </button>
                  <button
                    onClick={handleRemoveProvider}
                    className="Memora-btn Memora-btn-ghost text-xs text-red-500"
                    title="删除此供应商"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
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
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">
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

            {/* 嵌入模式选择（v1.8 #15） */}
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                嵌入模式（用于语义搜索）
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfig({ embeddingMode: 'api' as EmbeddingMode })}
                  className={`flex-1 px-3 py-2 rounded text-xs transition-colors border ${
                    config.embeddingMode === 'api'
                      ? 'Memora-chip-accent border-accent'
                      : 'bg-bg-secondary text-fg-secondary border-border hover:bg-bg-hover'
                  }`}
                >
                  API 远程嵌入
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ embeddingMode: 'local' as EmbeddingMode })}
                  className={`flex-1 px-3 py-2 rounded text-xs transition-colors border ${
                    config.embeddingMode === 'local'
                      ? 'Memora-chip-accent border-accent'
                      : 'bg-bg-secondary text-fg-secondary border-border hover:bg-bg-hover'
                  }`}
                >
                  本地 ONNX 嵌入（隐私优先）
                </button>
              </div>
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                {config.embeddingMode === 'local'
                  ? '嵌入向量在本地计算，无需 API 密钥，首次使用时自动下载模型（~23MB）。对话总结仍走 API。'
                  : '嵌入向量通过 API 远程计算，需要供应商支持 embeddings 接口。'}
              </p>
            </div>

            {/* 嵌入模型配置：API 模式 或 本地模式 */}
            {config.embeddingMode === 'local' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-fg-secondary mb-1.5">
                    本地嵌入模型
                  </label>
                  <select
                    value={config.embeddingModel}
                    onChange={(e) => {
                      const modelId = e.target.value
                      const dims: Record<string, number> = {
                        'Xenova/all-MiniLM-L6-v2': 384,
                        'Xenova/multilingual-e5-small': 384,
                        'Xenova/bge-small-zh-v1.5': 512
                      }
                      setConfig({
                        embeddingModel: modelId,
                        embeddingDim: dims[modelId] ?? 384
                      })
                    }}
                    className="Memora-input w-full"
                  >
                    <option value="Xenova/all-MiniLM-L6-v2">all-MiniLM-L6-v2（~23MB · 轻量多语言）</option>
                    <option value="Xenova/multilingual-e5-small">multilingual-e5-small（~120MB · 多语言含中文）</option>
                    <option value="Xenova/bge-small-zh-v1.5">bge-small-zh-v1.5（~50MB · 中文专用）</option>
                  </select>
                  <p className="text-xs text-fg-muted mt-1">
                    向量维度：{config.embeddingDim}（自动匹配模型）
                  </p>
                </div>
                {/* 模型状态与预加载 */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {localEmbedderStatus.state === 'idle' && (
                    <button
                      type="button"
                      onClick={() => {
                        window.Memora.ai.loadLocalModel(config.embeddingModel).catch(() => {})
                      }}
                      className="Memora-btn Memora-btn-ghost text-xs"
                    >
                      预加载模型
                    </button>
                  )}
                  {localEmbedderStatus.state === 'loading' && (
                    <>
                      <span className="text-fg-muted">模型加载中…（首次需下载）</span>
                      {localEmbedderStatus.progress?.percent != null && (
                        <span className="text-fg-muted">
                          （{Math.round(localEmbedderStatus.progress.percent)}%）
                        </span>
                      )}
                    </>
                  )}
                  {localEmbedderStatus.state === 'ready' && (
                    <span className="text-green-600">
                      ✓ 模型就绪（{localEmbedderStatus.model}，{localEmbedderStatus.dim}维）
                    </span>
                  )}
                  {localEmbedderStatus.state === 'error' && (
                    <span className="text-red-500 break-all">
                      ✗ 加载失败：{localEmbedderStatus.error}
                    </span>
                  )}
                </div>
                {/* 模型下载镜像：国内网络可配置 hf-mirror.com 等镜像加速 */}
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="text"
                    value={mirror}
                    onChange={(e) => setMirror(e.target.value)}
                    placeholder="https://hf-mirror.com"
                    className="Memora-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleSaveMirror}
                    className="Memora-btn Memora-btn-ghost text-xs whitespace-nowrap"
                  >
                    保存镜像
                  </button>
                </div>
                {cacheInfo && (
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    <span>模型缓存：{formatBytes(cacheInfo.totalBytes)}</span>
                    <button
                      type="button"
                      onClick={handleCleanModelCache}
                      disabled={cacheBusy}
                      className="text-fg-muted underline hover:text-red-500 disabled:opacity-50"
                    >
                      清理当前模型
                    </button>
                  </div>
                )}
              </div>
            ) : (
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
                    min={1}
                    max={8192}
                    value={config.embeddingDim}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      // 仅在合法范围（1-8192）内更新，避免清空输入框时维度变为 0 导致向量操作失败
                      if (!Number.isNaN(n) && n >= 1 && n <= 8192) {
                        setConfig({ embeddingDim: n })
                      }
                    }}
                    placeholder="1536"
                    className="Memora-input w-full"
                  />
                </div>
              </div>
            )}

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
                <p className="text-xs text-fg-muted mt-1 leading-relaxed">
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
    </Modal>
  )
}
