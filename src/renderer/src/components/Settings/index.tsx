import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useT, useI18nStore, LANGUAGES } from '../../i18n'
import { useThemeStore } from '../../stores/themeStore'
import { useBgImportStore } from '../../stores/backgroundImportStore'
import type { Folder, Workspace } from '@shared/types'
import { DistillationTemplates } from '../DistillationTemplates'
import { Modal } from '../Modal'

interface SettingsProps {
  onClose: () => void
  onOpenAiSettings: () => void
  onOpenMcpPermissions: () => void
  onOpenMemoryAgent: () => void
  onOpenCloudSync: () => void
  onOpenTimeCapsule: () => void
  onOpenTeamWorkspace: () => void
  onOpenTemplateMarket: () => void
  onOpenMigrationWizard: () => void
  onOpenIdentityProfile: () => void
  onOpenSecurityCenter: () => void
}

/**
 * 设置面板
 * - 核心功能：界面语言切换、主题切换、背景图片
 * - 入口：打开 AI 配置弹窗、收纳其他功能面板入口
 */
export function Settings({
  onClose,
  onOpenAiSettings,
  onOpenMcpPermissions,
  onOpenMemoryAgent,
  onOpenCloudSync,
  onOpenTimeCapsule,
  onOpenTeamWorkspace,
  onOpenTemplateMarket,
  onOpenMigrationWizard,
  onOpenIdentityProfile,
  onOpenSecurityCenter
}: SettingsProps) {
  const t = useT()
  // selector 订阅：数据字段 useShallow 组合订阅；action 引用稳定单独取
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  const { mode, backgroundImage, blur, opacity } = useThemeStore(
    useShallow((s) => ({
      mode: s.mode,
      backgroundImage: s.backgroundImage,
      blur: s.blur,
      opacity: s.opacity
    }))
  )
  const setMode = useThemeStore((s) => s.setMode)
  const setBackgroundImage = useThemeStore((s) => s.setBackgroundImage)
  const setBlur = useThemeStore((s) => s.setBlur)
  const setOpacity = useThemeStore((s) => s.setOpacity)

  function handleOpenAiSettings() {
    onClose()
    onOpenAiSettings()
  }

  function openPanel(open: () => void) {
    onClose()
    open()
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
  const [migrateLoading, setMigrateLoading] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null)
  const [showDistillTemplates, setShowDistillTemplates] = useState(false)

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

  async function handleExportData() {
    setMigrateLoading(true)
    setMigrateMsg(null)
    try {
      const result = await window.Memora.system.exportData()
      if (result.success) {
        setMigrateMsg(`✓ 已导出到：${result.path}`)
      } else if (result.error) {
        setMigrateMsg('✗ ' + result.error)
      }
    } catch (e) {
      setMigrateMsg('✗ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setMigrateLoading(false)
    }
  }

  async function handleImportData() {
    if (!confirm('导入将用迁移包中的数据完全替换当前的数据库和 AI 配置，且不可撤销。确定继续？')) {
      return
    }
    setMigrateLoading(true)
    setMigrateMsg(null)
    try {
      const result = await window.Memora.system.importData()
      if (result.success) {
        setMigrateMsg('✓ 导入成功，请重启应用以使全部数据生效')
      } else if (result.error) {
        setMigrateMsg('✗ ' + result.error)
      }
    } catch (e) {
      setMigrateMsg('✗ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setMigrateLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} className="w-[460px] max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{t('settings.title')}</h2>
            <p className="text-xs text-fg-muted mt-0.5">{t('settings.subtitle')}</p>
          </div>
          <button onClick={onClose} className="Memora-btn Memora-btn-ghost text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 界面语言 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              {t('settings.language')}
            </label>
            <p className="text-xs text-fg-muted mb-2.5">{t('settings.languageHint')}</p>
            <div className="flex gap-2 flex-wrap">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    lang === l.code
                      ? 'Memora-chip-accent'
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
                      ? 'Memora-chip-accent'
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
                  <label className="block text-xs text-fg-muted mb-1">
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
                  <label className="block text-xs text-fg-muted mb-1">
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

          {/* 其他功能 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              其他功能
            </label>
            <p className="text-xs text-fg-muted mb-2.5">
              记忆管理、同步与安全等高级功能。
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <FeatureButton title="MCP 权限" tip="MCP 工具权限管理" onClick={() => openPanel(onOpenMcpPermissions)} />
              <FeatureButton title="记忆智能体" tip="记忆智能体 - 知识缺口扫描 & 复习提醒" onClick={() => openPanel(onOpenMemoryAgent)} />
              <FeatureButton title="云端同步" tip="端到端加密云端同步" onClick={() => openPanel(onOpenCloudSync)} />
              <FeatureButton title="时间胶囊" tip="记忆时间胶囊 - 封存记忆，未来开启" onClick={() => openPanel(onOpenTimeCapsule)} />
              <FeatureButton title="团队共享" tip="团队记忆共享 - 协作工作区" onClick={() => openPanel(onOpenTeamWorkspace)} />
              <FeatureButton title="模板市场" tip="记忆模板市场 - 社区专家记忆包" onClick={() => openPanel(onOpenTemplateMarket)} />
              <FeatureButton title="迁移向导" tip="AI 迁移向导 - 从其他平台迁移" onClick={() => openPanel(onOpenMigrationWizard)} />
              <FeatureButton title="身份画像" tip="AI 身份画像 - 一键生成你的 AI 人格" onClick={() => openPanel(onOpenIdentityProfile)} />
              <FeatureButton title="安全中心" tip="安全中心 - 加密状态 + 敏感信息扫描" onClick={() => openPanel(onOpenSecurityCenter)} />
            </div>
          </div>

          {/* 蒸馏模板 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              蒸馏模板
            </label>
            <p className="text-xs text-fg-muted mb-2.5">
              自定义记忆蒸馏的 System Prompt，内置「默认 / 技术决策 / 学习笔记」三种模板，也可新建专属模板。
            </p>
            <button
              onClick={() => setShowDistillTemplates(true)}
              className="Memora-btn Memora-btn-ghost text-xs"
            >
              管理蒸馏模板
            </button>
          </div>

          {/* 数据备份与恢复 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              数据备份与恢复
            </label>
            <p className="text-xs text-fg-muted mb-2.5">导出全部数据为 JSON 文件，或从备份恢复（会覆盖当前数据）。</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportBackup}
                disabled={backupLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                {backupLoading ? '处理中…' : '导出备份'}
              </button>
              <button
                onClick={handleImportBackup}
                disabled={backupLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                恢复备份
              </button>
            </div>
            {backupMsg && (
              <p className={`text-xs mt-2 ${backupMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {backupMsg}
              </p>
            )}
          </div>

          {/* 数据迁移 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              数据迁移
            </label>
            <p className="text-xs text-fg-muted mb-2.5">
              将整个工作区（数据库 + AI 配置）导出为单个归档文件，可在另一台机器上导入恢复。导入会完全替换当前数据。
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportData}
                disabled={migrateLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                {migrateLoading ? '处理中…' : '导出数据'}
              </button>
              <button
                onClick={handleImportData}
                disabled={migrateLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                导入数据
              </button>
            </div>
            {migrateMsg && (
              <p
                className={`text-xs mt-2 break-all ${
                  migrateMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {migrateMsg}
              </p>
            )}
          </div>

          {/* 数据库维护 */}
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              数据库维护
            </label>
            <p className="text-xs text-fg-muted mb-2.5">压缩数据库文件（VACUUM）或清理引用了已删除对话的孤儿数据。</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleVacuum}
                disabled={maintLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                {maintLoading ? '处理中…' : '压缩数据库'}
              </button>
              <button
                onClick={handleCleanOrphans}
                disabled={maintLoading}
                className="Memora-btn Memora-btn-ghost text-xs"
              >
                清理孤儿数据
              </button>
            </div>
            {maintMsg && (
              <p className={`text-xs mt-2 ${maintMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {maintMsg}
              </p>
            )}
          </div>

          {/* 后台静默导入 */}
          <BackgroundImportSection />
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="Memora-btn Memora-btn-primary text-sm">
            {t('settings.done')}
          </button>
        </div>

        {/* 蒸馏模板管理弹层 */}
        {showDistillTemplates && (
          <DistillationTemplates onClose={() => setShowDistillTemplates(false)} />
        )}
    </Modal>
  )
}

/** 其他功能入口按钮 */
function FeatureButton({ title, tip, onClick }: { title: string; tip: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="Memora-btn Memora-btn-ghost text-xs text-left px-2 py-1.5"
      title={tip}
    >
      {title}
    </button>
  )
}

/** 后台静默导入设置分区 */
function BackgroundImportSection() {
  // selector 订阅：数据字段 useShallow 组合订阅；action 引用稳定单独取
  const { config, status } = useBgImportStore(
    useShallow((s) => ({ config: s.config, status: s.status }))
  )
  const loadConfig = useBgImportStore((s) => s.loadConfig)
  const loadStatus = useBgImportStore((s) => s.loadStatus)
  const setConfig = useBgImportStore((s) => s.setConfig)
  const runOnce = useBgImportStore((s) => s.runOnce)
  const [folders, setFolders] = useState<Folder[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  useEffect(() => {
    loadConfig()
    loadStatus()
    window.Memora.folder.list().then(setFolders).catch(() => {})
    window.Memora.workspace.list().then(setWorkspaces).catch(() => {})
  }, [loadConfig, loadStatus])

  const enabled = config?.enabled ?? false
  const targetFolderId = config?.targetFolderId ?? ''
  const intervalMinutes = config?.intervalMinutes ?? 30
  const runOnStartup = config?.runOnStartup ?? true
  const running = status?.running ?? false

  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? ''
  const folderLabel = (f: Folder) =>
    wsName(f.workspaceId) ? `${wsName(f.workspaceId)} / ${f.name}` : f.name

  async function handleToggleEnabled() {
    await setConfig({ enabled: !enabled })
  }
  async function handleFolder(e: ChangeEvent<HTMLSelectElement>) {
    await setConfig({ targetFolderId: e.target.value || null })
  }
  async function handleInterval(e: ChangeEvent<HTMLInputElement>) {
    const v = Math.max(1, Number(e.target.value) || 1)
    await setConfig({ intervalMinutes: v })
  }
  async function handleToggleRunOnStartup() {
    await setConfig({ runOnStartup: !runOnStartup })
  }
  async function handleRunOnce() {
    await runOnce()
  }

  const last = status?.lastResult

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-fg-secondary">后台静默导入</label>
        <button
          onClick={handleToggleEnabled}
          className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-bg-hover'}`}
          aria-label="启用后台静默导入"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-fg-muted mb-2.5">
        应用启动后自动扒取已安装的 AI 应用（Cursor / Claude Code 等）并导入新对话，重复对话自动跳过。
      </p>

      <div className="space-y-2.5">
        {/* 目标文件夹 */}
        <div>
          <label className="block text-xs text-fg-muted mb-1">目标文件夹（必选）</label>
          <select
            value={targetFolderId}
            onChange={handleFolder}
            className="Memora-input w-full text-xs py-1"
          >
            <option value="">— 请选择 —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {folderLabel(f)}
              </option>
            ))}
          </select>
        </div>

        {/* 轮询间隔 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-fg-muted">轮询间隔</label>
          <input
            type="number"
            min={1}
            value={intervalMinutes}
            onChange={handleInterval}
            className="Memora-input w-20 text-xs py-1"
          />
          <span className="text-xs text-fg-muted">分钟</span>
        </div>

        {/* 启动时立即执行 */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-fg-muted">启动时立即执行一次</label>
          <button
            onClick={handleToggleRunOnStartup}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              runOnStartup ? 'bg-accent' : 'bg-bg-hover'
            }`}
            aria-label="启动时立即执行"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                runOnStartup ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>

        {/* 立即执行一次 */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={handleRunOnce}
            disabled={running || !targetFolderId}
            className="Memora-btn Memora-btn-ghost text-xs"
          >
            {running ? '执行中…' : '立即执行一次'}
          </button>
          {enabled && !targetFolderId && (
            <span className="text-xs text-red-500">请先选择目标文件夹</span>
          )}
        </div>

        {/* 上次结果 */}
        {last && (
          <div className="text-xs text-fg-muted mt-1 space-y-0.5">
            <p>
              上次：+{last.imported} 新 / 跳过 {last.skipped} / 失败 {last.failed}
              <span className="ml-1">· 耗时 {(last.durationMs / 1000).toFixed(1)}s</span>
            </p>
            {status?.lastRunAt && (
              <p>时间：{new Date(status.lastRunAt).toLocaleString()}</p>
            )}
            {last.errors.length > 0 && (
              <p className="text-red-500 truncate" title={last.errors.join('\n')}>
                {last.errors[0]}
              </p>
            )}
          </div>
        )}
        {enabled && status?.nextRunAt && (
          <p className="text-xs text-fg-muted">
            下次：{new Date(status.nextRunAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
