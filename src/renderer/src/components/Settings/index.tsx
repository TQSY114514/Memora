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
