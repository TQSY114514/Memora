# Changelog

本文件记录 Memora 的所有重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
