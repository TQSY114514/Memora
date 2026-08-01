import { describe, it, expect } from 'vitest'
import { sanitizeContent } from '../src/importer/sanitizer'

describe('sanitizer', () => {
  describe('既有模式', () => {
    it('脱敏 Anthropic Key', () => {
      const text = 'my key is sk-ant-api03-' + 'A'.repeat(40)
      const { text: out, count } = sanitizeContent(text)
      expect(out).toBe('my key is [REDACTED:Anthropic-Key]')
      expect(count).toBe(1)
    })

    it('脱敏 OpenAI Key（不匹配 sk-ant-）', () => {
      const text = 'key=sk-' + 'B'.repeat(24)
      const { text: out, count } = sanitizeContent(text)
      expect(out).toContain('[REDACTED:OpenAI-Key]')
      expect(count).toBe(1)
    })

    it('脱敏 GitHub Token', () => {
      const text = 'ghp_' + '0'.repeat(36)
      const { text: out } = sanitizeContent(text)
      expect(out).toBe('[REDACTED:GitHub-Token]')
    })

    it('脱敏 Bearer Token', () => {
      const text = 'Authorization: Bearer ' + 'x'.repeat(24)
      const { text: out } = sanitizeContent(text)
      expect(out).toBe('Authorization: [REDACTED:Bearer-Token]')
    })

    it('通用 key=value 模式保留前缀', () => {
      const text = 'api_key=' + 'A'.repeat(20)
      const { text: out } = sanitizeContent(text)
      expect(out).toBe('api_key=[REDACTED:Credential]')
    })

    it('JSON 格式 secret', () => {
      const text = '{"secret": "' + 'Z'.repeat(20) + '"}'
      const { text: out } = sanitizeContent(text)
      expect(out).toBe('{"secret": "[REDACTED:Credential]"}')
    })
  })

  describe('AWS', () => {
    it('脱敏 AWS Access Key ID（AKIA 前缀）', () => {
      const text = 'aws_access_key_id = AKIA' + 'X'.repeat(16)
      const { text: out, count } = sanitizeContent(text)
      expect(out).toContain('[REDACTED:AWS-AccessKey]')
      expect(count).toBe(1)
    })

    it('脱敏 AWS Secret Access Key', () => {
      const secret = 'A'.repeat(40)
      const text = `aws_secret_access_key = "${secret}"`
      const { text: out } = sanitizeContent(text)
      expect(out).toContain('[REDACTED:AWS-SecretKey]')
    })

    it('不误伤 40 字符的普通文本', () => {
      const text = '这是一段普通的技术讨论文字' + 'A'.repeat(40) + '结束'
      const { count } = sanitizeContent(text)
      expect(count).toBe(0)
    })
  })

  describe('阿里云', () => {
    it('脱敏阿里云 AccessKey ID（LTAI 前缀）', () => {
      const text = 'LTAI' + 'Z'.repeat(16)
      const { text: out, count } = sanitizeContent(text)
      expect(out).toBe('[REDACTED:Aliyun-AccessKey]')
      expect(count).toBe(1)
    })

    it('脱敏阿里云 AccessKey Secret', () => {
      const secret = 'B'.repeat(30)
      const text = `aliyun_access_key_secret="${secret}"`
      const { text: out } = sanitizeContent(text)
      expect(out).toContain('[REDACTED:Aliyun-SecretKey]')
    })
  })

  describe('Google', () => {
    it('脱敏 Google API Key', () => {
      const text = 'AIza' + 'Y'.repeat(35)
      const { text: out } = sanitizeContent(text)
      expect(out).toBe('[REDACTED:Google-Key]')
    })
  })

  describe('误伤防护', () => {
    it('不误伤正常的短 ID', () => {
      const text = 'LTAI 短文本不匹配'
      const { count } = sanitizeContent(text)
      expect(count).toBe(0)
    })

    it('不误伤技术讨论中的 AKIA 词汇', () => {
      // AKIA + 不足 16 字符后缀，不应匹配
      const text = 'AKIA1234 是一个测试'
      const { count } = sanitizeContent(text)
      expect(count).toBe(0)
    })

    it('空文本返回 0', () => {
      const { count } = sanitizeContent('')
      expect(count).toBe(0)
    })

    it('非字符串返回 0', () => {
      const { count } = sanitizeContent(null as unknown as string)
      expect(count).toBe(0)
    })
  })

  describe('多模式混合', () => {
    it('一条消息中同时包含多种凭证', () => {
      const text = [
        'openai: sk-' + 'A'.repeat(24),
        'aws: AKIA' + 'B'.repeat(16),
        'gh: ghp_' + '0'.repeat(36)
      ].join('\n')
      const { text: out, count } = sanitizeContent(text)
      expect(count).toBe(3)
      expect(out).toContain('[REDACTED:OpenAI-Key]')
      expect(out).toContain('[REDACTED:AWS-AccessKey]')
      expect(out).toContain('[REDACTED:GitHub-Token]')
    })
  })
})
