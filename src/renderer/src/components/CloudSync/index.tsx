import { useState, useEffect, useCallback } from 'react'

interface CloudSyncPanelProps {
  onClose: () => void
}

export function CloudSyncPanel({ onClose }: CloudSyncPanelProps) {
  const [config, setConfig] = useState<{
    enabled: boolean; protocol: string; endpoint: string
    username?: string; password?: string; intervalMinutes: number
    encryptionPassword?: string
  }>({
    enabled: false, protocol: 'webdav', endpoint: '', intervalMinutes: 30
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; latency?: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const c = await window.Memora.sync.getConfig()
      setConfig(c)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  async function handleSave() {
    try {
      await window.Memora.sync.setConfig(config)
      setSyncResult('配置已保存')
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.Memora.sync.testConnection()
      setTestResult(result)
    } catch (e) {
      setTestResult({ success: false, error: String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await window.Memora.sync.perform({})
      setSyncResult(result.lastResult === 'success'
        ? `同步成功！上传 ${result.uploadedCount} 条，下载 ${result.downloadedCount} 条`
        : `同步失败：${result.error}`)
    } catch (e) {
      setSyncResult(`同步失败：${String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">云端同步</h2>
            <p className="text-xs text-fg-muted mt-0.5">端到端加密同步，云端不可读</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-lg">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 启用开关 */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            启用云端同步
          </label>

          {/* 协议选择 */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1">协议</label>
            <select
              value={config.protocol}
              onChange={(e) => setConfig({ ...config, protocol: e.target.value })}
              className="Memora-input w-full text-sm"
            >
              <option value="webdav">WebDAV</option>
              <option value="s3">S3 兼容</option>
            </select>
          </div>

          {/* 端点 */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1">服务端点 URL</label>
            <input
              type="text"
              value={config.endpoint}
              onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
              className="Memora-input w-full text-sm"
              placeholder="https://your-webdav-server.com"
            />
          </div>

          {/* 认证 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-fg-secondary mb-1">用户名</label>
              <input
                type="text"
                value={config.username ?? ''}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                className="Memora-input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-secondary mb-1">密码</label>
              <input
                type="password"
                value={config.password ?? ''}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                className="Memora-input w-full text-sm"
              />
            </div>
          </div>

          {/* 加密密码 */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1">
              加密密码
              <span className="text-fg-muted ml-1">（E2EE 密钥，云端无法解密你的数据）</span>
            </label>
            <input
              type="password"
              value={config.encryptionPassword ?? ''}
              onChange={(e) => setConfig({ ...config, encryptionPassword: e.target.value })}
              className="Memora-input w-full text-sm"
              placeholder="设置强密码"
            />
          </div>

          {/* 同步间隔 */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1">同步间隔（分钟）</label>
            <input
              type="number"
              value={config.intervalMinutes}
              onChange={(e) => setConfig({ ...config, intervalMinutes: Number(e.target.value) })}
              className="Memora-input w-full text-sm"
              min={10}
              max={1440}
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button onClick={handleSave} className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5">
              保存配置
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !config.endpoint}
              className="Memora-btn Memora-btn-ghost text-xs px-4 py-1.5"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing || !config.enabled || !config.endpoint}
              className="Memora-btn Memora-btn-ghost text-xs px-4 py-1.5"
            >
              {syncing ? '同步中...' : '立即同步'}
            </button>
          </div>

          {/* 结果 */}
          {testResult && (
            <div className={`p-3 rounded-md text-xs ${testResult.success ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
              {testResult.success
                ? `连接成功！延迟 ${testResult.latency}ms`
                : `连接失败：${testResult.error}`}
            </div>
          )}
          {syncResult && (
            <div className="p-3 rounded-md text-xs bg-accent/10 text-accent">
              {syncResult}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-md text-xs bg-red-500/10 text-red-500">
              {error}
            </div>
          )}

          {/* 安全说明 */}
          <div className="bg-bg-hover rounded-md p-3 text-xs text-fg-muted space-y-1">
            <p className="font-medium text-fg-secondary">安全说明</p>
            <p>所有数据在本地使用 AES-256-GCM 加密后上传，云端无法解密。</p>
            <p>加密密码仅保存在本地，不会上传到云端。</p>
            <p>请妥善保管加密密码，丢失后将无法恢复数据。</p>
          </div>
        </div>
      </div>
    </div>
  )
}