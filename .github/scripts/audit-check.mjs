#!/usr/bin/env node
/**
 * npm audit 门禁检查(带已知漏洞白名单)。
 *
 * 背景:npm audit 抓的是"当下"漏洞——传递依赖的 CVE 公告发布会让零改动的
 * CI 变红(历史先例:js-yaml / extract-zip)。这类漏洞若上游无修复版本、
 * 且修复需要 breaking 升级,应显式加入 ALLOWLIST 而不是把整道门禁关掉。
 *
 * 用法:node .github/scripts/audit-check.mjs
 * 退出码:0 = 通过(无 high/critical,或全部命中白名单);1 = 失败。
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'

/** 白名单:无修复版本 / 修复需 breaking 升级的传递依赖 CVE(附原因) */
const ALLOWLIST = new Map([
  // extract-zip 全版本受影响(GHSA-jmr9-qjv8-65gv,symlink path traversal),
  // 经 electron 安装器传递;上游已停维护无修复版本,官方修复是升级 electron 43
  // (breaking change)。仅影响 electron 安装阶段的 zip 解压,非运行时攻击面。
  ['GHSA-jmr9-qjv8-65gv', 'extract-zip via electron installer, no fixed version (electron 43 is a breaking upgrade)'],
])

// Windows 上 execFileSync 不能直接跑 npm.cmd(EINVAL),统一用 node 执行
// npm 的 CLI 入口(标准 node 安装布局,CI 与本地一致)。
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const args = ['audit', '--json', '--omit=optional']
let stdout
try {
  stdout = execFileSync(process.execPath, [npmCli, ...args], { encoding: 'utf8' })
  console.log('npm audit: 0 vulnerabilities')
  process.exit(0)
} catch (err) {
  stdout = err.stdout ?? ''
}

let report
try {
  report = JSON.parse(stdout)
} catch {
  console.error(stdout)
  console.error('npm audit 输出无法解析,门禁失败')
  process.exit(1)
}

const vulns = report.vulnerabilities ?? {}
const blocking = []
const allowed = []

/** 递归收集一个漏洞条目链路中的所有 GHSA id(via 可能是对象或依赖名) */
function collectGhsas(pkgName, seen = new Set()) {
  if (seen.has(pkgName)) return []
  seen.add(pkgName)
  const info = vulns[pkgName]
  if (!info || !Array.isArray(info.via)) return []
  const ghsas = []
  for (const item of info.via) {
    if (typeof item === 'object' && item !== null && typeof item.url === 'string' && item.url.includes('GHSA-')) {
      ghsas.push(`GHSA-${item.url.split('GHSA-')[1]}`)
    } else if (typeof item === 'string') {
      ghsas.push(...collectGhsas(item, seen))
    }
  }
  return [...new Set(ghsas)]
}

for (const [pkg, info] of Object.entries(vulns)) {
  const severity = info.severity
  if (severity !== 'high' && severity !== 'critical') continue
  const ghsaIds = collectGhsas(pkg)
  const hit = ghsaIds.filter(id => ALLOWLIST.has(id))
  if (ghsaIds.length > 0 && hit.length === ghsaIds.length) {
    allowed.push(`  ${pkg} (${severity}): ${hit.map(id => `${id} — ${ALLOWLIST.get(id)}`).join('; ')}`)
  } else {
    blocking.push({ pkg, severity, ghsaIds })
  }
}

if (blocking.length === 0) {
  for (const line of allowed) console.log(`[allowlisted] ${line}`)
  if (allowed.length > 0) {
    console.log(`npm audit: ${allowed.length} 个已知漏洞命中白名单(无修复版本),门禁通过`)
  }
  process.exit(0)
}

console.error(stdout)
console.error('以下 high/critical 漏洞不在白名单内:')
for (const item of blocking) {
  console.error(`  ${item.pkg} (${item.severity}): ${item.ghsaIds.join(', ') || '(未知 advisory)'}`)
}
console.error('请升级依赖修复,或将已确认无修复版本的 CVE 加入 ALLOWLIST')
process.exit(1)
