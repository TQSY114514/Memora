/**
 * Memora 记忆检索评测（P0-V2）
 *
 * 在 ELECTRON_RUN_AS_NODE 下驱动真实 MCP 工具（memory_save_preference /
 * preference_search / memory_profile），对临时库评测三项可复现指标：
 *   1. 召回率    ：已知偏好能否被相关查询检索到（correct / total）
 *   2. 时态正确率：同一 subject 多次更新后，检索是否返回「当前活跃」版本而非被取代的旧版
 *   3. 重复去重率：同一 subject+value 重复记录后，检索是否收敛为 1 条而非 N 条
 *
 * 用法：npm run mem-bench   （内部：node scripts/run-mem-bench.js）
 * 输出：人类可读 + test/benchmark/memory-results.json
 */
const { spawnSync } = require('child_process')
const { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } = require('fs')
const { join, resolve } = require('path')
const os = require('os')

const electron = require('electron')
// 本文件位于 test/benchmark/，项目根需上溯两层
const root = resolve(__dirname, '..', '..')
const outDir = join(root, 'test', 'benchmark')
const tempUserData = join(os.tmpdir(), 'memora-membench-' + Date.now())
mkdirSync(tempUserData, { recursive: true })

const n = (...p) => join(...p).replace(/\\/g, '/')
const driverPath = join(tempUserData, '_memdrv.cjs')
const driverSrc = `
const Module = require('module')
const orig = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return require('${n(root, 'scripts', 'demo-shim.cjs')}')
  return orig.apply(this, arguments)
}

async function main() {
  // 动态发现导出 callTool 的服务 chunk（chunk 名带内容哈希，不可硬编码）
  const fsChunks = require('fs')
  const pathChunks = require('path')
  const chunksDir = '${n(root, 'out', 'main', 'chunks')}'
  let serverPath = null
  for (const f of fsChunks.readdirSync(chunksDir)) {
    if (!f.endsWith('.js')) continue
    if (fsChunks.readFileSync(pathChunks.join(chunksDir, f), 'utf8').includes('exports.callTool')) {
      serverPath = pathChunks.join(chunksDir, f)
      break
    }
  }
  if (!serverPath) throw new Error('未找到导出 callTool 的 chunk（先执行 npm run build）')
  const { callTool } = require(serverPath)
  const { initDatabase } = require('${n(root, 'out', 'main', 'index.js')}')
  initDatabase()

  // 建工作区
  let ws = await callTool('list_workspaces', {})
  if (!ws || ws.length === 0) {
    const { getDatabase } = require('${n(root, 'out', 'main', 'index.js')}')
    const { randomUUID } = require('crypto')
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      'INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, 'bench-ws', '记忆检索评测工作区', now, now)
    ws = await callTool('list_workspaces', {})
  }
  const wid = ws[0].id

  const save = (subject, value, confidence) =>
    callTool('memory_save_preference', { workspaceId: wid, subject, value, confidence })
  const search = (q) => callTool('preference_search', { query: q, workspaceId: wid })

  // ===== 1) 召回率：10 个已知偏好，逐一用相关关键词查询 =====
  const known = [
    { subject: 'tech stack',   value: 'Electron + React + TypeScript 本地优先架构', kw: 'Electron' },
    { subject: 'language',     value: 'Rust 系统编程', kw: 'Rust' },
    { subject: 'database',     value: 'SQLite FTS 中文检索', kw: 'SQLite' },
    { subject: 'editor',       value: 'VSCode 与 Cursor 并用', kw: 'Cursor' },
    { subject: 'build tool',   value: 'Vite 构建优化', kw: 'Vite' },
    { subject: 'testing',      value: 'Vitest 单元测试', kw: 'Vitest' },
    { subject: 'arch',         value: 'Local-First 架构', kw: 'Local-First' },
    { subject: 'search',       value: '混合检索 向量 与 FTS', kw: 'FTS' },
    { subject: 'ui',           value: 'React 虚拟列表', kw: '虚拟列表' },
    { subject: 'data',         value: '时态记忆 valid_at 版本管理', kw: '时态' }
  ]
  for (const k of known) await save(k.subject, k.value, 0.9)

  let recallHits = 0
  for (const k of known) {
    const res = await search(k.kw)
    if (res.some((p) => p.subject === k.subject)) recallHits++
  }
  const recallRate = (recallHits / known.length) * 100

  // ===== 2) 时态正确率：同一 subject 三次更新，最终应返回最新值 =====
  // 用独立 subject（temporal-check）避免与召回率测试的 editor 冲突
  await save('temporal-check', 'VSCode', 0.7)   // v1
  await save('temporal-check', 'VSCode + Cursor', 0.85) // v2（取代 v1）
  await save('temporal-check', 'Cursor（主） + VSCode', 0.9) // v3（取代 v2）
  const perfect = await search('Cursor')
  const latest = perfect.find((p) => p.subject === 'temporal-check')
  // 时态正确 = 返回的是 v3（最新活性值），且仅 1 条（旧版 superseded 被过滤）
  const temporalCorrect =
    latest && latest.value === 'Cursor（主） + VSCode' &&
    perfect.filter((p) => p.subject === 'temporal-check').length === 1
  const temporalRate = temporalCorrect ? 100 : 0

  // ===== 3) 重复去重率：同一 subject+value 重复保存 5 次，查询应收敛为 1 条 =====
  for (let i = 0; i < 5; i++) await save('tech stack', 'Electron + React + TypeScript 本地优先架构', 0.9)
  const dedupeRes = await search('Electron React TypeScript')
  const dedupedCount = dedupeRes.filter((p) => p.subject === 'tech stack').length
  const dedupRate = dedupedCount === 1 ? 100 : (1 / Math.max(dedupedCount, 1)) * 100

  const out = { recallRate: recallRate.toFixed(1), temporalRate: temporalRate.toFixed(1), dedupRate: dedupRate.toFixed(1), recallHits, knownCount: known.length, dedupedCount }
  const fs = require('fs')
  fs.writeFileSync('${n(tempUserData, '_memresult.json')}', JSON.stringify(out))
  process.stdout.write('MEMBENCH_OK\\n')
}

main().catch((e) => {
  process.stderr.write('MEMDRV_ERROR: ' + (e && e.stack ? e.stack : String(e)))
  process.exit(1)
})
`
writeFileSync(driverPath, driverSrc)

const res = spawnSync(electron, [driverPath], {
  encoding: 'utf8',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    MEMORA_USER_DATA: tempUserData,
    MEMORA_WRITE: 'true'
  }
})

function cleanup() {
  try { rmSync(tempUserData, { recursive: true, force: true }) } catch {}
}

if (res.error || res.status !== 0) {
  console.error('[mem-bench] spawn error:', res.error?.message || res.status)
  console.error(res.stderr)
  cleanup()
  process.exit(1)
}
const resultFile = join(tempUserData, '_memresult.json')
if (!existsSync(resultFile)) {
  console.error('[mem-bench] 未找到结果文件\n', res.stderr)
  cleanup()
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(resultFile, 'utf8'))
} catch (e) {
  console.error('[mem-bench] 解析失败:', e.message)
  cleanup()
  process.exit(1)
}

console.log('\n===== Memora 记忆检索评测 =====\n')
console.log(`召回率    : ${report.recallRate}%  (${report.recallHits}/${report.knownCount} 个已知偏好被检索到)`)
console.log(`时态正确率: ${report.temporalRate}%  (同一主题多次更新后返回最新活性版本)`)
console.log(`重复去重率: ${report.dedupRate}%  (重复记录收敛为 ${report.dedupedCount} 条)`)

writeFileSync(join(outDir, 'memory-results.json'), JSON.stringify({ timestamp: new Date().toISOString(), ...report }, null, 2))
console.log('\nJSON 结果已写入:', join(outDir, 'memory-results.json'))

// ===== 阈值断言（CI 门禁）=====
const failures = []
if (Number(report.recallRate) < 90) failures.push(`召回率 ${report.recallRate}% < 90%`)
if (Number(report.temporalRate) < 100) failures.push(`时态正确率 ${report.temporalRate}% < 100%`)
if (Number(report.dedupRate) < 100) failures.push(`重复去重率 ${report.dedupRate}% < 100%`)

if (failures.length > 0) {
  console.error('\n❌ 记忆检索门禁失败：')
  for (const f of failures) console.error(`  - ${f}`)
  cleanup()
  process.exit(1)
}
console.log('\n✅ 记忆检索门禁通过：召回率 / 时态正确率 / 重复去重率均达标')
cleanup()