import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * HTML 转换插件：
 * 1. 移除 <script>/<link> 上的 crossorigin 属性 —— Electron file:// 下 CORS 校验失败会黑屏。
 * 2. dev 模式移除 index.html 中写死的生产 CSP meta 标签 —— CSP 由主进程 onHeadersReceived
 *    动态设置（dev 放宽以支持 Vite HMR 的 eval/ws）。否则 meta CSP 与 HTTP 头 CSP 取交集，
 *    严格的 meta 会阻止 HMR → 黑屏。
 */
function transformHtmlPlugin(): Plugin {
  let isServe = false
  return {
    name: 'transform-html',
    enforce: 'post',
    config(_config, env) {
      isServe = env.command === 'serve'
    },
    transformIndexHtml(html) {
      let out = html.replace(/\s+crossorigin\b/g, '')
      if (isServe) {
        out = out.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*/gi, '')
      }
      return out
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@db': resolve('src/database'),
        '@importer': resolve('src/importer'),
        '@search': resolve('src/search'),
        '@sharing': resolve('src/sharing'),
        '@ai': resolve('src/ai')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'semantic.worker': resolve('src/search/semantic.worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), transformHtmlPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
