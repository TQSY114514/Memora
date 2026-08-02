# 安全策略

## 报告漏洞

如果您发现了安全漏洞，请**不要**在 GitHub Issues 中公开报告。

请通过以下方式私密报告：
1. 在 GitHub 上创建 [Security Advisory](https://github.com/TQSY114514/Memora/security/advisories/new)
2. 或发送邮件至仓库所有者

我们承诺：
- 在 **48 小时内**确认收到报告
- 在 **7 天内**提供初步评估
- 在修复发布后公开致谢（如果您同意）

## 安全架构

### 数据存储
- **本地优先**：所有数据存储在用户本地 SQLite 数据库，不上传任何服务器
- **文件权限**：数据库文件以 `0600` 权限创建（仅当前用户可读写）
- **API Key 加密**：使用 Electron `safeStorage` 加密存储 API Key
- **零遥测**：不收集任何遥测数据，不训练模型

### 进程隔离
- **渲染进程沙箱**：`sandbox: true`，禁用 `nodeIntegration`
- **Context Isolation**：`contextIsolation: true`，preload 通过 `contextBridge` 暴露最小 API
- **CSP**：严格 Content-Security-Policy，限制资源加载为同源
- **自定义协议**：使用 `app://` 协议替代 `file://`，防止动态 import 路径问题

### IPC 安全
- **路径白名单**：所有文件操作验证路径在允许的根目录内（userData/Downloads/Documents/Desktop）
- **ID 校验**：所有 IPC handler 使用 `assertSafeId` 校验 ID 格式（`/^[A-Za-z0-9_-]{1,64}$/`）
- **频率限制**：IPC 通道分级限流（读 120/写 30/敏感 10 次每 10 秒）
- **原子文件操作**：备份/恢复使用 `tmp + rename` 原子操作

### MCP Server 安全
- **默认只读**：MCP Server 默认拒绝所有写/删除操作
- **三级访问控制**：只读 → 写入（`--write`）→ 破坏性（`--destructive`）
- **Zod Schema 校验**：全部 25 个工具入参经 Zod 运行时校验
- **审计日志**：所有写/破坏性操作记录审计日志
- **工具白名单**：支持 `MEMORA_ALLOWED_TOOLS` 环境变量限制可用工具

### 导入安全
- **只读模式**：导入器以只读方式读取 AI 应用数据，不修改原始文件
- **符号链接检查**：拒绝读取符号链接文件，防止 symlink 攻击
- **文件大小限制**：单文件上限 100MB，防止 OOM
- **JSON 深度限制**：JSON 解析最大嵌套深度 100，防止深度嵌套攻击
- **PII 检测**：导入时自动检测 API Key/邮箱/电话/身份证等敏感信息
- **凭证自动脱敏**：API Key/Token/密码等凭证在导入时自动脱敏

### SQL 安全
- **预编译语句**：所有数据库查询使用 `better-sqlite3` 参数化查询
- **动态列名白名单**：`buildUpdateSets` 使用 `columnMap` 白名单 + 正则校验
- **FTS5 查询转义**：全文搜索输入按 FTS5 规范转义双引号，参数化传递

## 已知限制

- 本项目 90%+ 代码由 AI 生成，未经专业安全审计
- SQLite 数据库文件未加密（攻击者获取文件后可直接读取），建议未来支持 SQLCipher
- 导出的 HTML 分享包包含明文对话内容，请注意分享范围

## 依赖安全

- CI 集成 `npm audit --audit-level=high` 门禁
- 核心依赖（Electron、better-sqlite3、React）定期更新
- 使用 `package-lock.json` 锁定依赖版本
