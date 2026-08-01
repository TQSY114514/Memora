import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

/**
 * secretStore 安全单测（报告 #2 / 任务 1）
 *
 * 验证：
 * - safeStorage 可用时：加密 → 解密 往返一致
 * - safeStorage 不可用时：降级为 'plain:' 前缀的 base64 明文存储
 * - 删除 apiKey 后再次读取返回 null
 * - 文件不存在时 getAllApiKeys 返回空对象
 * - 解密失败（密钥变更/文件损坏）返回 null 而非抛错
 *
 * 依赖 mock：
 * - electron.safeStorage：可控开关加密可用性
 * - electron.app：返回临时 userData 目录
 * - ../../src/main/aiConfigFile.listConfiguredProviders：返回测试 provider 列表
 * - ../../src/main/logger：吞掉日志
 */

let tmpDir: string
let encryptAvailable = true

// 模拟加密：简单的 base64 + 标记前缀（仅供测试，非真实加密）
const ENC_PREFIX = 'enc:'
const decryptImpl = (buf: Buffer): string => {
  const s = buf.toString('utf-8')
  if (!s.startsWith(ENC_PREFIX)) throw new Error('decrypt failed')
  return Buffer.from(s.slice(ENC_PREFIX.length), 'base64').toString('utf-8')
}

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? tmpDir : '')
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptAvailable,
    encryptString: (s: string) => Buffer.from(ENC_PREFIX + Buffer.from(s, 'utf-8').toString('base64'), 'utf-8'),
    decryptString: (buf: Buffer) => decryptImpl(buf)
  }
}))

vi.mock('../../src/main/aiConfigFile', () => ({
  listConfiguredProviders: () => ['openai', 'anthropic']
}))

vi.mock('../../src/main/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}))

import {
  setApiKey,
  getApiKey,
  deleteApiKey,
  getAllApiKeys,
  isEncryptionAvailable,
  isPlaintextFallback
} from '../../src/main/secretStore'

function secretsPath(): string {
  return join(tmpDir, 'secrets.enc')
}

describe('secretStore', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'memora-secret-'))
    encryptAvailable = true
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('加密可用模式（safeStorage 正常）', () => {
    it('加密 → 解密往返一致', () => {
      setApiKey('openai', 'sk-test-1234567890abcdef')
      expect(getApiKey('openai')).toBe('sk-test-1234567890abcdef')
    })

    it('多 provider 独立存储', () => {
      setApiKey('openai', 'sk-openai-xxx')
      setApiKey('anthropic', 'sk-ant-yyy')
      expect(getApiKey('openai')).toBe('sk-openai-xxx')
      expect(getApiKey('anthropic')).toBe('sk-ant-yyy')
    })

    it('覆盖写入：后值替换前值', () => {
      setApiKey('openai', 'old-key')
      setApiKey('openai', 'new-key')
      expect(getApiKey('openai')).toBe('new-key')
    })

    it('setApiKey 空字符串等价于删除', () => {
      setApiKey('openai', 'sk-xxx')
      setApiKey('openai', '')
      expect(getApiKey('openai')).toBeNull()
    })

    it('密文不以明文形式落盘', () => {
      setApiKey('openai', 'sk-very-secret-key')
      const raw = readFileSync(secretsPath(), 'utf-8')
      expect(raw).not.toContain('sk-very-secret-key')
      // 应为 base64 编码的加密 buffer
      const parsed = JSON.parse(raw)
      expect(parsed.openai).toBeTruthy()
      expect(parsed.openai).not.toContain('sk-')
    })
  })

  describe('明文降级模式（safeStorage 不可用）', () => {
    beforeEach(() => {
      encryptAvailable = false
    })

    it('isEncryptionAvailable 返回 false', () => {
      expect(isEncryptionAvailable()).toBe(false)
    })

    it('isPlaintextFallback 返回 true', () => {
      expect(isPlaintextFallback()).toBe(true)
    })

    it('降级存储 + 读取往返一致', () => {
      setApiKey('openai', 'sk-plaintext-key')
      expect(getApiKey('openai')).toBe('sk-plaintext-key')
    })

    it('降级值带 plain: 前缀（落盘可识别）', () => {
      setApiKey('openai', 'sk-xxx')
      const raw = readFileSync(secretsPath(), 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed.openai).toMatch(/^plain:/)
    })
  })

  describe('加密可用模式标志', () => {
    it('isEncryptionAvailable 返回 true', () => {
      expect(isEncryptionAvailable()).toBe(true)
    })

    it('isPlaintextFallback 返回 false', () => {
      expect(isPlaintextFallback()).toBe(false)
    })
  })

  describe('deleteApiKey', () => {
    it('删除已存在的 key', () => {
      setApiKey('openai', 'sk-xxx')
      expect(getApiKey('openai')).toBe('sk-xxx')
      deleteApiKey('openai')
      expect(getApiKey('openai')).toBeNull()
    })

    it('删除不存在的 key 不报错', () => {
      expect(() => deleteApiKey('nonexistent')).not.toThrow()
    })
  })

  describe('getApiKey 边界', () => {
    it('文件不存在时返回 null', () => {
      expect(getApiKey('openai')).toBeNull()
    })

    it('provider 不存在时返回 null', () => {
      setApiKey('openai', 'sk-xxx')
      expect(getApiKey('anthropic')).toBeNull()
    })

    it('解密失败返回 null（不抛错）', () => {
      // 写入一个无法被解密的损坏值
      const badPath = secretsPath()
      writeFileSync(badPath, JSON.stringify({ openai: '!!!not-valid-encrypted!!!' }), 'utf-8')
      expect(getApiKey('openai')).toBeNull()
    })

    it('JSON 解析失败返回 null', () => {
      writeFileSync(secretsPath(), 'not-json{', 'utf-8')
      expect(getApiKey('openai')).toBeNull()
    })
  })

  describe('getAllApiKeys', () => {
    it('返回所有已配置 provider 的 apiKey', () => {
      setApiKey('openai', 'sk-openai')
      setApiKey('anthropic', 'sk-ant')
      const all = getAllApiKeys()
      expect(all.openai).toBe('sk-openai')
      expect(all.anthropic).toBe('sk-ant')
    })

    it('未配置 apiKey 的 provider 不在结果中', () => {
      setApiKey('openai', 'sk-openai')
      const all = getAllApiKeys()
      expect(all.openai).toBe('sk-openai')
      expect(all.anthropic).toBeUndefined()
    })

    it('文件不存在时返回空对象', () => {
      expect(getAllApiKeys()).toEqual({})
    })
  })

  describe('持久化', () => {
    it('重新加载后 key 仍在（模拟重启）', () => {
      setApiKey('openai', 'sk-persistent')
      // 文件已落盘；下一次 getApiKey 会重新读文件
      expect(existsSync(secretsPath())).toBe(true)
      expect(getApiKey('openai')).toBe('sk-persistent')
    })
  })
})
