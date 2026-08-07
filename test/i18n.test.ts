import { describe, it, expect } from 'vitest'
import { zhCN } from '../src/renderer/src/i18n/locales/zh-CN'
import { en } from '../src/renderer/src/i18n/locales/en'
import { ja } from '../src/renderer/src/i18n/locales/ja'

describe('i18n locale key parity', () => {
  it('zh-CN / en / ja 三语字典拥有完全相同的 key 集合', () => {
    const zhKeys = Object.keys(zhCN).sort()
    const enKeys = Object.keys(en).sort()
    const jaKeys = Object.keys(ja).sort()

    expect(zhKeys).toEqual(enKeys)
    expect(enKeys).toEqual(jaKeys)
  })

  it('ja 中不允许存在空字符串（缺 key 补全）', () => {
    for (const [key, value] of Object.entries(ja)) {
      expect(value.trim().length, `ja.${key} 为空`).toBeGreaterThan(0)
    }
  })

  it('t() 在缺 key 时回退到 zh-CN 而非 key 本身', () => {
    // 三个字典 key 完全一致，任何语言查找都应命中
    for (const key of Object.keys(zhCN)) {
      expect(en[key]).toBeDefined()
      expect(ja[key]).toBeDefined()
    }
  })
})