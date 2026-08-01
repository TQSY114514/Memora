# optimize-memora - Work Plan (v2, Metis-reviewed)

## TL;DR (For humans)

**What you'll get:** 融合您的版本路线图与代码库真实状态的四版本落地计划。**重大修正：v1.7.0 记忆智能的后端已在代码库中存在**（`src/main/memoryLifecycle.ts` 283 行完整实现遗忘机制/分层记忆/深度画像，IPC 4 通道已注册，类型已定义）——因此 Wave 1 从"从零新建"改为"**审查 + 加固 + 补测试 + UI 接入**"，并修复两个真实缺陷：备份路径 Bug（备份功能实际失效）与两套衰减机制并存。v1.7.1 性能安全、v1.7.2 Electron 43 升级 + 工程化、v1.8.0 文档社区按您的时间估算保留。

**Why this approach:** 您的路线图（v1.7.0 记忆智能 5h/4h/3h）与代码库现状冲突——探索代理遗漏了 memoryLifecycle.ts，Metis 独立审查 + 我的逐文件核实确认：**该文件已实现**。同时确认其余计划假设错误（表名/列名/依赖版本/API 选项），本版全部修正为代码库实况。

**What it will NOT do:** 不做 Web UI、不做全库测试覆盖率门禁（您判断 ROI 低）、不一次性全做、不新增产品功能（UI 接入只把已实现的功能暴露给现有 PreferenceExplorer，不新建页面）、不做架构重写、不动云端同步等远期项。

**Effort:** Large — 19 个实现任务分 6 Wave，Electron 升级（Wave 5）仍为最大单项，且连带 Node ≥20.19 要求（您已确认接受）
**Risk:** Medium — Electron 33→43 跨 ABI 断裂点 + 备份格式兼容（新增版本标记，旧备份仍可恢复）

**Decisions I made for you (含您确认的):** ①v1.7.0 改为审查+加固+测试+UI 接入（您确认）；②Electron 33→43 升级保留、README 环境要求更新为 Node ≥20.19（您确认）；③备份加密格式新增版本标记头部（旧格式文件可读，向后兼容硬要求）；④两套衰减机制统一为艾宾浩斯曲线（decayConfidence 保留为启动时兼容入口，行为收敛到 runMemoryLifecycle）；⑤测试只覆盖关键修复路径；⑥组件拆分纯机械提取（含 PreferenceExplorer）。

Your next move: approve, or request changes. Full execution detail follows below.

---

> TL;DR (machine): v2 修正 Metis 全部 CRITICAL 事实错误后重写。19 todos / 6 waves：Wave1 v1.7.0 收尾（备份修复+记忆审查加固+UI接入）→ Wave2+3 v1.7.1（索引/分页/向量 + 验证/白名单/execSync）→ Wave4+5 v1.7.2（lint/拆分/版本 + Electron 43）→ Wave6 v1.8.0（文档）。计划假设全部对齐代码库实况（memoryLifecycle.ts 已存在、messages 表非 chat_messages、chat_sessions 无 workspace_id、electron-vite 实为 ^2.3.0、safeHandle 为 11 文件各自局部函数）。

## Scope

### Must have

**Wave 1 — v1.7.0 记忆智能收尾（正确性修复 + 审查加固 + UI 接入）**
- 修复备份路径 Bug：`backup.ts:80` getDbPath() 返回 `userData/memora.db`，实际 DB 在 `userData/data/Memora.db`（connection.ts:17）——备份功能实质失效
- 备份加密审计：PBKDF2 100k→310k + **加密格式版本标记**（新增 magic+version 头部，旧格式按 100k 迭代读取，向后兼容）
- 记忆生命周期审查加固：统一两套衰减机制（decayConfidence 线性 vs memoryLifecycle 艾宾浩斯）、修复 runMemoryLifecycle 统计逻辑缺陷、补单元测试
- 分层记忆模型审查：classifyMemoryTier 边界条件、getTieredMemories 排序稳定性、补测试
- 深度画像审查 + UI 接入：generateProfileSummary 审查；PreferenceExplorer 接入 MEMORY_HEALTH / MEMORY_TIERED / MEMORY_PROFILE_SUMMARY 三个已注册通道（不新建通道、不新建页面）

**Wave 2-3 — v1.7.1 性能与安全（P1/P2/P3）**
- DB 复合索引（真实列名）：`messages(session_id, created_at)`、`chat_sessions(updated_at)`、`knowledge_entries(workspace_id, type)`、`preferences(workspace_id, status)`（迁移 v8，单向幂等）
- 列表分页收尾：repo 层 limit/offset 已存在（listEntries/listPreferences 默认 1000）→ IPC 透传 + 渲染层增量加载 + 图谱上限 10000→500
- 向量搜索优化：内存 LRU 缓存（text-hash → embedding，不落库，不与 embeddingRepo 的 message_id 语义冲突）+ 分块计算（≤50/块）+ 维度校验
- 输入验证层：`src/shared/validation.ts`（纯函数）+ 新建共享 `src/main/ipc/safeHandle.ts`（统一 11 个 handler 文件的重复包装，在此加校验）+ MCP 入参 + 导入器钳制
- SQL 运行时列名白名单统一（5 个动态 UPDATE + system.ipc.ts insertRow 防御测试）
- appDetector execSync 加固：改用 `execFileSync(where/which, [cmd])`（无 shell 解释）+ 命令白名单 + 错误处理

**Wave 4-5 — v1.7.2 基础设施**
- ESLint 9 flat config + Prettier + CI 门禁（存量仅修 lint 错误，不强制格式化历史代码）
- 大组件拆分：Knowledge / Sidebar / ChatViewer / **PreferenceExplorer**（新文件 <250 行）
- 版本一致性：README 徽章 1.5.0→1.6.1、CHANGELOG 补齐、本次交付后 bump v1.7.0（此后每 Wave 组 bump + tag）
- Electron 33.4.11 → 43.2.0 + electron-vite ^2.3.0→^5 + vite ^5.4.11→^7 + better-sqlite3 ^11.7→^12.10.1 + npmRebuild true + **README Node ≥18→≥20.19**
- Electron 冒烟清单 + safeStorage async 迁移（可选）

**Wave 6 — v1.8.0 文档与社区（D1/D2/D3）**
- MCP 工具 API 文档（25 工具：参数/示例/返回值，脚本核对工具名集合）
- 贡献指南 + Issue 模板
- 快速开始教程（5 分钟路径；记忆功能章节基于审查后的实际实现）

### Must NOT have (guardrails, anti-slop, scope boundaries)

- ❌ 不做 Web UI（用户明确拒绝）
- ❌ 不设全库测试覆盖率门禁（用户判断 ROI 低；仅关键修复附回归测试）
- ❌ 不一次性全做——严格按 Wave 分批交付
- ❌ 不新增产品功能：不新建 IPC 通道（UI 接入复用 MEMORY_* 已注册通道）、不新建页面、不新增 MCP 工具、不新增导入器
- ❌ 不做架构级重写（不换框架、不迁移数据库引擎、不改 IPC 协议、不改 preload API 签名）
- ❌ 不引入新运行时依赖（electron / better-sqlite3 / electron-vite / vite 升级除外）
- ❌ 不重设计 UI 视觉（组件拆分纯机械提取；PreferenceExplorer 接入复用现有卡片/样式组件）
- ❌ 远期项一律不做：云端同步 / 账号系统 / 协作 Workspace / 浏览器插件 / 在线分享托管
- ❌ 不破坏备份向后兼容：旧加密备份（100k 迭代、无版本标记）必须仍可恢复
- ❌ 不重写现有 memoryLifecycle.ts 的正确行为——只修缺陷、统一机制、补测试

## Verification strategy

> Zero human intervention - all verification is agent-executed (except F3 手动项)。

- **Test decision:** 混合——正确性/安全修复（备份、SQL、输入验证、execSync）TDD；审查加固（记忆生命周期、分层、画像）tests-after 关键路径；UI 接入无 jsdom 环境（vitest node-only），验证靠 typecheck + build + F3 手动 QA 清单。
- **Framework:** vitest（现有，node 环境，`test/**/*.test.ts`），新增 `test/helpers/db.ts`（`vi.mock('electron')` + `initDatabase(临时文件)` + `closeDatabase()` 清理）。不安装 @vitest/coverage-v8。
- **渲染层验证约束（Metis M-* 确认）：** 测试环境无 jsdom，渲染层组件不做单测；渲染层改动以 `npm run typecheck` + `npm run build` + F3 手动清单为准。
- **Commands:**
  - `npm run typecheck`（node + web 双 tsconfig）
  - `npm test`（vitest run）
  - `npm run lint`（Wave 4 引入后）
  - `npm run build`（每 Wave 收尾）
- **Evidence:** `.omo/evidence/task-<N>-optimize-memora.txt`（attemptDir = `.omo/evidence/`），每个 QA 场景的命令、输出摘录、断言结果写入该文件。
- **Electron 升级专项（Wave 5）：** 无头环境无法跑 GUI → typecheck + build + `node out/main/index.js --mcp` 启动冒烟 + 打包检查 + 手动清单（写入 QA 记录标注手动项）。

## Execution strategy

### Parallel execution waves

| Wave | 版本 | Todos | 主题 |
|------|------|-------|------|
| Wave 1 | v1.7.0 | 1-5 | 备份修复 + 记忆智能审查加固 + UI 接入 |
| Wave 2 | v1.7.1 | 6-8 | 性能：索引 / 分页收尾 / 向量 |
| Wave 3 | v1.7.1 | 9-11 | 安全：输入验证 / SQL 白名单 / execSync |
| Wave 4 | v1.7.2 | 12-14 | 工程化：lint / 组件拆分 / 版本一致性 |
| Wave 5 | v1.7.2 | 15-16 | Electron 43 升级 + 冒烟 |
| Wave 6 | v1.8.0 | 17-19 | 文档与社区 |

### Dependency matrix (无循环)

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 备份Bug修复 | — | 2 | 3,4,5 |
| 2 备份加密审计 | 1 | — | 3,4,5 |
| 3 记忆机制统一 | — | 4,5 | 1,2 |
| 4 分层审查 | 3（机制统一先定） | 5 | 1,2 |
| 5 画像审查+UI接入 | 3,4（UI 展示依赖机制定稿） | — | 1,2 |
| 6 DB索引 | — | 7 | 8,9,10,11 |
| 7 分页收尾 | 6 | — | 8,9,10,11 |
| 8 向量优化 | — | — | 6,7,9,10,11 |
| 9 输入验证 | — | 10（共用 validation 约定） | 6,7,8,11 |
| 10 SQL白名单 | 9 | — | 6,7,8,11 |
| 11 execSync加固 | — | — | 6,7,8,9,10 |
| 12 ESLint+CI | — | 13（lint 基线）、14 | — |
| 13 组件拆分 | 12 | 14 | — |
| 14 版本一致性 | 13（避免拆分后版本文件冲突） | — | 12 |
| 15 Electron升级 | 12,13 | 16 | 14 |
| 16 冒烟+safeStorage | 15 | — | 14 |
| 17 MCP文档 | —（建议 10 后） | 18 | 19 |
| 18 贡献指南 | — | — | 17,19 |
| 19 快速教程 | 3,4,5（记忆功能演示） | — | 17,18 |

> 行号引用以本计划探索时为基准，执行时若文件已变化以实际内容为准（Metis M-*：行号会过期）。

## Todos

> Implementation + Test = ONE todo. Never separate.

- [ ] 1. 修复备份路径 Bug + BackupService 注入化（TDD）
  What to do / Must NOT do: 修改 `src/main/backup.ts` 的 `getDbPath()`（当前 line 80 返回 `join(app.getPath('userData'), 'memora.db')`），改为与 `src/database/connection.ts:17` 一致的 `join(app.getPath('userData'), 'data', 'Memora.db')`；`backupDir` 与 dbPath 提升为构造函数注入参数（`constructor(options?: { backupDir?: string; dbPath?: string })`），默认值保持现有行为；`require('fs')`（lines 156-158 / 220-229 / 262）全部改为顶部 `import`。Must NOT: 不改动备份文件格式、不改 IPC 通道、不改 restore 流程语义。TDD：新建 `test/unit/backup.test.ts` + `test/helpers/db.ts`（`vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))` + `initDatabase(临时文件)` + 每条测试后 `closeDatabase()` + 清理临时目录）。
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2
  References: `src/main/backup.ts:60-81`（class 与 getDbPath）、`src/database/connection.ts:11-21`（真实路径与 initDatabase 注入）、`src/main/backup.ts:351`（单例导出）、`vitest.config.ts`（别名 @main 已配）
  Acceptance criteria (agent-executable): `npm test` 通过且 backup.test.ts 断言：①注入临时目录时 backupNow() 生成 `Memora_backup_*.db.zip` 且文件存在；②restoreBackup 后 DB 可被 initDatabase 打开且 integrity_check = ok；③默认构造时 getDbPath 与 connection 实际 DB 路径一致（mock app.getPath 后比较 `userData/data/Memora.db`）。
  QA scenarios: happy — `npx vitest run test/unit/backup.test.ts` 断言 3 条全过，Evidence task-1；failure — 构造注入不存在的 dbPath 调用 backupNow()，断言抛出"数据库文件不存在"且无 zip 残留。
  Commit: Y | fix(backup): 修复备份路径与数据库路径不一致并注入化以便测试

- [ ] 2. 备份加密审计：PBKDF2 提升 + 格式版本标记 + 回归测试（向后兼容硬要求）
  What to do / Must NOT do: `src/main/backup.ts:49` `PBKDF2_ITERATIONS` 100_000 → 310_000（OWASP 2023）；**新增文件头版本标记**：加密文件头从 [salt(16)+iv(12)] 改为 [magic 'MBK1'(4B) + version u8(1B) + salt(16) + iv(12)]；version=2 → 310k 迭代；读取时：文件头 magic 匹配 → 按 version 选择迭代数；无 magic（旧格式）→ 按 100k 迭代兼容读取（旧备份仍可恢复——硬要求）。普通 .db.zip 文件可不动（或加相同 magic，二者择一，解密路径必须兼容旧格式）。Must NOT: 不改变 deriveKey 算法（PBKDF2-SHA256）、不改变 GCM 布局（tag 16B 尾部）、不破坏旧备份恢复。TDD：加密往返测试（setConfig 注入 encryptionKey → backupNow → restoreBackup 正确密码成功、错误密码抛错）+ 旧格式 fixture 恢复测试（手工构造 100k 无 magic 文件验证兼容）。
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: —
  References: `src/main/backup.ts:45-58`（常量与 deriveKey）、`:135-158`（加密写入头）、`:204-258`（解密读取头）
  Acceptance criteria (agent-executable): `npm test` 通过；断言 PBKDF2_ITERATIONS === 310000；新格式加密备份 restore 往返成功；错误密码抛错且无 .restore.tmp 残留；**旧格式（100k、无 magic）fixture 恢复成功**。
  QA scenarios: happy — 加密往返 + 旧格式 fixture 恢复，Evidence task-2；failure — 错误密码抛错、tmp 清理。
  Commit: Y | security(backup): PBKDF2 310k + 加密格式版本标记（向后兼容）

- [ ] 3. 记忆生命周期统一与加固（v1.7.0 审查 — 已实现代码，非新建）
  What to do / Must NOT do: 审查 `src/main/memoryLifecycle.ts`（283 行，已实现）并修复：①**两套衰减并存**——`preferencesRepo.decayConfidence`（线性 -0.1/30天，启动时 `main/index.ts:207` 调用 + MCP `server.ts:49` + IPC `preferences.ipc.ts:67`）与 memoryLifecycle 的艾宾浩斯曲线（R=e^(-t/S)，S 按 accessCount 分档）+ `runMemoryLifecycle`（strength<0.1 归档）——统一：以艾宾浩斯曲线为唯一衰减语义，`runMemoryLifecycle` 为唯一维护入口（启动扫描与 MCP 调用都收敛到它），`decayConfidence` 保留为启动兼容入口但其内部改为调用统一逻辑或标记 deprecated（二选一，执行时定，测试覆盖新语义）；②修复 `runMemoryLifecycle` 统计缺陷（lines 246-273：promoted/demoted 基于 touch 前状态计算且条件与 classifyMemoryTier 矛盾——working 定义 strength<0.3 却判断 working 且 strength>0.3；改为 touch 后重新分类再统计）；③`memoryStrength` 中 `pref.confidence * 0.5 + retention * 0.3 + accessBonus` 权重合理性审查（保留，仅注释说明）。Must NOT: 不重写正确行为（ebbinghausRetention 公式不动）、不改 schema、不物理删除数据（归档是软删除）。新增 `test/unit/memoryLifecycle.test.ts`（纯函数 + 内存 DB）：①ebbinghausRetention 数值断言（S=1/6/30/90/180 分档 + t=0 → 1.0）；②衰减到 strength<0.1 → status 变 archived；③runMemoryLifecycle 返回统计（archived/promoted/demoted）与 touch 后状态一致；④decayConfidence 与 runMemoryLifecycle 行为等价（统一后同一断言）。
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 5
  References: `src/main/memoryLifecycle.ts:1-283`（全文，重点 25-31 getStabilityFactor、39-59 ebbinghausRetention/memoryStrength、232-283 runMemoryLifecycle）、`src/database/repositories/preferencesRepo.ts:236-285`（decayConfidence）、`src/main/index.ts:207`（启动调用）、`src/mcp/server.ts:49`（MCP 调用）
  Acceptance criteria (agent-executable): 新增 memoryLifecycle.test.ts 全过；`npm run typecheck`；grep 确认 `main/index.ts` 与 `mcp/server.ts` 的衰减调用已收敛到统一入口（或 decayConfidence 显式 deprecated 标注）；runMemoryLifecycle 统计修复后 promoted/demoted 与实际层级变化一致。
  QA scenarios: happy — 单测全过，Evidence task-3；failure — 空库/无实体时启动扫描不抛错（try/catch 空操作）。
  Commit: Y | fix(memory): 统一两套衰减机制并修复 runMemoryLifecycle 统计缺陷

- [ ] 4. 分层记忆模型审查 + 测试（v1.7.0 审查 — 已实现）
  What to do / Must NOT do: 审查 `classifyMemoryTier`（memoryLifecycle.ts:78-92）与 `getTieredMemories`（95-105）：①边界审查——daysSinceCreated<7 && accessCount<2 → working 优先于 strength 判断，确认与 strength 阈值（<0.3 working / <0.6 short_term / ≥0.6 long_term）无矛盾（审查后保留或微调，需测试锁定行为）；②`getTieredMemories` 排序（strength 降序）稳定性确认（同 strength 时无稳定次序——补 tie-breaker：confidence 降序 + createdAt 升序，若审查认为必要）；③`estimatedRetentionDays = S * ln(1/0.37)` 正确性确认（≈S）。Must NOT: 不改 `MemoryTier` 类型（working/short_term/long_term）、不改 IPC 通道签名。新增测试（并入 memoryLifecycle.test.ts 或独立 `test/unit/memoryTier.test.ts`）：①新创建（<7 天、accessCount<2）→ working；②strength 0.3-0.6 → short_term；③≥0.6 → long_term；④同 strength 排序稳定（tie-breaker 断言）；⑤getTieredMemories 空库返回空数组不抛错。
  Parallelization: Wave 1 | Blocked by: 3 | Blocks: 5
  References: `src/main/memoryLifecycle.ts:78-105`（classifyMemoryTier/getTieredMemories）、`src/shared/types.ts:508-530`（MemoryTier/TieredMemory/MemoryHealth）
  Acceptance criteria (agent-executable): 测试 5 断言全过；`npm run typecheck`；若有行为调整需在 QA 记录中注明 diff。
  QA scenarios: happy — 单测通过，Evidence task-4；failure — 边界值（恰 7 天、恰 0.3/0.6）断言明确。
  Commit: Y | test(memory): 分层记忆边界与排序稳定性测试（+ 必要微调）

- [ ] 5. 深度画像审查 + PreferenceExplorer UI 接入（v1.7.0 收尾）
  What to do / Must NOT do: ①审查 `generateProfileSummary`（memoryLifecycle.ts:131-224）：确认文本摘要/高置信度/趋势检测逻辑，补测试（空库、单 subject、superseded 趋势、高置信度分组）；②**UI 接入**：`src/renderer/src/components/PreferenceExplorer/index.tsx`（500 行）消费已注册的 `IPC.MEMORY_HEALTH` / `IPC.MEMORY_TIERED` / `IPC.MEMORY_PROFILE_SUMMARY`（preload 若未暴露则加 3 行透传——核对 `src/preload/index.ts` 的 memory 命名空间，可能已暴露）；在现有页面上增加展示区块（记忆健康评分/分层分布/画像摘要），复用现有卡片样式组件，不新建页面。Must NOT: 不新建 IPC 通道、不新增 MCP 工具、不改 `memory_profile` MCP 工具返回结构、不重设计视觉（复用 PreferenceExplorer 现有样式）、不做 LLM 调用（generateProfileSummary 是规则模板，不含 LLM——若审查发现需 LLM 增强则记为远期项不做）。测试：generateProfileSummary 纯函数单测（mock preferences）；UI 接入以 typecheck + build + F3 手动 QA 验证。
  Parallelization: Wave 1 | Blocked by: 3, 4 | Blocks: —
  References: `src/main/memoryLifecycle.ts:131-224`（generateProfileSummary）、`src/main/ipc/handlers/memoryLifecycle.ipc.ts:21-37`（已注册通道）、`src/preload/index.ts`（memory 命名空间，核对 MEMORY_* 是否已暴露）、`src/renderer/src/components/PreferenceExplorer/index.tsx`（接入点）
  Acceptance criteria (agent-executable): generateProfileSummary 单测全过；preload 已暴露或新增 MEMORY_* 3 通道透传（diff 显示）；`npm run typecheck` + `npm run build` 通过；PreferenceExplorer 中新增区块引用 IPC 常量（grep 验证）。
  QA scenarios: happy — 单测 + typecheck + build，Evidence task-5；failure — preload 未暴露时构建报错 → 补透传后重试。
  Commit: Y | feat(ui): PreferenceExplorer 接入记忆健康/分层/画像（复用现有通道）

- [ ] 6. DB 复合索引优化（v1.7.1 P1 — 真实列名）
  What to do / Must NOT do: 在 `src/database/migrations.ts` 追加 **version 8** 迁移（单向、事务包裹、幂等，与现有 3-7 模式一致）：①`messages(session_id, created_at)`（会话内消息排序查询）；②`chat_sessions(updated_at)`（会话按更新时间排序）；③`knowledge_entries(workspace_id, type)`（listEntries 按工作区+类型过滤）；④`preferences(workspace_id, status)`（listPreferences 过滤）。**注意**：`chat_sessions` 无 `workspace_id` 列（只有 folder_id，经 folders 关联）——不要建不存在的列索引；`messages` 非 `chat_messages`。Must NOT: 不删除已有索引、不修改任何查询语句（纯索引层）、不添加下迁移（migrations 为 append-only 单向，Metis C10：验收不要求可回滚，改为"迁移失败事务回滚不破坏 DB"）。新增 `test/unit/migrations.test.ts`：①临时 DB 连续跑两次 runMigrations 不报错（幂等，v8 只应用一次）；②`EXPLAIN QUERY PLAN` 验证四类查询使用新索引（`USING INDEX` 出现）；③迁移中途失败（mock 抛错）时 schema_version 不写入 v8 且 DB 可继续打开。
  Parallelization: Wave 2 | Blocked by: — | Blocks: 7
  References: `src/database/migrations.ts:24-55`（迁移数组与事务模式）、`:348-367`（runMigrations）、`src/database/schema.ts`（现有索引：messages:64、chat_sessions:47-51、knowledge_entries:147-149、preferences:188-191）
  Acceptance criteria (agent-executable): migrations.test.ts 3 断言全过；`npm run benchmark` 不比基线差；`npm run typecheck`。
  QA scenarios: happy — 单测 + benchmark，Evidence task-6；failure — 对不存在表/列建索引报错 → 断言错误信息明确且 DB 未损坏。
  Commit: Y | perf(db): v8 复合索引（messages/chat_sessions/knowledge_entries/preferences）

- [ ] 7. 列表分页收尾 + 图谱上限（v1.7.1 P1 延伸 — repo 层已完成）
  What to do / Must NOT do: 核实 repo 层已完成：`listEntries`（knowledgeRepo.ts:108-115）与 `listPreferences`（preferencesRepo.ts:144-150）已支持 limit/offset（默认 1000）。剩余工作：①IPC 层透传——`knowledge.ipc.ts:48`（KNOWLEDGE_LIST）与 `preferences.ipc.ts` 的 list 通道确认 options 完整透传 limit/offset；②渲染层增量加载——`Knowledge/index.tsx` 与 `PreferenceExplorer/index.tsx` 滚动触底加载下一页（维护 hasMore，默认页 50，上限 500）；③图谱上限——`knowledgeRepo.ts` 图谱查询（探索确认 limit 10000）改为 500 渲染上限 + 提示文案。Must NOT: 不改 repo 层默认 limit（1000 保持兼容，渲染层显式传页大小）、不改搜索路径（searchEntries 分页保持现状）、不改变现有调用方行为。新增 `test/unit/pagination.test.ts`（IPC 层 mock 透传 + repo 层边界：offset 越界返回空、limit 0/负数钳制——若 repo 层无钳制则补上）。
  Parallelization: Wave 2 | Blocked by: 6 | Blocks: —
  References: `src/database/repositories/knowledgeRepo.ts:108-115`（listEntries）、`src/database/repositories/preferencesRepo.ts:144-150`（listPreferences）、`src/main/ipc/handlers/knowledge.ipc.ts:47-50`、`src/renderer/src/components/Knowledge/index.tsx`、`src/renderer/src/components/PreferenceExplorer/index.tsx`
  Acceptance criteria (agent-executable): pagination.test.ts 全过；typecheck + build 通过；grep 确认渲染层调用含 limit/offset 参数与 hasMore 状态。
  QA scenarios: happy — 单测 + typecheck + build，Evidence task-7；failure — 越界/非法参数返回空数组或钳制值，不抛错。
  Commit: Y | perf(list): IPC 透传分页 + 渲染层增量加载 + 图谱上限 500

- [ ] 8. 向量搜索优化（v1.7.1 P3 — 缓存键修正）
  What to do / Must NOT do: `src/search/semantic.ts`：①**内存 LRU 缓存**：key = (provider, model, text-hash)，value = embedding——纯内存（不落库），容量上限 1000，解决同批重复文本重复调用 API；②分块计算：大批量查询按 ≤50 条/块分批；③维度校验保留（写入前断言 dim 与模型一致）。Must NOT: **不改 embeddingRepo 的 message_id 语义**（`message_embeddings` 表按 message_id 去重，`getMessagesWithoutEmbeddings` 已实现增量补齐——不新增 text-hash 列，Metis C7：缓存与 DB 表结构不冲突，缓存只在内存）；不改 embedding 模型配置协议；不改语义检索返回结构。新增 `test/unit/semantic.test.ts`（mock embedder）：①同文本第二次查询不重复调用 embed API（调用计数 = 1）；②51 条消息分块后块数 = ceil(51/50) = 2；③维度不符的向量写入被拒。
  Parallelization: Wave 2 | Blocked by: — | Blocks: —
  References: `src/search/semantic.ts`（检索实现）、`src/database/repositories/embeddingRepo.ts:1-165`（message_id 语义，全文）、`src/search/semantic.worker.ts`（worker 边界）
  Acceptance criteria (agent-executable): semantic.test.ts 3 断言全过；typecheck；LRU 容量超限时最旧条目被淘汰（测试断言）。
  QA scenarios: happy — 单测通过，Evidence task-8；failure — embed API 抛错时返回空结果不崩溃、缓存不清脏。
  Commit: Y | perf(search): 内存 LRU 缓存 + 分块计算 + 维度校验

- [ ] 9. 输入验证层（v1.7.1 P2 — 接入点修正）
  What to do / Must NOT do: 新增 `src/shared/validation.ts`（纯函数，无依赖）：字符串长度上限（title ≤ 500、content ≤ 200_000、provider/model ≤ 100）、类型断言、格式校验（id 正则、ISO 时间戳）；**新建共享 `src/main/ipc/safeHandle.ts`**：把 11 个 handler 文件各自复制粘贴的局部 safeHandle（探索确认：ai.ipc.ts:16 / bgImport.ipc.ts:6 / import.ipc.ts:9 / memoryLifecycle.ipc.ts:10 / knowledge.ipc.ts:22 / search.ipc.ts:7 / preferences.ipc.ts:18 / session.ipc.ts:18 / sharing.ipc.ts:7 / system.ipc.ts:10 / workspace.ipc.ts:17 各一份）抽取为共享模块，逐文件替换为 import，并在共享 safeHandle 中加可选校验层（channel → validator 映射，未注册校验的通道直通）；MCP `server.ts` 每个工具的入参校验；导入器输出的 title/content 钳制。Must NOT: 不拒绝合法长内容（超长截断+警告）、不改 IPC/MCP 协议签名、校验错误统一抛 `ValidationError`（code/message）。新增 `test/unit/validation.test.ts`：①超长 title 截断到 500 附 warning；②类型错误抛 ValidationError；③非法 id 格式被拒；④空串/null/undefined 边界 20 用例。
  Parallelization: Wave 3 | Blocked by: — | Blocks: 10
  References: `src/mcp/server.ts`（工具分发处）、11 个 `src/main/ipc/handlers/*.ipc.ts`（各自 safeHandle）、`src/importer/service.ts`（导入钳制点）、`src/shared/types.ts`
  Acceptance criteria (agent-executable): validation.test.ts 全过；grep 确认 11 个 handler 文件不再含重复 safeHandle 定义（已 import 共享模块）；typecheck + MCP 冒烟（`node out/main/index.js --mcp` 发送超长 title 的 add_session 收到截断结果而非崩溃）。
  QA scenarios: happy — 单测 + MCP 冒烟，Evidence task-9；failure — 10MB 恶意 content 不 OOM（截断路径）。
  Commit: Y | security(validation): 统一输入验证层 + 共享 safeHandle 抽取

- [ ] 10. SQL 运行时列名白名单统一（v1.7.1 P2 延伸）
  What to do / Must NOT do: 新增共享辅助 `src/database/repositories/updateHelpers.ts`：`buildUpdateSets(patch, columnMap)` —— columnMap 为运行时显式映射（拒绝未列出键），返回 `{ sets, params }`；将 5 个 repo 的动态 UPDATE（workspaceRepo.ts:92 / folderRepo.ts:116 / knowledgeRepo.ts:221 / preferencesRepo.ts:199 / sessionRepo.ts:287）全部替换；`system.ipc.ts:192-202` insertRow 保留 ALLOWED_TABLES + colNameRe 并补防御测试。Must NOT: 不改变更新行为语义（同一 patch 产生同一 SQL）；不引入第三方库；columnMap 逐列核对现有映射（含 snake_case：sortOrder→sort_order 等）。新增 `test/unit/updateHelpers.test.ts`：①白名单键生成正确 SET 片段；②未列出键被静默忽略+日志（与现有行为一致）；③5 个 repo 各 1 条更新冒烟测试；④恶意键（`title = 1`）不改变 SQL 结构。
  Parallelization: Wave 3 | Blocked by: 9 | Blocks: —
  References: `src/database/repositories/workspaceRepo.ts:61-93`、`folderRepo.ts:89-117`、`knowledgeRepo.ts:189-222`、`preferencesRepo.ts:184-200`、`sessionRepo.ts:260-288`、`src/main/ipc/handlers/system.ipc.ts:192-202`
  Acceptance criteria (agent-executable): updateHelpers.test.ts 全过；`npm test` 全绿（含既有 5 测试）；非法列名断言 SQL 中不出现该列名。
  QA scenarios: happy — 单测全绿，Evidence task-10；failure — 非法列名注入断言拒绝。
  Commit: Y | security(sql): 统一运行时列名白名单映射

- [ ] 11. appDetector execSync 加固（v1.7.1 P2 延伸 — API 修正）
  What to do / Must NOT do: `src/importer/appDetector.ts:42-50` `hasCommand` 当前用 `execSync(`${tool} ${cmd}`, { stdio: 'ignore', timeout: 3000 })`（tool = 'where'/'which'，cmd 为静态命令）。**修正为 `execFileSync(tool, [cmd], { stdio: 'ignore', timeout: 3000 })`**——execFileSync 不经过 shell 解释，消除字符串拼接风险（Metis C8：execSync 的 shell 选项默认开启，'shell:false' 表述错误——直接换 execFileSync 更优）；命令白名单常量（当前探测集合：claude/codex/opencode + 未来新增须入白名单）；失败路径统一返回 false + logger.debug。Must NOT: 不新增探测命令；不改检测语义（返回值与现有一致）。新增 `test/unit/appDetector.test.ts`（vi.mock child_process）：①断言调用 execFileSync 且参数为 (tool, [cmd])；②白名单外命令直接返回 false 不执行；③execFileSync 抛错返回 false 不崩溃。
  Parallelization: Wave 3 | Blocked by: — | Blocks: —
  References: `src/importer/appDetector.ts:14,41-50`（execSync 用法）、`src/main/logger.ts`
  Acceptance criteria (agent-executable): appDetector.test.ts 3 断言全过；typecheck；grep 确认无残留 execSync。
  QA scenarios: happy — 单测通过，Evidence task-11；failure — mock 抛 ENOENT，hasCommand 返回 false 且应用不崩溃。
  Commit: Y | security(appDetector): execFileSync 化 + 命令白名单

- [ ] 12. ESLint 9 + Prettier 引入与 CI 门禁
  What to do / Must NOT do: 新增 `eslint.config.js`（ESLint 9 flat config + typescript-eslint recommended + react-hooks + prettier）与 `.prettierrc`（单引号、无分号、trailing comma——与现有代码风格核对后定）；`package.json` 加 `lint`/`lint:fix` 脚本；`.github/workflows/ci.yml` 加 lint 步骤（typecheck 之后）。**存量策略（Metis M-* 矛盾修正）**：一次性修复存量 lint **错误**（自动修复优先，手动仅限安全规则如 no-eval）；**不强制 prettier 格式化历史代码**（.prettierignore 排除 dist/out；存量文件只在修改时顺带格式化）。Must NOT: 不启用激进自定义规则（仅 recommended 级）；不因格式化造成大 diff。
  Parallelization: Wave 4 | Blocked by: — | Blocks: 13
  References: `package.json:11-25`（scripts）、`.github/workflows/ci.yml`（typecheck job）、`tsconfig.node.json`/`tsconfig.web.json`
  Acceptance criteria (agent-executable): `npm run lint` 退出码 0；`npm run lint:fix` 幂等（二次运行无 diff）；CI 文件含 lint 步骤。
  QA scenarios: happy — lint 0 error + CI 通过，Evidence task-12；failure — 故意引入 console.log 断言 lint 报错（门禁有效）。
  Commit: Y | chore(lint): 引入 ESLint 9 flat config + Prettier 与 CI 门禁

- [ ] 13. 大组件拆分（纯机械提取 — 范围修正含 PreferenceExplorer）
  What to do / Must NOT do: 按实际行数拆分，逐字节保持行为：①`Knowledge/index.tsx`（633 行）→ `KnowledgeCard.tsx`（348-460）、`EntryEditor.tsx`（462-633）、`FilterTabs.tsx`（175-181+243-265）、`SearchBar.tsx`（218-224 相关）；②`Sidebar/index.tsx`（566 行）→ `SearchBox.tsx`（410-565）；③`ChatViewer/index.tsx`（559 行）→ `MessageBubble.tsx`（514-559）；④**`PreferenceExplorer/index.tsx`（500 行，todo 5 UI 接入后继续增长）→ 拆分健康/画像展示区为独立子组件**。验收口径修正（Metis C6）：**拆出的新文件 <250 行**（各提取件实测：113/172/156/46 行均满足）；主文件保留组合逻辑不要求 <250。Must NOT: 不改 className/JSX/事件处理；不改 props 语义；不重排逻辑。拆分完成即 typecheck + build。
  Parallelization: Wave 4 | Blocked by: 12 | Blocks: 14
  References: `src/renderer/src/components/Knowledge/index.tsx:348-360`（KnowledgeCard props）、`:462-633`（EntryEditor）、`src/renderer/src/components/Sidebar/index.tsx:410-565`、`src/renderer/src/components/ChatViewer/index.tsx:514-559`、`src/renderer/src/components/PreferenceExplorer/index.tsx`
  Acceptance criteria (agent-executable): typecheck + build 通过；拆出的每个新文件行数 <250（wc -l 验证）；无残留死代码（tsc noUnusedLocals）；git diff -M 显示纯移动。
  QA scenarios: happy — typecheck + build + diff --stat 显示移动，Evidence task-13；failure — 引用丢失 typecheck 报错 → 逐文件回滚重试。
  Commit: Y | refactor(components): 拆分 Knowledge/Sidebar/ChatViewer/PreferenceExplorer（纯移动）

- [ ] 14. 版本一致性（README/CHANGELOG 对齐 + v1.7.0 bump）
  What to do / Must NOT do: ①README.md:13 徽章 version 1.5.0 → 1.6.1（与 package.json:3 对齐）；②CHANGELOG.md 补齐 1.6.0/1.6.1 条目（从 git log 提取实际变更，不臆造）；③Wave 1 完成后 bump 到 **1.7.0**（package.json + README + CHANGELOG + tag `v1.7.0`）——因记忆智能已实现，本次交付语义即 1.7.0 收尾；④版本 bump 约定：Wave 2+3 → v1.7.1、Wave 4+5 → v1.7.2、Wave 6 → v1.8.0（每版本组收尾提交时执行，见 Commit strategy）。Must NOT: 不臆造变更记录；版本 bump 不做进业务提交（独立收尾提交）。
  Parallelization: Wave 4 | Blocked by: 13 | Blocks: —
  References: `README.md:13`（徽章）、`CHANGELOG.md:5`、`package.json:3`、git log
  Acceptance criteria (agent-executable): grep 验证 README 徽章 = 1.6.1（本任务前）→ 1.7.0（Wave 1 收尾后）；CHANGELOG 存在 1.6.0/1.6.1/1.7.0 条目且与 git log 对应。
  QA scenarios: happy — 检查命令输出一致，Evidence task-14；failure — CHANGELOG 引用不存在提交 → 删除重写。
  Commit: Y | docs(changelog): 对齐版本至 1.6.1 并 bump v1.7.0

- [ ] 15. Electron 33.4.11 → 43.2.0 升级（含 Vite/Node 联动）
  What to do / Must NOT do: ①`package.json`：`electron` ^33.2.0 → ^43.2.0、`electron-vite` ^2.3.0 → ^5（**注意 v5 迁移：externalizeDepsPlugin 弃用 → build.externalizeDeps 默认开启；嵌套函数配置不再支持**，`electron.vite.config.ts` 需核对调整）、`vite` ^5.4.11 → ^7（electron-vite v5 peer 要求，Metis C4 + context7 官方文档确认 Node 20.19+/22.12+ 与 Vite v5.0+，执行时以 `npm info electron-vite@latest peerDependencies` 为准）、`better-sqlite3` ^11.7.0 → ^12.10.1；②`build.npmRebuild: false` → `true`（package.json:85，native ABI 重建，33→43 跨多个断裂点）；③README 环境要求 Node ≥18 → **≥20.19**（您已确认）；④CI 与 `npm ci` 流程验证 Electron 42+ 二进制下载；⑤`docs/AI_DEVELOPMENT.md` 漏洞披露更新为已升级；⑥Chromium 行为变更核对（window.open/剪贴板/dialog——Windows 影响小）。Must NOT: 不迁移 safeStorage async（todo 16）；不改业务代码逻辑（纯依赖+配置升级）；不夹带其他改动（单独提交可回滚）。
  Parallelization: Wave 5 | Blocked by: 12, 13 | Blocks: 16
  References: `package.json:34,36,40,45,85`、`electron.vite.config.ts`、`README.md`（环境要求）、`docs/AI_DEVELOPMENT.md`、context7 electron-vite 官方文档（v5.0.0 稳定版，Node 20.19+/22.12+）
  Acceptance criteria (agent-executable): `npm install` 成功；`npm ls electron` 显示 43.x；typecheck + build 通过；`node out/main/index.js --mcp` 启动响应；`npm run dist:win` 打包成功（或记录 CI 项）。
  QA scenarios: happy — build + MCP 冒烟通过，Evidence task-15；failure — better-sqlite3 ABI 报错 → 验证 npmRebuild 生效或 `npx @electron/rebuild`。
  Commit: Y | chore(deps): Electron 33→43 + electron-vite v5 + vite v7 + better-sqlite3 12

- [ ] 16. Electron 升级冒烟清单 + safeStorage async 迁移（可选）
  What to do / Must NOT do: ①冒烟清单 6 项并记录：IPC 代表性调用、safeStorage 加解密往返（secretStore.ts）、tray 创建、MCP 模式、拖拽导入路径解析（webUtils.getPathForFile）；②`src/main/secretStore.ts` safeStorage 同步 API → async（encryptStringAsync/decryptStringAsync，Electron 43 弃用警告）——若 async 不可用保持同步并记录 TODO；③启动日志无 Electron 弃用输出。Must NOT: 不扩展冒烟范围到 UI 交互（无头限制，UI 归 F3）。
  Parallelization: Wave 5 | Blocked by: 15 | Blocks: —
  References: `src/main/secretStore.ts:53-55,60-67`、`src/main/ipc/index.ts`、librarian 研究（safeStorage 43 弃用、webUtils/tray/dialog 无破坏）
  Acceptance criteria (agent-executable): `.omo/evidence/task-16-electron-smoke.txt` 含 6 项结果；secretStore 无 sync API 弃用警告（若迁移）；typecheck 通过。
  QA scenarios: happy — 6 项全过无弃用警告，Evidence task-16；failure — 无密钥环环境解密失败 → 记录环境限制标注手动项。
  Commit: Y/N | refactor(secretStore): safeStorage async 迁移（若完成）

- [ ] 17. MCP 工具 API 文档（v1.8.0 D1）
  What to do / Must NOT do: 新增 `docs/mcp-api.md`：25 工具逐一记录——用途、入参（名称/类型/必填/默认）、返回值、错误码、示例（JSON-RPC）；工具列表从 `src/mcp/server.ts` 注册表生成权威清单（README.md:299-328 为基准）；文档头注明生成日期与版本。Must NOT: 不写未经代码验证的参数；不复制 README 表格当文档。验收含核对脚本：文档工具名集合 === server.ts 注册集合。
  Parallelization: Wave 6 | Blocked by: —（建议 10 后） | Blocks: 18
  References: `src/mcp/server.ts`、`README.md:299-328`、`src/shared/types.ts`
  Acceptance criteria (agent-executable): 25 工具条目含参数表+示例；核对脚本输出 25/25 匹配。
  QA scenarios: happy — 脚本 25/25，Evidence task-17；failure — 缺工具/参数名不符 → 修正直至匹配。
  Commit: Y | docs(mcp): 25 个 MCP 工具 API 参考文档

- [ ] 18. 贡献指南 + Issue 模板（v1.8.0 D2）
  What to do / Must NOT do: 完善 `CONTRIBUTING.md`（开发环境搭建含 Node ≥20.19 更新、代码风格（Wave 12 lint 规则）、提交信息约定、测试要求、安全披露流程链接）；核对/完善 `.github/ISSUE_TEMPLATE/bug_report.md` 与 `feature_request.md`（版本号、复现步骤、日志位置）。Must NOT: 不编造流程（如 CI 未配置的步骤）；保持中文。
  Parallelization: Wave 6 | Blocked by: 17 | Blocks: —
  References: `CONTRIBUTING.md`、`.github/ISSUE_TEMPLATE/*.md`、`docs/AI_DEVELOPMENT.md`、`package.json:11-25`
  Acceptance criteria (agent-executable): 三文件存在含关键章节（环境/风格/测试/安全）；bug 模板含版本号与日志字段。
  QA scenarios: happy — grep 关键字段，Evidence task-18；failure — 字段与脚本名不符 → 修正。
  Commit: Y | docs(community): 贡献指南与 Issue 模板完善

- [ ] 19. 快速开始教程（v1.8.0 D3）
  What to do / Must NOT do: 新增 `docs/quickstart.md`：5 分钟路径——安装/构建（Node ≥20.19）→ 配置 AI 供应商 → 导入对话 → 蒸馏 → 查看记忆（偏好/知识/画像——**基于审查后的实际实现演示，标注 UI 接入后的新展示区**）→ 接入 MCP 客户端。配截图占位（同 README 风格）。Must NOT: 不写未实现功能；不复制 README 大段文字。
  Parallelization: Wave 6 | Blocked by: 3,4,5（记忆功能演示） | Blocks: —
  References: `README.md:88-103,393-410`、`docs/mcp-api.md`（task 17 产物）
  Acceptance criteria (agent-executable): 步骤按序可执行（每步命令/UI 路径）；含记忆功能章节；步骤数 ≤ 8。
  QA scenarios: happy — 通读按步骤执行到"查看画像"无缺步，Evidence task-19；failure — 引用已更名 UI → 修正为实际文案。
  Commit: Y | docs(quickstart): 5 分钟快速开始教程

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
  逐 todo 核对：References 是否全部落地（git diff 文件集匹配）、Acceptance criteria 是否全部满足（重跑 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build`）、无 Scope OUT 混入（grep 提交信息无 web-ui/coverage 门禁/新 IPC 通道/新 MCP 工具）。证据：`.omo/evidence/F1-compliance.txt`。
- [ ] F2. Code quality review
  独立代码审查（oracle 或资深审查代理）：重点 Wave 1（备份格式兼容、记忆机制统一正确性）、Wave 3（SQL 白名单、共享 safeHandle）、Wave 5（依赖升级）；检查无死代码、无行为回归、无未处理异常路径。证据：`.omo/evidence/F2-quality.txt`。
- [ ] F3. Real manual QA
  需真实 GUI 项清单（备份恢复流程、PreferenceExplorer 新展示区、分页滚动、Electron 升级后启动）：标注"需用户手动确认"并列出逐步操作+预期结果；无头项（MCP 冒烟、打包）由执行者完成。证据：`.omo/evidence/F3-manual-qa.txt`。
- [ ] F4. Scope fidelity
  对照 Scope IN/OUT：v1.7.0/1.7.1/1.7.2/1.8.0 四版本交付物齐全；Scope OUT 零违反（重点：无新 IPC 通道、无新 MCP 工具、无 Web UI、无覆盖率门禁）。证据：`.omo/evidence/F4-scope.txt`。

## Commit strategy

- **粒度**：每 todo 一个原子提交（实现 + 测试 + 文档），提交信息用 todo 的 Commit 行。
- **顺序**：严格按 Wave 顺序；Wave 内并行完成后按依赖顺序合入（rebase 线性历史或 squash merge）。
- **版本标记**：Wave 1 → v1.7.0（todo 14 内完成 bump+tag）；Wave 2+3 → v1.7.1；Wave 4+5 → v1.7.2；Wave 6 → v1.8.0。每次 bump 为独立收尾提交（package.json + README 徽章 + CHANGELOG + tag），不夹带业务改动。
- **禁入提交**：lint 未过、typecheck 未过、测试未过的代码不进提交；不提交 dist/out/build 产物。
- **Electron 升级（todo 15）单独提交**，不夹带业务改动，便于回滚。

## Success criteria

1. **v1.7.0 收尾**：备份恢复可用（Bug 修复 + 加密格式版本标记 + 旧备份兼容）；两套衰减统一为艾宾浩斯曲线且有测试锁定；runMemoryLifecycle 统计修复；PreferenceExplorer 展示健康/分层/画像（复用现有通道）；版本 bump v1.7.0。
2. **v1.7.1 性能与安全**：v8 复合索引生效（EXPLAIN 验证）；分页增量加载无卡顿、图谱 500 上限；向量 LRU 缓存命中可测；输入验证覆盖 IPC/MCP/导入器；SQL 动态拼接全部走白名单；execFileSync 化。
3. **v1.7.2 基础设施**：Electron 43.2.0 上线（无已知 EOL 漏洞）、Node ≥20.19 文档更新；lint 门禁 CI 全绿；组件拆分完成（新文件 <250 行）；版本号三处一致。
4. **v1.8.0 文档社区**：MCP API 文档 25/25 匹配；贡献指南与 Issue 模板可用；快速教程全步骤可执行。
5. **质量门禁**：typecheck / test / lint / build 四命令全绿；F1-F4 全部 APPROVE。
6. **无范围蔓延**：Scope OUT 零违反（无新 IPC 通道、无新 MCP 工具、无 Web UI、无覆盖率门禁、无架构重写）。
