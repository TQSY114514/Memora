/// <reference types="vite/client" />
import type { AetherApi } from '../../preload'

declare global {
  interface Window {
    aether: AetherApi
  }
}

export {}
