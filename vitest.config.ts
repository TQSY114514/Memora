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
        // v9: 上调门禁紧贴实际（47.2/45.3/39.3），留 >1% 余量防小幅回退
        statements: 45,
        branches: 42,
        functions: 36,
        lines: 46
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
