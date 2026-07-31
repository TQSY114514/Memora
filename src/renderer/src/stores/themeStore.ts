import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_KEY = 'memora.theme'
const BG_KEY = 'memora.bgImage'
const BLUR_KEY = 'memora.blur'
const OPACITY_KEY = 'memora.opacity'

function loadMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // ignore
  }
  return 'system'
}

function loadBg(): string | null {
  try {
    return localStorage.getItem(BG_KEY)
  } catch {
    return null
  }
}

function loadBlur(): number {
  try {
    const raw = localStorage.getItem(BLUR_KEY)
    return raw ? Number(raw) : 0
  } catch {
    return 0
  }
}

function loadOpacity(): number {
  try {
    const raw = localStorage.getItem(OPACITY_KEY)
    return raw ? Number(raw) : 0.15
  } catch {
    return 0.15
  }
}

function saveMode(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_KEY, mode) } catch { /* ignore */ }
}
function saveBg(img: string | null): void {
  try {
    if (img) localStorage.setItem(BG_KEY, img)
    else localStorage.removeItem(BG_KEY)
  } catch { /* ignore */ }
}
function saveBlur(n: number): void {
  try { localStorage.setItem(BLUR_KEY, String(n)) } catch { /* ignore */ }
}
function saveOpacity(n: number): void {
  try { localStorage.setItem(OPACITY_KEY, String(n)) } catch { /* ignore */ }
}

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(mode: ThemeMode): void {
  const isDark = mode === 'dark' || (mode === 'system' && getSystemDark())
  document.documentElement.classList.toggle('dark', isDark)
}

interface ThemeState {
  mode: ThemeMode
  backgroundImage: string | null
  blur: number
  opacity: number
  setMode: (mode: ThemeMode) => void
  setBackgroundImage: (img: string | null) => void
  setBlur: (n: number) => void
  setOpacity: (n: number) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: loadMode(),
  backgroundImage: loadBg(),
  blur: loadBlur(),
  opacity: loadOpacity(),
  setMode: (mode) => {
    saveMode(mode)
    applyTheme(mode)
    set({ mode })
  },
  setBackgroundImage: (img) => {
    saveBg(img)
    set({ backgroundImage: img })
  },
  setBlur: (n) => {
    saveBlur(n)
    set({ blur: n })
  },
  setOpacity: (n) => {
    saveOpacity(n)
    set({ opacity: n })
  }
}))

// 初始化时应用主题
applyTheme(loadMode())

// 监听系统主题变化（system 模式下自动切换）
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().mode === 'system') {
      applyTheme('system')
    }
  })
}
