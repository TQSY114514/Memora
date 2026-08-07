/**
 * Memora 加密自检（P0-C1 | v10）
 *
 * 让任何用户能本地一键验证「数据确实被加密、且只有我能解」。
 * 纯 Node crypto 实现，不依赖 Electron，可在 `node out/main/index.js --self-test`
 * 或 `ELECTRON_RUN_AS_NODE` 下运行，输出可复现的自检报告。
 *
 * 覆盖项（全部为可本地验证的确定性断言，不做超出能力的承诺）：
 * 1. 加密 → 解密往返一致（含 CJK）
 * 2. 每次加密产生独立 salt / IV（防重放）
 * 3. 认证标签可检测篡改（密文 / IV / authTag 任一被改 → 解密失败）
 * 4. 错误口令被拒绝
 * 5. 加密密文与明文不同（确实加密，而非明文存储）
 * 6. SHA-256 哈希稳定且内容敏感（用于增量同步 / 完整性）
 */
import { encrypt, decrypt, verifyPassword, sha256, generateSalt, generateDeviceId } from './e2e'

export interface SelfTestResult {
  ok: boolean
  ranAt: string
  checks: Array<{ name: string; pass: boolean; detail?: string }>
  summary: string
}

/** 单次自检断言：失败收集错误但不中断，返回全部结果 */
export function runSelfTest(iterations?: number): SelfTestResult {
  const checks: SelfTestResult['checks'] = []
  const ITER = iterations ?? 1000 // 自检用低迭代，保证秒级完成；签名验证用默认 600k

  function check(name: string, pass: boolean, detail?: string): void {
    checks.push({ name, pass, detail })
  }

  const now = new Date()
  const payload = JSON.stringify({
    memory: 'Member_crypto_self_test_记忆_secure',
    nested: { n: 42, zh: '中文加密验证' },
    arr: [1, 2, 3]
  })

  // 1. 往返一致
  try {
    const pkg = encrypt(payload, 'memora-self-test-pass', ITER)
    check('加解密往返一致（含 CJK）', decrypt(pkg, 'memora-self-test-pass', ITER) === payload)
  } catch (e) {
    check('加解密往返一致（含 CJK）', false, String(e))
  }

  // 2. 每次加密独立 salt / IV
  try {
    const a = encrypt(payload, 'pw', ITER)
    const b = encrypt(payload, 'pw', ITER)
    check(
      '每次加密产生独立 salt/IV（防重放）',
      a.salt !== b.salt && a.iv !== b.iv && a.ciphertext !== b.ciphertext
    )
  } catch (e) {
    check('每次加密产生独立 salt/IV（防重放）', false, String(e))
  }

  // 3. 认证标签检测篡改
  try {
    const pkg = encrypt(payload, 'pw', ITER)
    // 翻转 base64 解码后每个字节的指定位，再重新编码，制造「被篡改」的密文/IV/认证标签
    const flip = (s: string, mask: number): string => {
      const b = Buffer.from(s, 'base64')
      for (let i = 0; i < b.length; i++) b[i] = b[i]! ^ mask
      return b.toString('base64')
    }
    const tamperCipher = { ...pkg, ciphertext: flip(pkg.ciphertext, 0xff) }
    const tamperIv = { ...pkg, iv: flip(pkg.iv, 1) }
    const tamperTag = { ...pkg, authTag: flip(pkg.authTag, 1) }
    check(
      '认证标签可检测篡改（密文/IV/authTag）',
      !verifyPassword(tamperCipher, 'pw', ITER) && !verifyPassword(tamperIv, 'pw', ITER) && !verifyPassword(tamperTag, 'pw', ITER)
    )
  } catch (e) {
    check('认证标签可检测篡改（密文/IV/authTag）', false, String(e))
  }

  // 4. 错误口令被拒绝
  try {
    const pkg = encrypt(payload, 'right-password', ITER)
    check('错误口令被拒绝', verifyPassword(pkg, 'right-password', ITER) === true && verifyPassword(pkg, 'wrong', ITER) === false)
  } catch (e) {
    check('错误口令被拒绝', false, String(e))
  }

  // 5. 密文与明文不同（确实加密）
  try {
    const pkg = encrypt(payload, 'pw', ITER)
    const cipherBuf = Buffer.from(pkg.ciphertext, 'base64').toString('utf8')
    check('密文与明文不同（非明文存储）', !cipherBuf.includes(payload) && pkg.ciphertext.length > 0)
  } catch (e) {
    check('密文与明文不同（非明文存储）', false, String(e))
  }

  // 6. SHA-256 稳定且内容敏感
  try {
    check('SHA-256 稳定且内容敏感', sha256('hello') === sha256('hello') && sha256('hello') !== sha256('hello!'))
  } catch (e) {
    check('SHA-256 稳定且内容敏感', false, String(e))
  }

  // 7. 密钥派生 / 设备 ID 生成
  try {
    const salt = generateSalt()
    check('盐值/设备 ID 生成', salt.length === 32 && /^[0-9a-f]{32}$/.test(generateDeviceId()))
  } catch (e) {
    check('盐值/设备 ID 生成', false, String(e))
  }

  const ok = checks.every((c) => c.pass)
  const passed = checks.filter((c) => c.pass).length
  return {
    ok,
    ranAt: now.toISOString(),
    checks,
    summary: `${passed}/${checks.length} 项通过${ok ? ' — 自检通过' : ' — 存在失败项'}`
  }
}

/** 打印人类可读的自检报告（供 CLI --self-test 使用） */
export function printSelfTestReport(result: SelfTestResult): string {
  const lines: string[] = []
  lines.push('=== Memora 加密自检 ===')
  lines.push(`运行时间: ${result.ranAt}`)
  for (const c of result.checks) {
    lines.push(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  lines.push(`结果: ${result.summary}`)
  return lines.join('\n')
}