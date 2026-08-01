import { useState } from 'react'
import type { Preference } from '@shared/types'

export function PreferenceEditor({
  pref,
  workspaceId,
  sessionId,
  onCancel,
  onSaved
}: {
  pref: Preference | null
  workspaceId: string
  sessionId?: string
  onCancel: () => void
  onSaved: (pref: Preference) => void
}) {
  const isEdit = !!pref
  const [subject, setSubject] = useState(pref?.subject ?? '')
  const [value, setValue] = useState(pref?.value ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!subject.trim()) {
      setErr('类别（subject）不能为空')
      return
    }
    if (!value.trim()) {
      setErr('偏好值不能为空')
      return
    }
    if (!workspaceId) {
      setErr('未选择工作区')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      let result: Preference | null
      if (isEdit && pref) {
        result = await window.Memora.preference.update(pref.id, {
          subject: subject.trim(),
          value: value.trim()
        })
      } else {
        result = await window.Memora.preference.create({
          workspaceId,
          sessionId,
          subject: subject.trim(),
          value: value.trim(),
          source: 'manual'
        })
      }
      if (result) onSaved(result)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-bg-primary rounded-lg shadow-xl p-5 w-[480px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-4">{isEdit ? '编辑偏好' : '新建偏好'}</h3>

        <label className="block text-xs text-fg-secondary mb-1">类别（subject）</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="Memora-input w-full text-sm mb-3"
          placeholder="如：music / phone / language / editor / framework"
          autoFocus
        />

        <label className="block text-xs text-fg-secondary mb-1">偏好值（value）</label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="Memora-input w-full text-sm mb-3"
          rows={3}
          placeholder="如：初音未来 / android / Python"
        />

        {err && <p className="text-xs text-red-500 mb-2 break-all">✗ {err}</p>}

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onCancel} className="Memora-btn Memora-btn-ghost text-xs">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="Memora-btn Memora-btn-primary text-xs"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
