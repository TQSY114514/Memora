# Changelog

本文件记录 Memora 的所有重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

#### 混合检索精排（Hybrid Retrieval + Reranker）
- **`src/search/hybridSearch.ts`**：将 FTS 关键词召回与向量语义召回真正融合，按加权公式（FTS 0.4 + Vector 0.3 + 时间衰减 0.15 + 图谱 boost + 收藏加成）综合排序
- **`src/search/reranker.ts`**：新增交叉编码器精排阶段，对融合后的 top-k 结果按 query 相似度重排，`rerank` 选项默认关闭，用户配置 embedding 后启用
- **`src/search/hybridSearch.ts`**：`computeGraphBoost` 改为基于真实表 `knowledge_entries` / `knowledge_relations` 计算图谱关联得分

#### 记忆合并语义增强（Memory Consolidation）
- **`src/memoryAgent/consolidation.ts`**：改进文本相似度算法（Jaccard + Overlap 加权），覆盖所有主题而非仅技术栈
- **`src/memoryAgent/consolidation.ts`**：新增可选向量语义相似合并路径（`useEmbedding`），仅当 active 条目数 > 100 时启用，避免隐式 API 成本
- 修复 SQL 列名 bug：`updatedAt` → `updated_at`、`workspaceId` → `workspace_id`

#### 身份画像 SQL 修复
- **`src/identity/*`**：修正宪法偏好查询条件（`status='constitution'` → `source='constitution' AND status='active'`），统一 `workspaceId` → `workspace_id` 列名

#### 本地 ONNX 嵌入模型（#15）
- 新增 `src/ai/localEmbedder.ts`：集成 `@huggingface/transformers`，支持在本地运行 ONNX 格式 embedding 模型，无需外部 API
- 三种预设模型：`all-MiniLM-L6-v2`（23MB/384维）、`multilingual-e5-small`（120MB/384维）、`bge-small-zh-v1.5`（50MB/512维）
- `AiConfig` 新增 `embeddingMode` 字段（`api` | `local`），`embedBatch` 路由 local 分支
- AI 配置 UI 新增嵌入模式切换器 + 本地模型选择器 + 模型状态/预加载
- 模型缓存到 `userData/models/`，首次使用时自动从 HuggingFace CDN 下载

#### 工程化三件套
- **commitlint + husky**：`commit-msg` 钩子校验 Conventional Commits，`pre-commit` 运行 typecheck
- **vitest coverage 门禁**：v8 provider，起步门槛 stmt/branch/line 15% + func 10%，CI 上传 coverage 报告
- **ESLint 9 flat config 迁移**：新增 `eslint.config.mjs`，删除 `.eslintrc.cjs`，统一 `typescript-eslint` 包，升级 `eslint-plugin-react-hooks` v5

### Changed
- `package.json`：`overrides` 强制升级 sharp 修复 audit 漏洞，`asarUnpack` 包含 onnxruntime/sharp 原生模块
- 退出时 best-effort 释放本地嵌入模型资源

### Changed
- 新增 `src/importer/common.ts` 公共助手，统一 8+ 个导入器的角色归一化、时间戳转换、标题回退、文本片段提取与 JSON 解析，删除各导入器内的重复实现（chatgpt/claude/cursor/deepseek/gemini/grok/json/kimi/markdown/qwen/localExtractor）
- 标题截断改为按码点进行，避免切断 emoji；JSON 导入器 `function` 角色统一归一到 `tool`
- 收窄 `import.ipc.ts` / `mcp/tools/sessions.ts` 的 `any` 类型，`updateSession` 的 `folderId` 明确支持 `null`（移出文件夹）
- `postcss.config.js` 改为 `postcss.config.cjs`，消除 vitest 的 MODULE_TYPELESS_PACKAGE_JSON 警告

## [1.12.0] - 2026-08-02

### 定位升级

从「功能堆叠」转向「核心故事」：强化 Killer Features，打磨 README 叙事，回答「为什么不用 ChatGPT Memory / Mem0」。

### Added

#### AI 身份画像（AI Identity Profile）
- **`src/identity/identityProfile.ts`**：一键生成完整 AI 人格画像，聚合偏好、知识、项目上下文
- **`IdentityProfile` UI 面板**：分类标签展示（编程/工具/沟通/项目/禁忌）、可复制 prompt 文本
- 传播卖点：「换 AI，不换人设」——一键导入 Claude Code / OpenCode / Cursor / AstrBot

#### MCP 高级工具（+3 个，共 30 个）
- `memory_explain`：解释为何返回某条记忆（置信度/来源/访问频率）
- `memory_timeline`：用户偏好演变时间线（含历史趋势）
- `memory_diff`：对比过去与现在的偏好变化（added/removed/modified）

#### 记忆安全中心（Memory Security Center）
- **`src/security/securityCenter.ts`**：加密状态检查、敏感信息扫描（API Key / Token / 邮箱 / 手机号）
- **`SecurityCenter` UI 面板**：安全评分、加密状态、敏感信息统计（脱敏展示）、智能建议

#### README 重写
- 从「我有什么功能」→「我解决什么痛苦」
- 新增 ChatGPT Memory / Mem0 / Memora 三方对比表
- 强化核心叙事：Your AI remembers you forever. Switch models, keep yourself.

### Changed
- 版本号 1.9.0 → 1.12.0
- MCP server 注释统一为 30 个工具（v1.12）

## [1.11.0] - 2026-08-02

### Added

#### 端到端加密云端同步（#11）
- **`src/crypto/e2e.ts`**：AES-256-GCM 加密 + PBKDF2 密钥派生，零知识加密
- **`src/sync/cloudSync.ts`**：WebDAV / S3 双协议支持，数据本地加密后上传
- **`CloudSync` UI 面板**：配置同步参数、测试连接、一键同步

#### 团队记忆共享（#12）
- **`src/team/teamWorkspace.ts`**：协作工作区、邀请码、记忆可见性控制（private / shared_read / shared_write / shared_admin）
- **`TeamWorkspace` UI 面板**：创建/加入工作区、评论系统（支持回复 + 解决）

#### 记忆时间胶囊（#13）
- **`src/capsule/timeCapsule.ts`**：封存知识 + 偏好，设定未来解锁时间，解锁时生成对比报告
- **`TimeCapsule` UI 面板**：创建胶囊、列表管理、密码解锁

#### 记忆模板市场（#14）
- **`src/templates/templateMarket.ts`**：内置开发者/学生/研究者/创作者 4 套专家记忆包
- **`TemplateMarket` UI 面板**：浏览模板、分类筛选、搜索、导入/导出

#### AI 迁移向导（#15）
- **`src/migration/migrationWizard.ts`**：平台检测、三步迁移流程（检测→选择→迁移）
- **`MigrationWizard` UI 面板**：可视化迁移进度、支持多平台同时迁移

#### OpenCode 导入支持
- `localExtractor.ts`：递归扫描 `~/.opencode/` JSON 文件，处理多种格式

#### 通用 JSON 导出格式
- **`src/sharing/jsonExporter.ts`**：OpenAI Chat Completions 兼容格式，可导入 OpenCode 等工具

### Fixed
- 导入完成后不再弹出红色错误通知（跳过对话时静默退出）
- 导入窗口完成后自动关闭

## [1.10.0] - 2026-08-02

### Added

#### 记忆版本控制 — Git for Memory（#7）
- **`src/database/repositories/auditRepo.ts`**：基于审计日志的版本历史检索 + diff 计算
- **`src/database/repositories/rollbackRepo.ts`**：实体回滚功能
- **`VersionHistory` UI 面板**：浏览实体变更历史、查看 diff、一键回滚

#### MCP 工具权限系统（#8）
- **`src/database/repositories/mcpPermissionsRepo.ts`**：客户端粒度的数据库权限存储
- **`src/mcp/accessControl.ts`**：数据库权限优先 + 环境变量回退
- **`McpPermissions` UI 面板**：按客户端管理读写/破坏性权限

#### 记忆智能体 — Memory Agent（#9）
- **`src/memoryAgent/index.ts`**：定期扫描记忆库、知识缺口检测、间隔重复复习提醒
- **`MemoryAgent` UI 面板**：监控智能体状态、查看知识缺口、管理复习队列

#### 交互式知识图谱（#10）
- **`KnowledgeGraph.tsx`** 升级：力导向布局、节点拖拽、展开/折叠、时间范围筛选
- 纯 SVG + TypeScript 实现，零新增依赖

### Changed
- MCP 工具数从 25 个扩展到 27 个
- 测试数从 274 增至 281

## [1.9.0] - 2026-08-02

### Added

#### 记忆审计日志（#1）
- 每次记忆变更（创建/更新/删除/冲突）记录审计日志，含变更前后值、来源对话、时间戳
- `audit_logs` 表 + `auditRepo.ts` 数据访问层

#### 冲突解决人机协同（#2）
- 检测到偏好冲突时弹窗提示，让用户选择保留新/旧/合并，而非自动标记

#### AI 宪法 — Personal Constitution（#3）
- 新增"宪法"级别偏好/知识，所有 AI 通过 MCP 优先读取
- `memory_get_constitution` MCP 工具

#### 记忆健康仪表盘增强（#4）
- 展示总量/活跃/归档/冲突数、衰减趋势图、记忆体检报告（建议合并/清理）

#### 可定制蒸馏模板（#5）
- 用户自定义蒸馏格式（背景→方案→决策→理由），按项目设定不同策略
- `distillation_templates` 表 + UI 管理

#### MMF 导出格式（#6）
- 导出为 Memora Memory Format（MMF），包含偏好+知识+对话，可导入其他实例
- **`src/sharing/mmfExporter.ts`** + **`src/sharing/mmfImporter.ts`**

### Changed
- MCP 工具数从 17 扩展到 25（+8 个新工具）
- `audit_logs` 表新增 `memory_audit_log` MCP 工具

### Fixed
- `preferencesRepo.ts` createPreference 事务退出导致 null assertion 错误（高严重性）
- `localEmbedder.ts` worker 引用在错误后未置空（中严重性）
- `localEmbedder.ts` waitForWorkerReady 监听器泄漏（中严重性）

### Engineering
- 从 `schema.ts` 移除 `idx_pref_workspace_subject_context` 索引（引用 v9 迁移才添加的 context 列）
- 修复 better-sqlite3 二进制下载（SSL 证书 + Electron 版本匹配）

## [1.7.1] - 2026-08-01

### Added
- 索引优化 + LRU 缓存（`safeHandle` 共享 + SQL 白名单 + `execFileSync`）

### Fixed
- CI lint/typecheck 修复

## [1.7.0] - 2026-08-01

### Added

#### 仿生学遗忘机制
- 基于艾宾浩斯遗忘曲线 `R = e^(-t/S)` 的置信度衰减，S 随访问次数（1/6/30/90/180）动态增长
- 综合记忆强度 = confidence×0.5 + retention×0.3 + accessBonus×0.2

#### 分层记忆模型
- 三轨分类：working（strength<0.3）/ short_term（0.3-0.6）/ long_term（>0.6）
- `classifyMemoryTier` + `getTieredMemories` API

#### 深度用户画像
- subject 聚合 + 趋势检测 + 自然语言摘要生成

### Fixed
- 备份 Bug 修复 + 加密版本标记 + 记忆加固 + 记忆健康 UI

## [1.6.1] - 2026-08-01

### Added
- 全局结构化日志（`logger.ts`）
- 备份文件 AES-256-GCM 加密

## [1.6.0] - 2026-08-01

### Added
- 自动热备份（定时 + 手动）
- MCP 只读模式
- 偏好冲突检测（同 subject 不同 value → 旧记忆标记 superseded）
- 搜索增强

## [1.5.0] - 2026-07-31

### Added

#### MCP 工具大扩展（+8 个，共 25 个）
- `update_session` — 更新对话元数据（标题/描述/文件夹/收藏状态）
- `delete_session` — 删除对话（级联删除，不可恢复）
- `create_folder` — 在工作区创建文件夹（支持子文件夹）
- `list_folders` — 列出工作区文件夹结构
- `export_session` — 导出对话为 Markdown 格式
- `summarize_session` — 通过 MCP 触发 AI 总结生成
- `knowledge_entry_update` — 更新知识条目（标题/内容/类型/状态）
- `knowledge_entry_delete` — 删除知识条目

#### Import 系统增强
- 新增通用 HTML 导入器，支持解析 AI 对话导出 HTML 页面
- 导入扫描器扩展支持 `.html` / `.htm` 文件
- 平台分布统计：导入完成后显示各平台导入数量明细

#### UI 风格重构
- 全新色调系统：暖灰底 + 紫色强调色（亮色）/ 深紫灰底 + 淡紫强调色（暗色）
- 新增玻璃拟态面板（`glass-panel` 类）：backdrop-filter blur + 半透明背景
- 新增内容卡片（`content-card` 类）：柔和阴影 + 悬停抬升效果
- 输入框新增 focus 环形高亮（`focus:ring`）
- 统一圆角从 `rounded-md` 升级为 `rounded-lg`
- 阴影系统 CSS 变量化（`--shadow-sm/md/lg`）

### Changed

- 版本号 1.4.1 → 1.5.0
- MCP Server 版本更新至 1.5.0

## [1.4.1] - 2026-07-31

### Added

#### Memory Explain 溯源抽屉
- PreferenceExplorer 偏好卡片新增 🔍 溯源按钮，点击展示完整记忆溯源信息
- 显示基本信息（subject / value / confidence / status / source）、时间线（提取/更新/最后访问时间）、访问统计
- 若偏好来源于对话，显示来源对话标题、provider、创建时间，支持回溯到具体对话
- 状态变迁说明（生效中 / 已被取代 / 已归档）

#### Dashboard Memory 统计卡片
- 首页 Dashboard 新增 3 张统计卡片：偏好记忆数、决策数、任务数
- 后端 `stats:get` IPC 新增 3 个全局计数查询（偏好仅统计 active 状态）

### Changed

#### README 强化叙事
- 新增「杀手级场景：换 AI，不换记忆」章节，突出 MCP 价值与 Agent Memory OS 定位
- AI 项目声明从首屏大段文字精简为一行警示 + 链接到 `docs/AI_DEVELOPMENT.md`
- 删除首屏视频引用链接

#### AI 开发声明独立文档
- 新增 `docs/AI_DEVELOPMENT.md`，详细说明 AI 生成代码的风险、已实施的安全加固措施、依赖漏洞情况
- README 首屏保留简短警示，详细披露移至独立文档，降低首屏可信度减分

## [1.4.0] - 2026-07-31

### 定位升级

从「Personal AI Knowledge Vault」升级为 **Agent Memory OS**——给 AI Agent 提供类人长期记忆的本地优先系统。

### Added

#### Memory Lifecycle 记忆生命周期
- **Preference 实体**：结构化用户偏好（subject + value + confidence + status），第四类一等公民实体
- **冲突检测**：同 subject 不同 value → 旧记忆自动标记 `superseded`，新记忆为 `active`
- **复现增强**：相同偏好再次出现时 confidence +0.15（最高 1.0）
- **置信度衰减**：超过 30 天未访问的偏好，启动时降低 0.1；低于 0.05 自动归档
- **软删除（遗忘）**：`archived` 状态保留审计痕迹，不物理删除
- **用户画像**：按类别分组的偏好聚合，MCP `memory_profile` 工具暴露给 AI

#### MCP 记忆工具（+4 个，共 17 个）
- `memory_profile`：返回用户全部偏好（按类别分组）
- `memory_save_preference`：保存用户偏好，自动检测冲突
- `memory_forget`：遗忘（软删除）偏好
- `preference_search`：FTS 搜索用户偏好

#### AI 蒸馏自动提取偏好
- 记忆蒸馏时 AI 自动识别用户偏好（如「喜欢初音未来」「用 VSCode」）
- 提取的偏好自动写入 preferences 表，confidence=0.6，source=conversation

#### PreferenceExplorer UI
- 偏好画像视图（按类别分组展示）
- 置信度可视化（颜色条：绿 >0.7 / 黄 >0.3 / 红 ≤0.3）
- 手动创建 / 编辑 / 归档 / 删除偏好
- 一键运行衰减操作
- FTS 搜索 + 状态筛选（全部 / 生效中 / 已取代 / 已归档）

### Changed

- **README 重写**：定位为 Agent Memory OS，添加 Before/After 对比、记忆生命周期图、Phase 4 路线图
- **MCP server version** 更新为 1.4.0

### Security（继承自 v1.3.1）

- Electron `sandbox: true` 沙箱模式
- Content-Security-Policy 头
- `unhandledRejection` / `uncaughtException` 全局异常处理器
- `SnippetRenderer` 替代 `dangerouslySetInnerHTML`

## [1.3.1] - 2026-07-31

### Security

- **Electron 沙箱模式**：渲染进程启用 `sandbox: true`，禁止直接访问 Node API
- **Content-Security-Policy**：设置 CSP 头限制资源加载（仅同源 + data: URI）
- **全局异常处理器**：注册 `unhandledRejection` / `uncaughtException` 防止进程静默崩溃
- **SnippetRenderer 安全组件**：替换 `dangerouslySetInnerHTML` 为安全的 React 组件解析 `<mark>` 标签

### Docs

- **README AI 项目声明**：坦诚声明 90%+ 代码由 AI 生成，未经人工安全审计
- **README 安全披露章节**：列出已知漏洞及修复状态，引导安全研究者私下报告

## [1.3.0] - 2026-07-31

聚焦「知识图谱可视化 + 安全加固 + 性能维护」：新增知识库图谱视图（纯 SVG 0 依赖），导入时自动脱敏 API Key/Token，数据库退出时自动 WAL 检查点，首页空状态引导。

### Added

#### 知识图谱可视化
- **`KnowledgeGraph.tsx`**（新组件）：纯 SVG 实现的知识图谱视图，0 新增依赖
  - 按 type 分三层同心圆环布局（知识最外圈 / 决策中圈 / 任务最内圈）
  - 显式关系实线 + 隐式关联（同源对话）虚线
  - 点击节点高亮关联边和邻居 + 底部详情面板（关联列表可点击跳转）
  - hover tooltip + 滚轮缩放 + 拖拽平移 + 缩放工具栏 + 图例
- **`getGraphData()` IPC**：一次性返回工作区所有节点 + 边（显式关系 + 隐式同源关联，每 session 最多 20 条边避免 O(n²) 爆炸）
- **Knowledge 面板视图切换**：📋 列表 / 🕸️ 图谱 segment 切换

#### 导入敏感信息清洗
- **`src/importer/sanitizer.ts`**（新模块）：导入前自动检测并脱敏 6 种凭证模式
  - OpenAI Key（sk-）/ Anthropic Key（sk-ant-）/ Google Key（AIza）/ GitHub Token（ghp_）/ Bearer Token / 通用 key=value
  - 替换为 `[REDACTED:类型]`，保留上下文
  - 保守匹配：特定前缀 + 足够长度，避免误伤正常技术讨论

#### 首页空状态引导
- **Dashboard 空状态 CTA**：无对话时显示「📥 开始导入」+「⚙️ 配置 AI」引导卡片，降低首次使用门槛

### Changed

#### 数据库自动维护
- **`connection.ts`**：启动时执行 `PRAGMA optimize`（SQLite 自动判断是否需要 ANALYZE）
- **`checkpointDatabase()`**：退出前执行 `wal_checkpoint(TRUNCATE)` + `PRAGMA optimize`，避免 WAL 文件膨胀导致下次启动变慢
- **`main/index.ts`**：`before-quit` 钩子接入 `checkpointDatabase()`，在 closeDatabase 之前执行

## [1.2.0] - 2026-07-31

从「固定 3 个供应商」升级为「无限供应商 + 多协议适配」：用户可自由新增/重命名/删除任意数量的 AI 供应商，每个供应商独立选择 API 协议风格（OpenAI 兼容 / Anthropic 原生 / Ollama 本地 / Google Gemini），配置完全隔离。

### Added

#### 无限供应商架构
- **动态供应商管理**：移除硬编码的 provider union 类型限制，改为字符串 ID + localStorage 持久化，支持任意数量供应商新增 / 删除 / 重命名
- **`AiApiStyle` 协议枚举**：`openai` / `anthropic` / `ollama` / `gemini` 四种 API 风格
- **`API_STYLE_META` 协议元信息表**：每种协议的 label / description / needsApiKey / defaultBaseUrl，UI 与路由共用
- **`AiConfig.label` 显示名字段**：与 provider ID 解耦，支持任意自定义名称

#### 多协议 API 客户端
- **`src/ai/apiClient.ts`**（新模块）：统一 `callChat` / `embedQuery` 入口，根据 `apiStyle` 路由到协议专属实现
  - `callChatOpenai`：`/chat/completions` + Bearer 鉴权 + `max_tokens` 字段
  - `callChatAnthropic`：`/v1/messages` + `x-api-key` + `anthropic-version: 2023-06-01` + `max_tokens` 必填
  - `callChatOllama`：`/api/chat` 无鉴权 + options 解析
  - `callChatGemini`：`/v1beta/models/{model}:generateContent?key=` + `contents` 数组结构
  - `embedQueryOpenai/Anthropic/Ollama/Gemini`：对应 embeddings 端点
  - 内置 3 次重试 + 指数退避
- **`src/shared/math.ts`**（新模块）：`cosineSimilarity` 向量余弦相似度，与 protocol 无关

#### UI 重构
- **AiSettings 左侧供应商列表**：显示所有已配置供应商 + ✓ 已配置徽章 + 协议小字说明
- **「+ 新增供应商」按钮**：底部虚线按钮，点击弹出新增对话框（输入名称 + 选择协议）
- **右侧配置面板**：供应商名称（可重命名）+ API 协议下拉 + baseUrl + apiKey（Ollama 隐藏）+ 对话模型 + 嵌入模型 + 维度
- **测试连接**：调用 main 进程统一走 `apiClient` 路由，同时测 chat + embeddings，chat 成功即算可用
- **删除/重命名**：每个供应商可独立重命名 / 删除（至少保留 1 个）

#### 主进程适配
- **`TEST_AI_CONNECTION` IPC**：v1.2 通过 `apiClient` 路由，根据 `apiStyle` 调用对应协议
- **`aiConfigFile.ts`**：持久化 `apiStyle` + `label` 字段
- **`secretStore.ts`**：动态加载所有已配置 provider 的 apiKey
- **`embedder.ts` / `summarizer.ts` / `projectMemory.ts` / `semantic.ts`**：统一重构为调用 `apiClient`，移除原 OpenAI 硬编码逻辑

#### Preload 类型扩展
- `testConnection` 参数增加 `apiStyle?: AiApiStyle`
- `saveConfigFile` 参数增加 `apiStyle?` + `label?`

### Changed

- **`AiConfig.provider`**：从 `'openai' | 'anthropic' | 'ollama'` union 类型改为 `string`，向后兼容
- **`aiConfigStore.ts`**：完全重写，新增 `addProvider` / `removeProvider` / `renameProvider` / `setProviderApiStyle` 方法，移除硬编码 `getProviderPresets`，改为动态构造
- **`APP_VERSION`**：1.1.0 → 1.2.0

### Migration

- 旧版 localStorage 中已有 `openai` / `anthropic` / `ollama` 三个 provider 的配置自动迁移：补全 `apiStyle` + `label` 字段
- 已加密的 apiKey 通过 `secretStore` 动态读取，无需重新输入

## [1.1.0] - 2026-07-31

从「AI 对话管理器」升级为「AI Knowledge Vault」：把决策 / 任务 / 知识从对话蒸馏的 JSON 数组提升为一等公民实体，可独立查询、关联、复用；MCP 同步增强，让外部 AI Agent 能直接读写知识库。

### Added

#### Knowledge Vault 数据层
- **`knowledge_entries` 表**：决策 / 任务 / 知识三类一等公民实体，独立于对话存在，带 status / source / sortOrder
- **`knowledge_fts` 虚拟表**：知识条目专用 FTS5 全文索引（中文分词），与对话搜索解耦
- **`knowledge_relations` 表**：轻量 Memory Graph 关系（supports / contradicts / derived-from / relates-to / decision-from-session）
- **`knowledgeRepo` 数据访问层**：CRUD + FTS 索引 + 关系统计，事务安全
- **数据库迁移 v5/v6**：幂等建表 + 旧 `session_summaries` 的 key_points/todos 回填为 knowledge_entries（decision/task），零数据丢失
- **`SessionSummary` 扩展**：新增 `knowledge`（蒸馏知识要点）+ `suggestedTags`（AI 建议标签，不自动应用）

#### Knowledge Vault IPC + Preload
- 13 个 `KNOWLEDGE_*` IPC 通道：list / get / create / update / delete / toggleTask / search / count / related / extractFromSession / relationAdd / relationRemove / relationList
- `extractFromSession` 幂等提炼：把对话蒸馏的 keyPoints→decision、todos→task、knowledge→knowledge，同 session+title+type 不重复插入
- Preload 暴露完整 `window.Memora.knowledge.*` API

#### Knowledge Vault UI
- **知识库面板**（侧边栏 📚 入口）：工作区切换 + 类型筛选 Tab（全部/知识/决策/任务/待办）+ 统计计数 + FTS 搜索
- **知识卡片**：类型图标、来源徽章、状态徽章（任务待办/已完成、决策生效中/已废弃）、内容展开折叠、来源对话跳转
- **任务勾选**：卡片内一键切换任务完成状态，已完成自动半透明 + 删除线
- **新建/编辑弹层**：类型选择 + 标题 + 内容 + 状态（task: 待办/已完成，decision: 生效中/已废弃）
- **ChatViewer「📥 提炼到知识库」按钮**：在记忆蒸馏工具栏，一键把当前对话蒸馏提炼为知识库条目（幂等）
- 三语 i18n 同步（zh-CN / en / ja）

#### MCP 知识工具
- **`knowledge_search`**：FTS 搜索知识/决策/任务条目（支持中文）
- **`decision_search`**：专搜架构决策（type=decision）
- **`project_context`**：组装工作区项目上下文（近期决策 + 未完成任务 + 核心知识 + 统计摘要），让 AI 快速恢复项目状态
- **`memory_write` 扩展**：提供 workspaceId 时直接写入 knowledge_entries（type 可选 knowledge/decision/task）

### Changed

- **AI 蒸馏 Prompt 升级**：输出 JSON 增加 `knowledge` + `suggestedTags` 字段
- **knowledge.md 生成**：新增「知识要点」段落
- MCP server 工具数从 10 个扩展到 13 个

## [1.0.1] - 2026-07-31

定位重塑 + 工程基础加固。回应外部反馈，将项目从「AI Memory」差异化为「AI Knowledge Vault」，补齐测试与性能基准。

### Added

- **MCP `memory_recall` 工具**：语义召回，让 AI Agent 可查询「我以前有没有讨论过 X」，基于向量相似度返回相关对话片段
- **MCP `memory_write` 工具**：知识沉淀，让 AI Agent 自动保存重要决定/经验到 Memora 知识库
- **AI 配置文件持久化**（`userData/ai-config.json`）：主进程同步非敏感 AI 配置，供 MCP 进程读取 + secretStore 组装完整 AiConfig
- **StartupImportHint 组件**：启动时自动检测已安装的 AI 应用，右下角弹轻量导入提示（可永久关闭）
- **单元测试套件**（vitest + 31 用例）：覆盖 segmenter / streamJsonArray / chatgpt-importer / markdown-importer / extract-array-items
- **搜索性能 Benchmark**（`npm run benchmark`）：1000/5000/10000 对话三档测试，AND 搜索平均延迟 0.2-0.4ms
- **CI test job**：GitHub Actions 增加 vitest 单元测试任务

### Changed

- **品牌定位**：tagline 从「Local-First AI 记忆工作台」改为「Your Personal AI Knowledge Vault」，避开 Mem0/Memori 撞车
- **「AI 总结」改名「记忆蒸馏」（Memory Distillation）**：ChatViewer 按钮/面板/编辑器文案 + README 同步更新
- **README 重塑**：新增 Before/After 图直观展示价值，新增性能 Benchmark 段落，MCP 工具表从 6 个扩展到 10 个
- **MCP server 版本号**同步至 1.0.1

### Fixed

- 修正 README 版本徽章滞后（0.1.0 → 1.0.1）

## [1.0.0] - 2026-07-31

首次正式发布。Local-First AI 对话知识管理工具，聚合多款 AI 产品的对话记录到统一的本地工作区。

### Added

#### 核心数据管理
- 多 Workspace + 文件夹层级组织 AI 对话，支持智能文件夹（按 provider / 时间 / 标签规则动态过滤）
- 多 Provider 导入器：ChatGPT / Claude / Gemini / DeepSeek / Kimi / Qwen / Grok / Cursor / Claude Code / OpenCode / Windsurf / Cline / TRAE / Markdown / HTML
- 智能导入中心：自动检测本机已安装的 AI 应用并扒取本地对话记录，引导云端应用去网页导出
- 标签系统 + 收藏 + 批量移动/删除
- 数据备份与恢复（JSON 全量导出/导入，含预校验）
- Dashboard 首页统计（对话数 / Provider 分布 / 时间趋势）

#### 搜索与 AI
- FTS5 全文搜索，支持中文分词（Intl.Segmenter）+ AND→OR 查询回退
- 语义搜索（向量化 + 余弦相似度），Embedding 在 Worker 线程生成避免阻塞 UI
- AI 会话总结（摘要 / 关键点 / TODO），支持手动编辑
- Project Memory：基于历史对话的 RAG 问答 + 关联会话推荐
- knowledge.md 自动生成

#### 导入体验
- 智能扫描器：扫描 Downloads / Documents / Desktop 中的 AI 对话导出文件
- 大文件流式导入：ChatGPT 50MB+ conversations.json 用状态机逐元素解析，避免全量 JSON.parse 占用内存
- 流式导入进度推送（IMPORT_PROGRESS IPC 事件 + 渲染进程进度条）
- 后台静默导入：定时轮询已安装的 AI 应用，自动扒取并导入新对话（幂等去重 via sourceId）
- 拖拽导入 + 目录递归导入

#### 导出与分享
- HTML 导出（带品牌样式的可分享页面）
- Markdown 导出
- Claude Code jsonl 导出（用于跨平台迁移到 Claude Code）

#### 集成
- MCP Server 模式（`Memora-mcp`），允许 AI 客户端查询本地对话库

#### 体验细节
- 主题系统（亮/暗 + 自定义强调色）
- 虚拟列表渲染长会话列表（@tanstack/react-virtual）
- 全局快捷键
- API Key 使用 safeStorage 加密存储
- 配置持久化（后台导入配置存 userData/bg-import-config.json）

### Changed

- 向量存储从 JSON TEXT 改为 BLOB，消除每次搜索的 JSON.parse 开销
- IPC handler 从单文件 585 行拆分为 8 个领域模块（system / workspace / session / folder / tag / import / search / ai），统一 safeHandle 错误处理
- 数据库 schema 引入版本化迁移机制（migrations.ts，事务安全）
- 搜索输入防抖

### Fixed

- 修复 .gitignore 反斜杠语法导致 ripgrep 失败
- 修复备份导入缺少预校验导致脏数据问题
- 修复 IPC handler 未捕获异常导致渲染进程无错误信息

### Security

- API Key 通过 Electron safeStorage 加密存储，不以明文落盘
- 渲染进程无法直接访问 fs / SQLite，所有 Node 能力经 IPC 转发
- 扫描范围限定 Downloads / Documents / Desktop，需用户主动触发
- 仅 canExtract=true 的应用（Cursor / ClaudeCode / OpenCode / Windsurf / Cline）支持本地扒取

## [0.1.0] - 2026-07-25

### Added

- 项目命名为 Memora（Memory + Aura），AI 记忆工作区
- Phase 1-3 基础功能完成：导入 / 组织 / 搜索 / AI 总结 / 语义搜索
- 品牌视觉（书架 M Logo）
