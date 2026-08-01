# Security Policy

## Supported Versions

Memora 采用本地优先架构，所有用户数据（AI 对话、偏好、知识库）均存储在用户本机的 SQLite 数据库中，不上传到任何服务器。我们仅对以下版本提供安全更新：

| Version | Supported          | Notes |
| ------- | ------------------ | ----- |
| 1.7.x   | :white_check_mark: | 当前稳定线 |
| 1.6.x   | :white_check_mark: | 维护中（仅安全修复） |
| < 1.6   | :x:                | 已停止维护，请升级 |

## Reporting a Vulnerability

我们非常重视 Memora 的安全问题——本项目存储用户敏感的 AI 对话历史，安全是我们的核心承诺。

### 上报渠道（按优先级）

1. **GitHub Security Advisory（推荐）**：前往 https://github.com/TQSY114514/Memora/security/advisories/new 提交私密漏洞报告。此渠道端到端加密，仅仓库维护者可见。
2. **邮箱**：发送至 `tqishengyan@gmail.com`，主题请加 `[SECURITY]` 前缀。

### 请勿公开

在漏洞修复并发布之前，**请勿在 GitHub Issue、PR 或任何公开渠道披露漏洞细节**，以免被恶意利用。

### 响应时效

| 阶段 | 承诺 |
| --- | --- |
| 确认收到 | 48 小时内 |
| 初步评估 | 5 个工作日内 |
| 修复发布 | 严重漏洞 14 天内；其他视复杂度而定 |
| 公开披露 | 修复发布后 90 天，或与上报者协商的时间 |

### 报告内容

为加快处理，请尽量包含：
- 受影响的版本号与平台（Windows / macOS / Linux）
- 复现步骤（最小化样例最佳）
- 影响评估（如可导致数据泄露、任意代码执行等）
- 建议的修复方向（可选）

## Security Measures

Memora 已内置以下安全机制：

- **API Key 加密存储**：使用 Electron `safeStorage`（macOS Keychain / Windows DPAPI / Linux libsecret）加密，渲染进程永不接触明文存储
- **CSP 内容安全策略**：禁止内联脚本与动态脚本执行，限制资源加载来源
- **沙箱 + contextIsolation**：渲染进程无法直接访问 Node API
- **MCP 只读模式**：可通过 `MEMORA_READONLY=true` 或 `--readonly` 启用只读模式，限制写操作
- **自动热备份**：支持 AES-256-GCM 加密备份
- **全局结构化日志**：敏感字段自动脱敏

## Scope

以下情况**不在**安全政策范围内：

- 用户自行修改源码引入的问题
- 用户在无加密环境的系统（如无 libsecret 的 Linux）上运行，且已知会降级存储 API Key 的情况
- 第三方依赖的已知漏洞（请通过 `npm audit` 自行排查，我们会跟进修复）
