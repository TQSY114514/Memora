import { useState, useEffect, useRef, useCallback } from 'react'

interface DialogState {
  open: boolean
  mode: 'prompt' | 'confirm'
  title: string
  message?: string
  defaultValue?: string
  resolve?: (value: string | boolean | null) => void
}

/**
 * 替代 window.prompt / window.confirm 的 React hook
 * Electron 默认禁用 prompt/confirm/alert，必须用自定义弹窗
 */
export function useDialog() {
  const [state, setState] = useState<DialogState>({
    open: false,
    mode: 'prompt',
    title: ''
  })

  const prompt = useCallback((title: string, defaultValue?: string) => {
    return new Promise<string | null>((resolve) => {
      setState({ open: true, mode: 'prompt', title, defaultValue, resolve })
    })
  }, [])

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, mode: 'confirm', title: message, resolve })
    })
  }, [])

  const alert = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      setState({ open: true, mode: 'confirm', title: message, resolve: () => resolve() })
    })
  }, [])

  const handleClose = useCallback(
    (value: string | boolean | null) => {
      state.resolve?.(value)
      setState((s) => ({ ...s, open: false, resolve: undefined }))
    },
    [state]
  )

  return { state, prompt, confirm, alert, handleClose }
}

/** 弹窗组件 —— prompt 和 confirm 模式共用 */
export function PromptDialog({
  state,
  onClose
}: {
  state: DialogState
  onClose: (value: string | boolean | null) => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.open) {
      setValue(state.defaultValue ?? '')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [state.open, state.defaultValue])

  if (!state.open) return null

  const isPrompt = state.mode === 'prompt'

  function handleConfirm() {
    if (isPrompt) {
      onClose(value.trim() || null)
    } else {
      onClose(true)
    }
  }

  function handleCancel() {
    onClose(isPrompt ? null : false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center"
      onClick={handleCancel}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-[400px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <p className="text-sm text-fg-primary mb-3">{state.title}</p>
          {isPrompt && (
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="Memora-input w-full text-sm"
            />
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={handleCancel} className="Memora-btn Memora-btn-ghost text-xs">
            取消
          </button>
          <button onClick={handleConfirm} className="Memora-btn Memora-btn-primary text-xs">
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
