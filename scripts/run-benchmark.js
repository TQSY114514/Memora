/**
 * Benchmark 启动器
 *
 * 通过 child_process 以 ELECTRON_RUN_AS_NODE=1 启动 electron，
 * 使其用 Node 模式运行（不启动 GUI），匹配 better-sqlite3 的 Electron ABI。
 */
const { spawnSync } = require('child_process')
const { resolve } = require('path')

const electron = require('electron')
const script = resolve(__dirname, '..', 'test', 'benchmark', 'search.bench.cjs')

const result = spawnSync(electron, [script], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  shell: true
})

process.exit(result.status || 0)
