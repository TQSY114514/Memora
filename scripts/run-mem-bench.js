/**
 * 记忆检索评测启动器
 * 以 ELECTRON_RUN_AS_NODE=1 启动 electron，匹配 better-sqlite3 的 Electron ABI。
 */
const { spawnSync } = require('child_process')
const { resolve } = require('path')

const electron = require('electron')
const script = resolve(__dirname, '..', 'test', 'benchmark', 'memory.bench.cjs')

const result = spawnSync(electron, [script], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  shell: true
})

process.exit(result.status || 0)