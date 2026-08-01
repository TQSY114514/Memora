/**
 * ESLint 9 Flat Config
 *
 * 从 .eslintrc.cjs 迁移而来，配置等价。
 * - @typescript-eslint v8 原生支持 flat config
 * - eslint-plugin-react-hooks v5 支持 flat config
 * - eslint-config-prettier v10 提供 flat config
 */
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // 全局忽略
  {
    ignores: ['out/', 'dist/', 'node_modules/', 'coverage/', '*.config.js', '*.config.cjs', '*.config.mjs', 'scripts/']
  },

  // 基础规则
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 项目通用配置
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // browser + node 混合环境（Electron renderer + main）
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly'
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      // 从 .eslintrc.cjs 迁移的规则
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-undef': 'off', // TypeScript 已处理
      // react-hooks 推荐规则
      ...reactHooks.configs.recommended.rules
    }
  },

  // 关闭与 prettier 冲突的格式化规则
  prettier
)
