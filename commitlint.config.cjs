/**
 * Commitlint 配置
 *
 * 强制 Conventional Commits 格式：type(scope): subject
 * 与项目现有提交风格一致（feat/fix/refactor/test/docs/chore/perf）。
 * husky 在 commit-msg 钩子中调用 commitlint，非规范提交被拒绝。
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 枚举（与项目实际使用对齐）
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // bug 修复
        'refactor', // 重构（不改行为）
        'perf',     // 性能优化
        'test',     // 测试
        'docs',     // 文档
        'chore',    // 构建/工具/依赖
        'style',    // 格式（不改逻辑）
        'ci',       // CI 配置
        'build',    // 构建系统
        'revert'    // 回滚
      ]
    ],
    // subject 非空，最长 100 字符
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 100],
    // header 最长 120 字符
    'header-max-length': [2, 'always', 120],
    // body 每行最长 200 字符
    'body-max-line-length': [1, 'always', 200]
  }
}
