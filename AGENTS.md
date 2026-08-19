# AGENTS.md

Memora 的项目宪法——人机共建：这是什么、代码住哪、硬规则是什么、动手前先读什么。

## What this is

Memora 是一个 Local-First 的 AI 对话知识管理工作区（Electron + React/TS + electron-vite +
better-sqlite3）。核心定位：**AI 对话时代的知识管理工具**——把聊天会话变成可检索、可合并、可安全共享的结构化记忆。
同时以 `memora-mcp` 形式提供 MCP 服务，让 Claude Code / Cursor 等外部 agent 读写这些记忆。

## Start

- 开发：`npm run dev`（electron-vite dev）。
- 构建：`npm run build`（electron-vite build），产物在 `out/`；打包：`npm run dist`（electron-builder）。
- MCP 模式：`npm run mcp`（`electron out/main/index.js --mcp`）。
- 自检：`npm run self-test`（`node out/main/index.js --self-test`）。
- 要求 Node ≥ 24；`postinstall` 会跑 `scripts/postinstall.js`，别手动跳过。

## Architecture map

- **主进程** `src/main/`：Electron 主入口、窗口管理、IPC 宿主。
- **渲染进程** `src/renderer/`：React UI。
- **数据库** `src/database/`：better-sqlite3 数据层（含 FTS5 索引、migration 表）。
- **混合检索** `src/search/`：`hybridSearch.ts`（FTS5 关键词 + 向量语义 + 时间衰减 +
  知识图谱 boost + 可选 reranker 精排），`semantic.ts`（embedding，Worker 常驻池，失败回退主进程同步）。
- **记忆合并** `src/memoryAgent/`：`consolidation.ts` 后台合并重复/相似记忆，被合并条目标
  `superseded`，保留最高置信度。
- **MCP 服务** `src/mcp/`：`server.ts`（协议宿主）、`tools/`（工具实现）、`accessControl.ts`
  （按客户端字段级权限，环境变量 `MEMORA_FIELD_RESTRICTIONS` 配置，默认拒绝受限类别）、
  `validation.ts` / `schemas.ts`。所有工具调用记审计日志。
- **安全共享** `src/sharing/encryptedWorkspace.ts`：MMF（Memora Memory Format）作载体 +
  AES-256-GCM（`src/crypto/e2e.ts`）+ SHA-256 校验和，`encryptSharedWorkspace` / `decryptSharedWorkspace`。
- **导入防线** `src/importer/`：`promptInjectionDetector.ts`（5 类注入规则）、`piiDetector.ts`
  （API key/私钥/JWT/邮箱/手机号/身份证/信用卡脱敏，精确区间仲裁）。
- **其余模块**：`identity/`（身份）、`migration/`（schema 迁移）、`preload/`（contextBridge）、
  `shared/`（双进程共享类型/常量）、`sync/`、`team/`、`templates/`、`capsule/`、`ai/`、`crypto/`、`security/`。
- **架构说明**：设计决策见 `docs/ARCHITECTURE.md`（混合检索权重公式、合并阈值、权限模型都写在这里）。

## Hard rules

- **SQLite 只走 prepared statements**：所有查询 `db.prepare(...).get/all/run` + `?` 绑定，
  禁止字符串拼接 SQL。FTS5 索引的中文分词依赖 `Intl.Segmenter`，改动索引逻辑前先读 `src/search/` 现有实现。
- **MCP 权限默认拒绝**：新工具接入 `src/mcp/tools/` 必须过 `accessControl.ts` 分类检查，
  默认拒绝受限类别；新增工具必须记录 `auditToolCall`。这是防止 MCP 泄漏个人信息的底线。
- **共享数据必须加密**：任何导出给外部（MCP 之外）的工作区数据走 MMF + AES-256-GCM + 校验和，
  禁止明文导出。校验失败必须拒绝导入。
- **导入内容视为不可信**：外部文本进库前必须过 promptInjectionDetector 与 piiDetector，不允许绕过。
- **Embedding 路径默认关闭**：`semantic.ts` 与 consolidation 的 `useEmbedding` 默认关闭，
  避免隐式 API 成本；启用必须可优雅回退到纯本地逻辑。
- **提交纪律**：husky + commitlint（conventional commits）+ `test:ci`（vitest --retry=2）。
  提交前必须 `npm run typecheck`（node + web 两个 tsconfig 都要过）。
- **CI 门禁**：`.github/` 里含 npm audit 白名单机制（已知传递漏洞如 extract-zip 有豁免），
  新增依赖先确认不破坏 audit 门禁。

## Before changing X, read Y

- 改检索排序 → `src/search/hybridSearch.ts` + `docs/ARCHITECTURE.md` §1（权重公式）。
- 改记忆合并 → `src/memoryAgent/consolidation.ts` + ARCHITECTURE §2。
- 改 MCP 工具/权限 → `src/mcp/` 下对应文件 + `accessControl.ts` + ARCHITECTURE §3。
- 改共享/导入安全 → `src/sharing/encryptedWorkspace.ts` + `src/importer/` + ARCHITECTURE §4/§5。
- 改数据库 schema → `src/database/` + `src/migration/`（老库升级路径）。

## Verification

- `npm run typecheck`（node + web）必须通过。
- `npm run test`（vitest）通过；提交前跑 `npm run test:ci`。
- `npm run lint` 干净。
- MCP 改动：`npm run self-test` + `npm run mcp` 手工验证协议。