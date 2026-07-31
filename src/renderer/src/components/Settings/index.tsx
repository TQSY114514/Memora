import { useState } from 'react'
import { useT, useI18nStore, LANGUAGES } from '../../i18n'
import { useThemeStore } from '../../stores/themeStore'

interface SettingsProps {
  onClose: () => void
  onOpenAiSettings: () => void
}

/**
 * 设置面板
 * - 核心功能：界面语言切换、主题切换、背景图片
 * - 入口：打开 AI 配置弹窗
 */
export function Settings({ onClose, onOpenAiSettings }: SettingsProps) {
  const t = useT()
  const { lang, setLang } = useI18nStore()
  const { mode, setMode, backgroundImage, setBackgroundImage, blur, setBlur, opacity, setOpacity } = useThemeStore()

  function handleOpenAiSettings() {
    onClose()
    onOpenAiSettings()
  }

  async function handleBgUpload() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        setBackgroundImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const [backupLoading, setBackupLoading] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [maintMsg, setMaintMsg] = useState<string | null>(null)
  const [maintLoading, setMaintLoading] = useState(false)

  async function handleExportBackup() {
    setBackupLoading(true)
    setBackupMsg(null)
    try {
      const data = await window.Memora.backup.export()
      const json = JSON.stringify(data, null, 2)
      const date = new Date().toISOString().slice(0, 10)
      await window.Memora.saveFileDialog({
        defaultName: `memora-backup-${date}.json`,
        content: json
      })
      setBackupMsg('✓ 备份已导出')
    } catch (e) {
      setBackupMsg('✗ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBackupLoading(false)
    }
  }

  async function handleImportBackup() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (!confirm('恢复将覆盖当前所有数据，确定继续？')) return
      setBackupLoading(true)
      setBackupMsg(null)
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const result = await window.Memora.backup.import(data)
        setBackupMsg(`✓ 已恢复 ${result.restored} 个对话，请重启应用`)
      } catch (e) {
        setBackupMsg('✗ ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        setBackupLoading(false)
      }
    }
    input.click()
  }

  async function handleVacuum() {
    setMaintLoading(true)
    setMaintMsg(null)
    try {
      await window.Memora.db.vacuum()
      setMaintMsg('✓ 数据库已压缩')
    } catch (e) {
      setMaintMsg('✗ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setMaintLoading(false)
    }
  }

  async function handleCleanOrphans() {
    setMaintLoading(true)
    setMaintMsg(null)
    try {
      const result = await window.Memora.db.cleanOrphans()
      setMaintMsg(`✓ 清理了 ${result.cleaned} 条孤儿数据`)
    } catch (e) {
      setMaintMsg('✗ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setMaintLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-[460px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{t('settings.title')}</h2>
            <p className="text-xs text-fg-muted mt-0.5">{t('settings.subtitle')}</p>
          </div>
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 界面语言 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              {t('settings.language')}
            </label>
            <p className="text-[11px] text-fg-muted mb-2.5">{t('settings.languageHint')}</p>
            <div className="flex gap-2 flex-wrap">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    lang === l.code
                      ? 'bg-accent text-white'
                      : 'bg-bg-hover text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* 主题模式 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              {t('settings.theme')}
            </label>
            <div className="flex gap-2">
              {([
                { code: 'light', label: t('settings.themeLight') },
                { code: 'dark', label: t('settings.themeDark') },
                { code: 'system', label: t('settings.themeSystem') }
              ] as const).map((th) => (
                <button
                  key={th.code}
                  onClick={() => setMode(th.code)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    mode === th.code
                      ? 'bg-accent text-white'
                      : 'bg-bg-hover text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  {th.label}
                </button>
              ))}
            </div>
          </div>

          {/* 背景图片 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              {t('settings.backgroundImage')}
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBgUpload}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                {backgroundImage ? t('settings.changeImage') : t('settings.uploadImage')}
              </button>
              {backgroundImage && (
                <button
                  onClick={() => setBackgroundImage(null)}
                  className="Memora-btn Memora-btn-ghost text-xs text-red-500"
                >
                  {t('settings.clearImage')}
                </button>
              )}
            </div>
            {backgroundImage && (
              <>
                <div className="mt-3">
                  <label className="block text-[10px] text-fg-muted mb-1">
                    {t('settings.blur')} ({blur}px)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={blur}
                    onChange={(e) => setBlur(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
                <div className="mt-2">
                  <label className="block text-[10px] text-fg-muted mb-1">
                    {t('settings.opacity')} ({Math.round(opacity * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(opacity * 100)}
                    onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                    className="w-full accent-accent"
                  />
                </div>
              </>
            )}
          </div>

          {/* AI 配置 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              {t('settings.aiSection')}
            </label>
            <button
              onClick={handleOpenAiSettings}
              className="Memora-btn Memora-btn-ghost text-xs"
            >
              {t('settings.aiConfigBtn')}
            </button>
          </div>

          {/* 数据备份与恢复 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              数据备份与恢复
            </label>
            <p className="text-[11px] text-fg-muted mb-2.5">导出全部数据为 JSON 文件，或从备份恢复（会覆盖当前数据）。</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportBackup}
                disabled={backupLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                {backupLoading ? '⏳ 处理中…' : '⬇ 导出备份'}
              </button>
              <button
                onClick={handleImportBackup}
                disabled={backupLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                ⬆ 恢复备份
              </button>
            </div>
            {backupMsg && (
              <p className={`text-xs mt-2 ${backupMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {backupMsg}
              </p>
            )}
          </div>

          {/* 数据库维护 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              数据库维护
            </label>
            <p className="text-[11px] text-fg-muted mb-2.5">压缩数据库文件（VACUUM）或清理引用了已删除对话的孤儿数据。</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleVacuum}
                disabled={maintLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                {maintLoading ? '⏳ 处理中…' : '🗜 压缩数据库'}
              </button>
              <button
                onClick={handleCleanOrphans}
                disabled={maintLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                🧹 清理孤儿数据
              </button>
            </div>
            {maintMsg && (
              <p className={`text-xs mt-2 ${maintMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {maintMsg}
              </p>
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="Memora-btn Memora-btn-primary text-sm">
            {t('settings.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
