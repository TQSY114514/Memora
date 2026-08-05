/**
 * 构建产物清理脚本
 * 清空 dist/ 与 out/,避免 electron-builder 累积旧版本安装包。
 * 用法: node scripts/clean.js [dist|out|all]  (默认 all)
 */
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const targets = {
  dist: join(root, 'dist'),
  out: join(root, 'out')
}

const arg = process.argv[2] ?? 'all'
const dirs = arg === 'all' ? Object.values(targets) : [targets[arg]].filter(Boolean)

if (dirs.length === 0) {
  console.error(`未知目标: ${arg}（可用: dist / out / all）`)
  process.exit(1)
}

for (const dir of dirs) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    console.log(`已清理: ${dir}`)
  }
}