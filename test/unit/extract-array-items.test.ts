import { describe, it, expect } from 'vitest'
import { extractTopLevelArrayItems } from '@importer/service'

describe('extractTopLevelArrayItems', () => {
  it('提取顶层对象数组元素', () => {
    const json = JSON.stringify([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' }
    ])
    const items = extractTopLevelArrayItems(json)
    expect(items.length).toBe(3)
    expect(JSON.parse(items[0])).toEqual({ id: 1, name: 'a' })
    expect(JSON.parse(items[2])).toEqual({ id: 3, name: 'c' })
  })

  it('空数组返回空数组', () => {
    expect(extractTopLevelArrayItems('[]')).toEqual([])
    expect(extractTopLevelArrayItems('[ ]')).toEqual([])
  })

  it('对象内含花括号字符串不破坏状态机', () => {
    const json = JSON.stringify([
      { id: 1, text: '包含 } 和 { 的字符串' },
      { id: 2, text: '另一条 {' }
    ])
    const items = extractTopLevelArrayItems(json)
    expect(items.length).toBe(2)
    expect(JSON.parse(items[0]).id).toBe(1)
    expect(JSON.parse(items[1]).id).toBe(2)
  })

  it('对象内含转义引号不破坏状态机', () => {
    const json = JSON.stringify([
      { id: 1, text: '带"引号"的内容' },
      { id: 2, text: '带\\转义\\的内容' }
    ])
    const items = extractTopLevelArrayItems(json)
    expect(items.length).toBe(2)
  })

  it('嵌套对象正确识别顶层边界', () => {
    const json = JSON.stringify([
      { id: 1, nested: { deep: { value: 42 } } },
      { id: 2, arr: [1, 2, 3] }
    ])
    const items = extractTopLevelArrayItems(json)
    expect(items.length).toBe(2)
    expect(JSON.parse(items[0]).nested.deep.value).toBe(42)
  })

  it('非数组顶层抛 NOT_ARRAY', () => {
    expect(() => extractTopLevelArrayItems('{"foo":1}')).toThrow(/不是数组/)
    expect(() => extractTopLevelArrayItems('hello')).toThrow(/不是数组/)
  })
})
