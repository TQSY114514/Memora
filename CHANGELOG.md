# Changelog

本文件记录 Memora 的所有重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
