/**
 * Postinstall 脚本：为 Electron 下载 better-sqlite3 的预编译二进制
 *
 * 背景：better-sqlite3 的 install 脚本默认下载 Node.js 版本的二进制，
 * 但 Electron 使用自己的 Node.js 版本，需要对应的 ABI 二进制。
 * 此脚本在 npm install 后自动下载 Electron 版本的二进制。
 *
 * 如果下载失败（如网络问题），不会阻塞安装，应用仍可使用系统 Node.js 版本的二进制启动。
 */
const { execSync } = require('child_process')
const { existsSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')

// 检测 Electron 版本
const electronPkgPath = join(root, 'node_modules', 'electron', 'package.json')
if (!existsSync(electronPkgPath)) {
  console.log('[postinstall] Electron not found, skipping native rebuild')
  process.exit(0)
}

const electronVersion = require(electronPkgPath).version
console.log(`[postinstall] Electron ${electronVersion} detected, rebuilding better-sqlite3...`)

const prebuildInstall = join(root, 'node_modules', 'prebuild-install', 'bin.js')
const cwd = join(root, 'node_modules', 'better-sqlite3')

if (!existsSync(prebuildInstall)) {
  console.log('[postinstall] prebuild-install not found, skipping')
  process.exit(0)
}

try {
  execSync(
    `node --use-system-ca "${prebuildInstall}" --runtime electron --target ${electronVersion}`,
    { cwd, stdio: 'inherit' }
  )
  console.log('[postinstall] better-sqlite3 Electron binary installed successfully')
} catch (e) {
  console.warn('[postinstall] better-sqlite3 prebuild download failed, using system binary as fallback')
  // 不阻塞安装：系统 Node.js 版本的二进制在 dev 模式下可能也能工作
}