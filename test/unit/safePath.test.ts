import { describe, it, expect, vi } from 'vitest'
import { resolve, normalize } from 'path'

/**
 * assertSafePath 白名单单测
 *
 * safeHandle.ts 依赖 electron 的 app.getPath()，需 mock。
 * 白名单根目录设置为：
 *   userData   = /tmp/memora-test/userData
 *   downloads  = /tmp/memora-test/downloads
 *   documents  = /tmp/memora-test/documents
 *   desktop    = /tmp/memora-test/desktop
 */

const ROOT = '/tmp/memora-test'

/** 跨平台期望值：与 assertSafePath 内部一样做 normalize(resolve(...)) */
const expectPath = (p: string) => normalize(resolve(p))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      const map: Record<string, string> = {
        userData: `${ROOT}/userData`,
        downloads: `${ROOT}/downloads`,
        documents: `${ROOT}/documents`,
        desktop: `${ROOT}/desktop`
      }
      return map[name] ?? ''
    }
  }
}))

// electron 的 logger 也需 mock（safeHandle 导入了它）
vi.mock('../../src/main/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}))

import { assertSafePath, assertSafePaths, assertSafeId, assertSafeIds, assertSafeFilename } from '../../src/main/ipc/safeHandle'

describe('assertSafePath 白名单校验', () => {
  it('允许白名单根目录下的文件路径', () => {
    expect(() => assertSafePath(`${ROOT}/downloads/chat.json`)).not.toThrow()
    expect(() => assertSafePath(`${ROOT}/documents/sub/note.md`)).not.toThrow()
    expect(() => assertSafePath(`${ROOT}/desktop/export.html`)).not.toThrow()
    expect(() => assertSafePath(`${ROOT}/userData/backups/x.zip`)).not.toThrow()
  })

  it('允许白名单根目录本身', () => {
    expect(() => assertSafePath(`${ROOT}/downloads`)).not.toThrow()
    expect(() => assertSafePath(`${ROOT}/userData`)).not.toThrow()
  })

  it('拒绝白名单外的路径', () => {
    expect(() => assertSafePath('/etc/passwd')).toThrow(/不在允许范围内/)
    expect(() => assertSafePath('/Users/root/.ssh/id_rsa')).toThrow(/不在允许范围内/)
    expect(() => assertSafePath('C:\\Windows\\System32\\config\\SAM')).toThrow(/不在允许范围内/)
  })

  it('拒绝路径遍历（.. 逃逸白名单）', () => {
    expect(() => assertSafePath(`${ROOT}/downloads/../../../etc/passwd`)).toThrow(/不在允许范围内/)
    expect(() => assertSafePath(`${ROOT}/userData/../../etc/shadow`)).toThrow(/不在允许范围内/)
  })

  it('拒绝前缀相似但非子目录的路径（防 /userDatattacker 绕过）', () => {
    expect(() => assertSafePath(`${ROOT}/userDatattacker/evil.json`)).toThrow(/不在允许范围内/)
    expect(() => assertSafePath(`${ROOT}/downloads_evil/x`)).toThrow(/不在允许范围内/)
  })

  it('拒绝空字节注入', () => {
    expect(() => assertSafePath(`${ROOT}/downloads/a.json\u0000/etc/passwd`)).toThrow(/空字节/)
  })

  it('拒绝非字符串 / 空 / 超长输入', () => {
    expect(() => assertSafePath(null)).toThrow(/非法 path/)
    expect(() => assertSafePath(123)).toThrow(/非法 path/)
    expect(() => assertSafePath('')).toThrow(/非法 path/)
    expect(() => assertSafePath('x'.repeat(5000))).toThrow(/非法 path/)
  })

  it('返回已 normalize 的绝对路径（消除 .. 和 .）', () => {
    const result = assertSafePath(`${ROOT}/downloads/./sub/../chat.json`)
    expect(result).toBe(expectPath(`${ROOT}/downloads/chat.json`))
  })
})

describe('assertSafePaths 批量校验', () => {
  it('校验整个数组并返回 normalize 后的路径', () => {
    const result = assertSafePaths([
      `${ROOT}/downloads/a.json`,
      `${ROOT}/documents/b.md`
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(expectPath(`${ROOT}/downloads/a.json`))
    expect(result[1]).toBe(expectPath(`${ROOT}/documents/b.md`))
  })

  it('数组中任一路径非法则整体拒绝', () => {
    expect(() =>
      assertSafePaths([`${ROOT}/downloads/a.json`, '/etc/passwd'])
    ).toThrow(/不在允许范围内/)
  })

  it('拒绝非数组输入', () => {
    expect(() => assertSafePaths('not-an-array')).toThrow(/期望数组/)
  })

  it('拒绝超限数组（>10000）', () => {
    const big = new Array(10001).fill(`${ROOT}/downloads/x.json`)
    expect(() => assertSafePaths(big)).toThrow(/数量超限/)
  })
})

describe('assertSafeId 标识符校验', () => {
  it('允许字母/数字/连字符/下划线', () => {
    expect(assertSafeId('abc123')).toBe('abc123')
    expect(assertSafeId('session-uuid_001')).toBe('session-uuid_001')
    expect(assertSafeId('A-B_C-1')).toBe('A-B_C-1')
  })

  it('拒绝空字符串与超长输入（>64）', () => {
    expect(() => assertSafeId('')).toThrow(/非法 id/)
    expect(() => assertSafeId('x'.repeat(65))).toThrow(/非法 id/)
  })

  it('拒绝路径分隔符 / 空字节 / SQL 注入字符', () => {
    expect(() => assertSafeId('../etc/passwd')).toThrow(/非法 id/)
    expect(() => assertSafeId('a/b')).toThrow(/非法 id/)
    expect(() => assertSafeId('a\u0000b')).toThrow(/非法 id/)
    expect(() => assertSafeId("a'; DROP TABLE--")).toThrow(/非法 id/)
    expect(() => assertSafeId('a b')).toThrow(/非法 id/)  // 空格非法
  })

  it('拒绝非字符串输入', () => {
    expect(() => assertSafeId(null)).toThrow(/非法 id/)
    expect(() => assertSafeId(123)).toThrow(/非法 id/)
    expect(() => assertSafeId({})).toThrow(/非法 id/)
  })

  it('支持自定义字段名', () => {
    expect(() => assertSafeId('', 'sessionId')).toThrow(/非法 sessionId/)
  })
})

describe('assertSafeIds 批量标识符校验', () => {
  it('校验整个数组并返回原值', () => {
    const result = assertSafeIds(['a', 'b', 'c'])
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('数组中任一 ID 非法则整体拒绝', () => {
    expect(() => assertSafeIds(['a', 'b/c', 'c'])).toThrow(/非法 ids/)
  })

  it('拒绝非数组输入', () => {
    expect(() => assertSafeIds('not-an-array')).toThrow(/期望数组/)
  })

  it('拒绝超限数组（>1000）', () => {
    const big = new Array(1001).fill('id')
    expect(() => assertSafeIds(big)).toThrow(/数量超限/)
  })
})

describe('assertSafeFilename 文件名校验', () => {
  it('允许正常文件名', () => {
    expect(assertSafeFilename('backup.zip')).toBe('backup.zip')
    expect(assertSafeFilename('chat-2026-08-01.json')).toBe('chat-2026-08-01.json')
    expect(assertSafeFilename('数据 (1).enc')).toBe('数据 (1).enc')
  })

  it('拒绝空字符串与超长输入（>255）', () => {
    expect(() => assertSafeFilename('')).toThrow(/非法 filename/)
    expect(() => assertSafeFilename('x'.repeat(256))).toThrow(/非法 filename/)
  })

  it('拒绝路径分隔符（防路径遍历）', () => {
    expect(() => assertSafeFilename('../evil.zip')).toThrow(/路径分隔符/)
    expect(() => assertSafeFilename('a/b')).toThrow(/路径分隔符/)
    expect(() => assertSafeFilename('a\\b')).toThrow(/路径分隔符/)
  })

  it('拒绝 . 与 ..', () => {
    expect(() => assertSafeFilename('.')).toThrow(/路径分隔符/)
    expect(() => assertSafeFilename('..')).toThrow(/路径分隔符/)
  })

  it('拒绝空字节注入', () => {
    expect(() => assertSafeFilename('safe\u0000.zip')).toThrow(/路径分隔符/)
  })

  it('拒绝非字符串输入', () => {
    expect(() => assertSafeFilename(null)).toThrow(/非法 filename/)
    expect(() => assertSafeFilename(123)).toThrow(/非法 filename/)
  })
})
