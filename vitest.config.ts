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
        // 起步门槛：防止覆盖率回退。随测试补充逐步提高。
        // functions 偏低因 renderer 组件函数多但难单测，暂设 10%
        statements: 15,
        branches: 15,
        functions: 10,
        lines: 15
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
