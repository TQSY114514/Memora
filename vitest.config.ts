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
        // v1.9：覆盖率门禁提升（新增 safePath/vectorMath/searchQuery 测试后上调）
        // 当前实际：statements 16.74% / branches 16.15% / functions 13.43% / lines 17.31%
        // 门禁设为略低于实际值，防止回退同时不阻断 CI
        statements: 16,
        branches: 16,
        functions: 13,
        lines: 17
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
