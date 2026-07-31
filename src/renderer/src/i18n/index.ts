import { create } from 'zustand'
import { zhCN } from './locales/zh-CN'
import { en } from './locales/en'
import { ja } from './locales/ja'

/**
 * 轻量 i18n 系统
 * - Zustand store 持久化语言选择到 localStorage
 * - useT() hook 供组件使用
 * - t() 普通函数供非组件场景使用
 */

export type Language = 'zh-CN' | 'en' | 'ja'

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' }
]

/** 翻译字典 */
const DICTS: Record<Language, Record<string, string>> = {
  'zh-CN': zhCN,
  en,
  ja
}

const STORAGE_KEY = 'memora.lang'

function loadLang(): Language {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'zh-CN' || raw === 'en' || raw === 'ja') return raw
  } catch {
    // 忽略读取失败
  }
  return 'zh-CN'
}

function saveLang(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // 忽略写入失败
  }
}

interface I18nState {
  lang: Language
  setLang: (lang: Language) => void
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: loadLang(),
  setLang: (lang) => {
    saveLang(lang)
    set({ lang })
  }
}))

/** 查询翻译：先查目标语言，找不到 fallback 到 zh-CN，再找不到返回 key 本身 */
export function t(key: string, lang?: Language): string {
  const l = lang ?? useI18nStore.getState().lang
  return DICTS[l]?.[key] ?? DICTS['zh-CN']?.[key] ?? key
}

/** 供组件使用的 hook，返回 t 函数，语言变化时触发重渲染 */
export function useT(): (key: string) => string {
  const lang = useI18nStore((s) => s.lang)
  return (key: string) => DICTS[lang]?.[key] ?? DICTS['zh-CN']?.[key] ?? key
}
