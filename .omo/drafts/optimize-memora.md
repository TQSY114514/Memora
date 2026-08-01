---
slug: optimize-memora
status: awaiting-approval
intent: unclear
review_required: true
plan_path: .omo/plans/optimize-memora.md
plan_sha256: null
review_round_id: null
pending-action: 向用户呈现审批摘要；批准后按 UNCLEAR 路径运行高精度双重审查（momus + Oracle）
review:
  momus:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/optimize-memora.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
  independent:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/optimize-memora.md
    round_id: null
    plan_sha256: null
    session: null
    result: null
approach: 融合计划 v2 — 用户版本路线图(v1.7.0 记忆智能 / v1.7.1 性能安全 / v1.8.0 文档社区) + 探索发现(备份Bug/SQL白名单/Electron EOL/工程化) → 6 Wave 交付；v2 修正：v1.7.0 后端已存在于代码库（memoryLifecycle.ts 已实现），改为审查+加固+测试+UI 接入；全部 CRITICAL 事实错误已按代码实况修正
---

# Draft: optimize-memora (v2 — Metis 修复后)

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id | outcome | status | evidence |
|----|---------|--------|----------|
| C1 v1.7.0 记忆智能收尾 | **已实现于代码库**（memoryLifecycle.ts 283 行 + IPC 4 通道 + types）：改为审查+加固+统一两套衰减+补测试+PreferenceExplorer UI 接入 | active | 核实 memoryLifecycle.ts:1-283 / memoryLifecycle.ipc.ts:21-37 / types.ts:508-543 |
| C2 正确性前置 | 修复备份路径 Bug（backup.ts:80 userData/memora.db vs connection.ts:17 userData/data/Memora.db）+ 备份加密审计（PBKDF2 310k + 格式版本标记，旧备份兼容） | active | 核实 backup.ts:80 / connection.ts:17 / backup.ts:45-58 |
| C3 v1.7.1 性能 | DB 复合索引（真实列名 v8 迁移）+ 列表分页收尾（repo 层已有 limit/offset）+ 向量搜索优化（内存 LRU） | active | schema.ts 索引核对 / knowledgeRepo.ts:108 / preferencesRepo.ts:144 |
| C4 v1.7.1 安全 | 输入验证层 + 共享 safeHandle（11 文件重复定义）+ SQL 运行时白名单 + execFileSync 化 | active | handlers/*.ipc.ts 核实（safeHandle 各文件局部定义） |
| C5 工程化 | ESLint/Prettier + CI 门禁 + 组件拆分（含 PreferenceExplorer）+ 版本一致性 | active | package.json 无 lint; 大文件探索 |
| C6 v1.7.2 Electron | 33.4.11 → 43.2.0 + electron-vite ^2.3→^5 + vite ^5.4→^7 + better-sqlite3 12 + Node ≥20.19（用户已确认） | active | package.json:34-45 核实 / context7 官方文档 |
| C7 v1.8.0 文档社区 | MCP API 文档 + 贡献指南/Issue 模板 + 快速开始教程 | active | 用户融合指示 |

## 用户决策记录（本次确认）

1. **v1.7.0 处理方式（用户确认"审查+加固+测试+UI接入"）**：探索 + Metis 独立审查双重证实 memoryLifecycle.ts 已完整实现 v1.7.0 三件套（C1 艾宾浩斯遗忘 / C2 分层记忆 / C3 深度画像），IPC 4 通道已注册（MEMORY_TIERED/HEALTH/PROFILE_SUMMARY/LIFECYCLE_RUN）。原计划 todos 3/4/5（从零新建）作废，改为：审查现有实现、统一两套衰减机制（decayConfidence 线性 vs 艾宾浩斯曲线）、修复 runMemoryLifecycle 统计缺陷（lines 246-273）、补单元测试、PreferenceExplorer 接入现有通道展示（不新建通道/页面）。
2. **Electron 升级保留（用户确认"保留，接受 Node 要求提升"）**：33.4.11 → 43.2.0 + electron-vite ^5 + vite ^7 + better-sqlite3 ≥12.10.1 + npmRebuild true；README 环境要求 Node ≥18 → ≥20.19；electron-vite v5 迁移注意（externalizeDepsPlugin 弃用 → build.externalizeDeps 默认开启）。
3. **用户原否决项不变**：❌ Web UI、❌ 全库覆盖率门禁（ROI 低）、❌ 一次性全做（按 Wave 分批）。

## Metis 审查 CRITICAL 修复记录（全部已核实并修正进计划 v2）

| # | Metis 发现 | 核实结果 | 计划修正 |
|---|-----------|---------|---------|
| 1 | v1.7.0 已实现（todos 3/4/5 从零新建错误） | ✅ 属实（memoryLifecycle.ts 283 行完整实现 + IPC 已注册） | Wave 1 改为审查+加固+测试+UI 接入 |
| 2 | todo 6 引用不存在列（chat_messages/workspace_id） | ✅ 属实（表名 messages；chat_sessions 无 workspace_id 列） | 索引目标改为 messages(session_id,created_at)/chat_sessions(updated_at)/knowledge_entries(workspace_id,type)/preferences(workspace_id,status) |
| 3 | todo 2 PBKDF2 破坏旧备份兼容（无版本标记） | ✅ 属实（backup.ts:143-145 文件头仅 salt+iv） | 新增 magic+version 头部，无 magic 旧格式按 100k 读取 |
| 4 | todo 15 electron-vite/Vite/Node 版本联动 | ✅ 属实（electron-vite 实为 ^2.3.0；官方文档 v5 需 Node 20.19+/22.12+） | 升级链 electron-vite ^5 + vite ^7 + README Node ≥20.19 |
| 5 | todo 9 safeHandle 非统一入口 | ✅ 属实（11 个 handler 文件各定义局部 safeHandle） | 新建共享 src/main/ipc/safeHandle.ts，逐文件替换 + 校验层 |
| 6 | todo 13 拆分 <250 行与主文件矛盾 | ✅ 提取件均 <250（113/172/156/46）；主文件不要求 | 验收改为"拆出的新文件 <250 行" |
| 7 | todo 8 缓存键与 embeddingRepo 冲突 | ✅ 属实（表按 message_id 去重，无 text-hash 列） | 缓存改为内存 LRU（不落库） |
| 8 | todo 11 execSync 选项表述错误 | ✅ 属实（execSync 默认经 shell） | 改用 execFileSync(tool, [cmd]) |
| 9 | 范围矛盾（"不新增功能" vs v1.7.0 新功能） | ✅ 消解 | Scope OUT 明确：不新建 IPC 通道/MCP 工具/页面，UI 接入复用现有通道 |
| 10 | todo 6 迁移"可回滚"与 one-way 冲突 | ✅ 属实（migrations append-only 单向） | 验收改为"失败事务回滚不破坏 DB + 幂等" |
| 11 | 三套衰减机制并存（decayConfidence/ebbinghaus/runMemoryLifecycle 归档） | ✅ 属实（main/index.ts:207 启动调用 + MCP server.ts:49 + IPC） | todo 3 统一为艾宾浩斯曲线，收敛到 runMemoryLifecycle |

## Findings (cited - path:lines)

### 项目状态
- Memora v1.6.1（package.json:3），Electron ^33.2.0 + React 18 + TS 5.7 + better-sqlite3 ^11.7 + FTS5 + Zustand + Tailwind；electron-vite ^2.3.0、vite ^5.4.11、vitest ^4.1.10
- 90%+ AI 生成代码，未经人工安全审计（README:37）
- CI: typecheck + vitest + build，无 lint、无 coverage

### v1.7.0 记忆智能（已实现 — 本轮核实）
- `src/main/memoryLifecycle.ts`（283 行）：C1 ebbinghausRetention/memoryStrength（S 分档 1/6/30/90/180）、C2 classifyMemoryTier（working <0.3 / short_term 0.3-0.6 / long_term ≥0.6 + 新创建<7天规则）、C3 generateProfileSummary（规则模板，非 LLM）+ runMemoryLifecycle（strength<0.1 归档）
- `memoryLifecycle.ipc.ts` 已注册 4 通道；`shared/types.ts:508-543` 已有 MemoryTier/TieredMemory/MemoryHealth/ProfileSummary
- `preferences` 表已在 schema.ts:173-191 + migrations v7（含 last_accessed_at/access_count）
- **缺陷**：runMemoryLifecycle:246-273 统计逻辑矛盾（promoted/demoted 基于 touch 前状态且条件与 classify 冲突）；两套衰减并存（decayConfidence 线性 vs 艾宾浩斯曲线）；渲染层无 MEMORY_* 消费（UI 未接入）

### 备份（本轮核实）
- backup.ts:80 getDbPath() 返回 `userData/memora.db`，实际 DB 在 `userData/data/Memora.db`（connection.ts:17）→ 备份功能实质失效
- PBKDF2_ITERATIONS = 100_000（backup.ts:49）；加密头 = salt(16)+iv(12)，**无版本标记**
- require('fs') 散落（156-158/220-229/262）；BackupService 无 DI（constructor 读 app.getPath）→ 需注入化

### IPC 注册模式（本轮核实）
- 11 个 handler 文件各自定义局部 safeHandle 函数（ai.ipc.ts:16 / bgImport.ipc.ts:6 / import.ipc.ts:9 / memoryLifecycle.ipc.ts:10 / knowledge.ipc.ts:22 / search.ipc.ts:7 / preferences.ipc.ts:18 / session.ipc.ts:18 / sharing.ipc.ts:7 / system.ipc.ts:10 / workspace.ipc.ts:17）→ 非统一入口，todo 9 需抽取共享模块
- ipc/index.ts 仅汇总注册（registerXxxHandlers）

### SQL 面（后台探索 + 本轮核实）
- 5 个动态 UPDATE 站点确认：workspaceRepo.ts:92 / folderRepo.ts:116 / knowledgeRepo.ts:221 / preferencesRepo.ts:199（实测 184-199）/ sessionRepo.ts:287——均 TS patch 类型白名单 + 命名参数绑定，但无共享辅助
- system.ipc.ts:192-202 insertRow：ALLOWED_TABLES + colNameRe 白名单
- 真实 Bug：备份路径不一致（见上）

### Electron 升级（librarian 研究 + context7 本轮核实）
- 33.4.11 已 EOL（2025-04-29），6+ CVE（高危 CVE-2026-34771、CVE-2025-55305）；当前稳定 43.2.0
- electron-vite 最新稳定 v5.0.0：官方文档要求 Node 20.19+/22.12+ 与 Vite v5.0+；v5 迁移：externalizeDepsPlugin 弃用 → build.externalizeDeps 默认开启；嵌套函数配置不支持（需静态对象）
- 同步升级：vite ^5.4.11 → ^7、better-sqlite3 ^11.7 → ≥12.10.1、npmRebuild false → true
- safeStorage 同步 API 弃用（43，建议 async，非阻塞）；Electron 42+ 二进制不再 postinstall 下载

### 测试面（bg_7192157e 探索 + 本轮核实）
- 仅 5 个测试文件（importer/search 纯函数）；零测试：database/main/ai/mcp/preload/sharing/renderer
- connection.ts:21 initDatabase(dbPath?) 可注入 + closeDatabase() 重置单例；connection.ts:2 顶层 import electron 需 vi.mock
- search/indexer+query 不依赖 Electron → 内存 DB 直测；backup.ts 需注入化重构方可测
- **渲染层无 jsdom**（vitest environment: node）→ 渲染层验证靠 typecheck + build + F3 手动 QA

### 分页（本轮核实 — 比计划 v1 假设更完整）
- listEntries（knowledgeRepo.ts:108-115）与 listPreferences（preferencesRepo.ts:144-150）**已支持 limit/offset**（默认 1000）→ todo 7 只剩 IPC 透传 + 渲染层增量加载 + 图谱上限（10000→500）
- @tanstack/react-virtual 已在 ChatViewer/ChatList 使用

### 工程化
- 无 ESLint/Prettier、无 lint 脚本；大文件：Knowledge/index.tsx 633 / Sidebar 566 / ChatViewer 559 / KnowledgeGraph 452 / **PreferenceExplorer 500（todo 5 UI 接入后继续增长，纳入 todo 13 拆分）**
- README 徽章 1.5.0（README:13）、CHANGELOG 最新 1.5.0、package.json 1.6.1

## Decisions (with rationale)

1. **D1 版本化交付**：6 Wave 分批（Wave 1 → v1.7.0；Wave 2+3 → v1.7.1；Wave 4+5 → v1.7.2；Wave 6 → v1.8.0），每版本组收尾 bump + tag。
2. **D2 备份 Bug 前置**：Wave 1 第一个任务（备份功能实质失效）。
3. **D3 SQL 修复**：共享运行时列名白名单映射 + 参数绑定；insertRow 保留白名单并补防御测试。
4. **D4 测试策略（尊重用户否决）**：不做全库覆盖率门禁；安全/正确性修复 TDD；渲染层无 jsdom 不做单测（typecheck+build+F3）。
5. **D5 组件拆分**：纯机械提取（Knowledge/Sidebar/ChatViewer/PreferenceExplorer），拆出的新文件 <250 行。
6. **D6 分页实现**：repo 层已支持 limit/offset（默认 1000 保持兼容）→ IPC 透传 + 渲染层增量加载（页 50/上限 500）+ 图谱上限 500。
7. **D7 Electron 升级（用户确认）**：33→43 直接跳 + electron-vite ^5 + vite ^7 + better-sqlite3 12 + npmRebuild true + Node ≥20.19 文档更新；safeStorage async 可选；独立提交可回滚。
8. **D8 记忆智能处理（用户确认）**：审查 + 加固 + 测试 + UI 接入，不重写正确行为；统一衰减机制；修复 runMemoryLifecycle 统计缺陷。
9. **D9 备份加密兼容**：PBKDF2 100k→310k + 格式版本标记（magic 'MBK1' + version），无 magic 旧格式按 100k 兼容读取（硬要求）。
10. **D10 版本一致性**：README 徽章 → 1.6.1（本任务），Wave 1 收尾 bump v1.7.0，此后每版本组 bump。

## Scope IN（v2 摘要）

**v1.7.0**：备份 Bug 修复+注入化；备份加密审计（310k+版本标记+兼容）；记忆生命周期统一加固+测试；分层记忆审查+测试；画像审查+PreferenceExplorer UI 接入（复用现有 3 通道）；版本 bump v1.7.0
**v1.7.1**：v8 复合索引（真实列名）；分页收尾（IPC 透传+增量加载+图谱 500）；向量内存 LRU+分块+维度校验；输入验证层+共享 safeHandle；SQL 白名单统一；execFileSync 化
**v1.7.2**：ESLint 9+Prettier+CI 门禁；组件拆分（4 组件）；版本一致性；Electron 43 升级+冒烟+safeStorage async（可选）
**v1.8.0**：MCP 25 工具 API 文档（脚本核对）；贡献指南+Issue 模板；快速开始教程

## Scope OUT (Must NOT have)

- ❌ 不新增产品功能：不新建 IPC 通道、不新建页面、不新增 MCP 工具、不新增导入器（UI 接入复用已注册通道）
- ❌ 不做 Web UI（用户明确拒绝）
- ❌ 不设全库覆盖率门禁（用户判断 ROI 低）
- ❌ 不做架构级重写（不换框架、不迁移数据库引擎、不改 IPC 协议、不改 preload API 签名）
- ❌ 不引入新运行时依赖（electron/better-sqlite3/electron-vite/vite 升级除外）
- ❌ 不破坏备份向后兼容（旧加密备份必须可恢复）
- ❌ 不重写 memoryLifecycle.ts 的正确行为（只修缺陷、统一机制、补测试）
- ❌ 远期项：云端同步/账号系统/协作/浏览器插件/在线分享托管

## Approval gate
status: awaiting-approval
approach: 6 Wave 融合计划 v2 — Wave1 v1.7.0 收尾（备份修复+记忆审查加固+UI接入）→ Wave2+3 v1.7.1（索引/分页/向量 + 验证/白名单/execSync）→ Wave4+5 v1.7.2（lint/拆分/版本 + Electron 43）→ Wave6 v1.8.0（文档）。全部假设已按代码实况修正（Metis 11 项 CRITICAL 全部核实并修复）。
next-action: 向用户呈现审批摘要（人类 TL;DR）→ 用户批准 → 运行高精度双重审查（momus + Oracle，UNCLEAR 路径自动执行）→ 审查通过后交 $start-work
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
