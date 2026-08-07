/**
 * Memora MCP 真实交互 Demo
 *
 * 在 ELECTRON_RUN_AS_NODE 模式下运行真实业务链路（不需要 GUI / stdio 通信），
 * 直接调用 out/main 中的 callTool 驱动 MCP 工具，产出真实输出：
 *   1. 隔离临时 userData 目录（MEMORA_USER_DATA）
 *   2. 用写工具（add_session / memory_save_preference）真实写入示例数据
 *   3. 用读工具（memory_profile / preference_search / memory_explain）展示真实返回
 *
 * 用法：
 *   先构建：npm run build
 *   再运行：node scripts/demo-mcp.js
 *
 * 输出写入 demo/output/，可直接用于 README 展示。
 */
const { spawnSync } = require('child_process')
const { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } = require('fs')
const { join, resolve } = require('path')
const os = require('os')

const electron = require('electron') // electron 可执行文件路径
const root = resolve(__dirname, '..')
const outDir = join(root, 'demo', 'output')
const tempUserData = join(os.tmpdir(), 'memora-demo-' + Date.now())
mkdirSync(outDir, { recursive: true })
mkdirSync(tempUserData, { recursive: true })

// 生成一个在 ELECTRON_RUN_AS_NODE 下运行的驱动脚本：
// 直接 require callTool 并围绕真实 DB 执行，绕开 Windows 下 spawn stdio 的 EOF 问题。
const n = (...p) => join(...p).replace(/\\/g, '/')
const driverPath = join(tempUserData, '_driver.cjs')
const driverSrc = `
const Module = require('module')
const orig = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return require('${n(__dirname, 'demo-shim.cjs')}')
  return orig.apply(this, arguments)
}

async function main() {
  const { callTool } = require('${n(root, 'out', 'main', 'chunks', 'server-C37wdW_n.js')}')
  const { initDatabase } = require('${n(root, 'out', 'main', 'index.js')}')
  initDatabase()

  const out = {}
  let ws = await callTool('list_workspaces', {})
  // MCP 模式无 renderer，默认工作区需自行创建
  if (!ws || ws.length === 0) {
    const { getDatabase } = require('${n(root, 'out', 'main', 'index.js')}')
    const { randomUUID } = require('crypto')
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      'INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, '默认工作区', 'AI 对话记忆工作区', now, now)
    ws = await callTool('list_workspaces', {})
  }
  const workspaceId = ws[0]?.id
  if (!workspaceId) throw new Error('未找到工作区')
  out.workspaceId = workspaceId

  const s1 = await callTool('add_session', {
    title: 'Memora 架构设计讨论',
    provider: 'Claude Code',
    messages: [
      { role: 'user', content: '我们做一个Local-First的AI记忆工作台，技术栈用Electron + React + TypeScript如何？' },
      { role: 'assistant', content: '很好，Electron生态成熟，SQLite做本地存储，React做UI，适合本地优先架构。' }
    ]
  })
  const s2 = await callTool('add_session', {
    title: 'Rust 学习计划',
    provider: 'Claude Code',
    messages: [
      { role: 'user', content: '我想开始学Rust，最近对系统编程感兴趣，你觉得值得学吗？' },
      { role: 'assistant', content: '值得。Rust在性能和内存安全上很出色，适合底层工具与服务端开发。' }
    ]
  })
  out.s1 = s1
  out.s2 = s2

  const prefs = [
    { subject: 'tech stack', value: 'Electron + React + TypeScript，本地优先架构', sessionId: s1.sessionId, confidence: 0.92 },
    { subject: 'language', value: 'TypeScript', sessionId: s1.sessionId, confidence: 0.9 },
    { subject: 'language', value: 'Rust，最近在学系统编程', sessionId: s2.sessionId, confidence: 0.68 },
    { subject: 'editor', value: 'VSCode + Cursor', sessionId: s1.sessionId, confidence: 0.85 },
    { subject: 'architecture', value: 'Local-First，数据留在本地设备', sessionId: s1.sessionId, confidence: 0.95 }
  ]
  for (const p of prefs) {
    await callTool('memory_save_preference', { workspaceId, ...p })
  }

  out.profile = await callTool('memory_profile', { workspaceId })
  out.search = await callTool('preference_search', { query: 'tech stack', workspaceId })
  out.explain = await callTool('memory_explain', { query: 'tech stack', workspaceId })

  // 结果写入文件，避免 stdout 被 [db]/审计日志污染导致 JSON 解析失败
  const fs = require('fs')
  fs.writeFileSync('${n(tempUserData, '_result.json')}', JSON.stringify(out))
  process.stdout.write('DEMO_RESULT_OK\\n')
}

main().catch((e) => {
  process.stderr.write('DRIVER_ERROR: ' + (e && e.stack ? e.stack : String(e)))
  process.exit(1)
})
`
writeFileSync(driverPath, driverSrc)

console.log('[demo] electron =', electron)
console.log('[demo] driver   =', driverPath)
console.log('[demo] userData =', tempUserData)

const res = spawnSync(electron, [driverPath], {
  encoding: 'utf8',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    MEMORA_USER_DATA: tempUserData,
    MEMORA_WRITE: 'true'
  }
})

if (res.error) {
  console.error('[demo] spawn error:', res.error)
  cleanup()
  process.exit(1)
}
if (res.status !== 0) {
  console.error('[demo] exited with status', res.status)
  console.error('[demo] stderr:\n', res.stderr)
  cleanup()
  process.exit(1)
}

const output = res.stdout
const resultFile = join(tempUserData, '_result.json')
if (!res.stderr?.includes('DEMO_RESULT_OK') && !output.includes('DEMO_RESULT_OK')) {
  console.error('[demo] driver 未输出 DEMO_RESULT_OK 标记')
  console.error('[demo] stderr:\n', res.stderr)
  cleanup()
  process.exit(1)
}
if (!existsSync(resultFile)) {
  console.error('[demo] 未找到结果文件:', resultFile)
  console.error('[demo] stderr:\n', res.stderr)
  cleanup()
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(resultFile, 'utf8'))
} catch (e) {
  console.error('[demo] failed to parse result file:', e.message)
  cleanup()
  process.exit(1)
}

writeFileSync(join(outDir, 'memory-demo.json'), JSON.stringify(report, null, 2))

console.log('\n===== Memora MCP 真实 Demo =====\n')
console.log('workspaceId:', report.workspaceId)
console.log('\n>>> memory_profile')
console.log(JSON.stringify(report.profile, null, 2))
console.log('\n>>> preference_search { query: "tech stack" }')
console.log(JSON.stringify(report.search, null, 2))
console.log('\n>>> memory_explain { query: "tech stack" }')
console.log(JSON.stringify(report.explain, null, 2))
console.log('\n结果已写入:', join(outDir, 'memory-demo.json'))

cleanup()

function cleanup() {
  try {
    rmSync(tempUserData, { recursive: true, force: true })
  } catch {
    /* 忽略清理失败 */
  }
}