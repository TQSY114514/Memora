import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/renderer/**',        // 渲染进程组件难单测，暂不计入
        'src/main/index.ts',      // Electron 入口，需集成测试
        'src/database/connection.ts', // 原生模块绑定，CI 无法加载
        'src/**/types.ts'
      ],
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        // v1.9.1：覆盖率门禁提升（新增 safePath ID/filename + htmlExporter XSS +
        // secretStore 加解密 + mcpServer 路由/访问控制 + accessControl 脱敏测试后上调）
        // 当前实际：statements 19.23% / branches 19.35% / functions 16.12% / lines 20.02%
        // 门禁设为略低于实际值，留 >1% 余量防止小幅回退阻断 CI
        statements: 18,
        branches: 18,
        functions: 15,
        lines: 19
      }
    }
  },
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
  }
})
