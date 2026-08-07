import { describe, it, expect } from 'vitest'
import { runSelfTest, printSelfTestReport } from '../../src/crypto/selfTest'

describe('crypto/selfTest (P0-C1 加密自检)', () => {
  it('自检全部通过（ok=true，7 项全 PASS）', () => {
    const result = runSelfTest(1000)
    expect(result.ok).toBe(true)
    expect(result.checks).toHaveLength(7)
    expect(result.checks.every((c) => c.pass)).toBe(true)
    expect(result.summary).toContain('7/7')
  })

  it('报告包含人类可读的 PASS 标记与时间戳', () => {
    const result = runSelfTest(1000)
    const text = printSelfTestReport(result)
    expect(text).toContain('=== Memora 加密自检 ===')
    expect(text).toContain('[PASS]')
    expect(text).toContain('7/7')
    expect(text).toContain('运行时间:')
    // 覆盖关键检查名
    expect(text).toContain('加解密往返一致')
    expect(text).toContain('认证标签可检测篡改')
    expect(text).toContain('错误口令被拒绝')
  })

  it('可用迭代次数注入（避免 CI 慢机器超时）', () => {
    const result = runSelfTest(100)
    expect(result.ok).toBe(true)
  })
})