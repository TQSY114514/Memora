/// <reference types="vite/client" />
import type { MemoraApi } from '../../preload'

declare global {
  interface Window {
    Memora: MemoraApi
  }
}

export {}
