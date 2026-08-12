import type { ReactNode } from 'react'

/**
 * 共享浮层模态框 —— 统一的遮罩 + 纸面面板。
 * 取代各处重复的 `fixed inset-0 bg-black/40 ... shadow-2xl` 手写标记。
 *
 * - 点击遮罩关闭（面板内点击不冒泡）
 * - 宽度 / 布局由调用方通过 className 传入（如 `w-[680px] max-h-[90vh] overflow-hidden flex flex-col`）
 * - overlayClassName 用于调整层级等遮罩属性（如 PromptDialog 的 z-[60]）
 */
interface ModalProps {
  onClose: () => void
  children: ReactNode
  /** 面板尺寸 / 布局类（尺寸与滚动行为完全由调用方控制，避免类冲突） */
  className?: string
  /** 遮罩附加类（默认 z-50） */
  overlayClassName?: string
}

export function Modal({ onClose, children, className = '', overlayClassName = 'z-50' }: ModalProps) {
  return (
    <div
      className={`fixed inset-0 ${overlayClassName} bg-black/40 flex items-center justify-center`}
      onClick={onClose}
    >
      <div
        className={`bg-bg-primary border border-border rounded-xl shadow-lg ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export default Modal
