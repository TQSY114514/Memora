import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Modal } from '../Modal'

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

  // 用 ref 镜像 resolve，使 handleClose 引用稳定 → 返回对象可整体 memo
  const resolveRef = useRef<NonNullable<DialogState['resolve']> | null>(null)

  const prompt = useCallback((title: string, defaultValue?: string) => {
    return new Promise<string | null>((resolve) => {
      const fn: DialogState['resolve'] = (v) => resolve(v as string | null)
      resolveRef.current = fn
      setState({
        open: true,
        mode: 'prompt',
        title,
        defaultValue,
        resolve: fn
      })
    })
  }, [])

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      const fn: DialogState['resolve'] = (v) => resolve(v as boolean)
      resolveRef.current = fn
      setState({
        open: true,
        mode: 'confirm',
        title: message,
        resolve: fn
      })
    })
  }, [])

  const alert = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      const fn: DialogState['resolve'] = () => resolve()
      resolveRef.current = fn
      setState({ open: true, mode: 'confirm', title: message, resolve: fn })
    })
  }, [])

  const handleClose = useCallback((value: string | boolean | null) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setState((s) => ({ ...s, open: false, resolve: undefined }))
  }, [])

  // 返回对象 memo 化：dialog 引用仅在弹窗开合时变化，消费方可用 [dialog] 作依赖且不破坏 memo
  return useMemo(
    () => ({ state, prompt, confirm, alert, handleClose }),
    [state, prompt, confirm, alert, handleClose]
  )
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
    <Modal onClose={handleCancel} className="w-[400px] max-w-[90vw] max-h-[90vh] overflow-y-auto" overlayClassName="z-[60]">
      <div className="px-5 py-4">
        <p className="text-sm text-fg-primary mb-3">{state.title}</p>
        {isPrompt && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="Memora-input w-full"
          />
        )}
      </div>
      <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
        <button onClick={handleCancel} className="Memora-btn Memora-btn-ghost">
          取消
        </button>
        <button onClick={handleConfirm} className="Memora-btn Memora-btn-primary">
          确定
        </button>
      </div>
    </Modal>
  )
}
