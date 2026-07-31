<div align="center">

<!-- Hero：书架 M 品牌视觉 -->
<img src="assets/banner.svg" width="600" alt="Memora - Personal AI Knowledge Vault"/>

<p>
  <strong>Agent Memory OS — Give your AI a human-like long-term memory</strong><br/>
  本地优先 · 跨平台 AI 对话聚合 · 记忆蒸馏 · 偏好追踪 · MCP 记忆层
</p>

<!-- 徽章 -->
<p>
  <img src="https://img.shields.io/badge/version-1.4.0-F97316" alt="version"/>
  <img src="https://img.shields.io/badge/Electron-33-47848F" alt="Electron"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/SQLite-FTS5-003B57" alt="SQLite"/>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License"/>
  <img src="https://img.shields.io/badge/Local_First-✓-F97316" alt="Local First"/>
</p>

<p>
  <a href="#为什么需要-memora">为什么</a> ·
  <a href="#核心功能">功能</a> ·
  <a href="#支持平台">平台</a> ·
  <a href="#安装与运行">安装</a> ·
  <a href="#项目架构">架构</a> ·
  <a href="#开发路线">路线</a>
</p>

</div>

---

## AI 项目声明

> **本项目 90%+ 代码由 AI（Claude、DeepSeek、Gemini 等）生成，未经人工安全审计。**

Memora 是一个实验性项目，初衷是验证「AI 能否从零构建一个完整的桌面应用」。事实证明可以——但也带来了代价：

- **安全漏洞**：AI 生成的代码存在已知和未知的安全问题（XSS、注入、权限绕过等），本项目未经过专业安全审计
- **代码质量**：存在冗余逻辑、不一致的命名风格、不够优雅的架构设计
- **潜在 Bug**：边界条件、错误处理、内存管理等方面可能存在未覆盖的场景

**如果你打算使用 Memora 管理敏感对话，请自行评估风险。** 欢迎安全研究者提交漏洞报告或 PR。

相关讨论：[为什么 AI 越聪明，写的代码反而越不安全？](https://www.bilibili.com/video/BV1T1GA6pEvp/) — VibeCoding 安全分析

---

## 为什么需要 Memora

现代 AI 用户同时使用 10+ 个平台：ChatGPT、Claude、Gemini、DeepSeek、Kimi、通义、Cursor、Grok……每个平台都是一个**数据孤岛**。

- 同一项目的 AI 讨论散落在 5 个平台，无法统一查看
- 换账号、换平台时，历史对话无法带走
- 三个月后想找回某段精彩讨论，翻遍几百条记录也找不到
- 平台默认按时间线展示，没有项目维度的组织能力

> 现有 AI 平台是「对话工具」，不是「知识管理工具」。Memora 要补上这一层。

## Before / After

```
Before Memora:                       After Memora:

User: "你记得我喜欢什么吗?"          AI: "当然，你喜欢初音未来，
AI:  "抱歉，我没有之前的信息"              也正在学习 C++，
                                          之前用 Python 但最近
                                          换成了 Rust。"

ChatGPT   ─┐                        ┌─ Memora (Agent Memory OS) ─┐
Claude    ─┤   各自为政             │  📁 Aether 项目             │
DeepSeek  ─┤   搜索靠翻记录         │  ├─ Claude 架构讨论         │
Cursor    ─┤   换平台丢上下文       │  ├─ DeepSeek Bug 分析       │
Kimi      ─┘                        │  ├─ Cursor 代码方案         │
                                    │  ├─ ✨ 蒸馏出的知识要点     │
                                    │  └─ 🧠 用户偏好画像         │
                                    └────────────────────────────┘
```

## Memora 是什么

Memora 是一个 **Agent Memory OS**——给 AI Agent 提供类人长期记忆的本地优先系统。

它不是简单的聊天导出工具，也不是又一个 RAG 框架。它是一个完整的 **记忆生命周期管理系统**：

- ✅ 跨平台聚合：ChatGPT / Claude / Gemini / DeepSeek / Kimi / 通义 / Cursor / Grok ……
- ✅ **记忆类型系统**：知识 / 决策 / 任务 / **偏好**（Preference）四类一等公民实体
- ✅ **记忆生命周期**：创建 → 巩固 → 冲突检测 → 遗忘（置信度衰减）
- ✅ **MCP 记忆层**：17 个 MCP 工具，让 Claude Code / Cursor / 任何 MCP 客户端读写记忆
- ✅ 本地优先：数据存储在本地 SQLite，离线可用，隐私可控
- ✅ 全文 + 语义搜索：FTS5 关键词搜索 + 向量语义检索
- ✅ 记忆蒸馏：AI 自动总结对话、提取偏好、生成知识文档
- ✅ 可视化：知识图谱（SVG）+ 偏好画像 + 时间线
- ✅ 可分享：导出为自包含 HTML，任何人用浏览器即可查看

## 演示

> 以下 Gif 占位，录制后替换文件名即可

<table>
  <tr>
    <td width="33%" align="center">Dashboard 首页</td>
    <td width="33%" align="center">智能导入</td>
    <td width="33%" align="center">搜索高亮</td>
  </tr>
  <tr>
    <td width="33%"><img src="assets/demo-dashboard.gif" alt="Dashboard"/></td>
    <td width="33%"><img src="assets/demo-import.gif" alt="Import"/></td>
    <td width="33%"><img src="assets/demo-search.gif" alt="Search"/></td>
  </tr>
</table>

## 核心功能


### 智能导入中心

**自动检测已安装的 AI 应用，一键扒取本地记录：**

| 应用 | 检测方式 | 本地扒取 | 说明 |
|------|---------|:-------:|------|
| **Cursor** | state.vscdb | ✅ | 只读 SQLite |
| **Claude Code** | ~/.claude/projects | ✅ | .jsonl 日志，支持 custom-title 优先级 |
| **OpenCode** | ~/.opencode | ✅ | 本地数据 |
| **Windsurf** | %APPDATA%\Windsurf | ✅ | 复用 Cursor 逻辑 |
| **Cline** | VSCode 扩展 | ✅ | SQLite |
| ChatGPT/Claude/Kimi | 桌面端 | — | 云端，引导导出 |

扒取后可**编辑标题和来源标注**再导入。安全：只读模式，不碰配置/密钥。

### 跨平台导入器矩阵

覆盖 11 个平台/格式的专用导入器，自动识别文件格式，统一转换为 `ChatSession`：

| 平台 | 格式 | 特性 |
|------|------|------|
| ChatGPT | `conversations.json` | 官方导出，mapping 树结构解析 |
| Claude | JSON / HTML | 官方导出 + 分享页面 |
| DeepSeek | JSON | 分享 API + 直接导出，含 reasoning_content |
| Kimi | JSON | 分享页面 HYDRATION_INIT_STATE 解析 |
| 通义千问 | JSON | 分享 API + 导出 JSON |
| Gemini | JSON | prompts/contents/messages 三种结构兼容 |
| Grok | JSON | conversation 包裹 + 直接 messages |
| Cursor | JSON | chats 数组 + 单对话结构 |
| Markdown | `.md` | 通用 Markdown（含 frontmatter） |
| JSON | `.json` | 通用 Memora schema |
| HTML | `.html` | 通用 HTML 对话页面 |

支持**拖拽导入**和**批量操作**：把文件直接拖入窗口即可导入，支持多选批量删除/移动。

### 对话管理（Workspace）

```
Workspace（工作区）
└── Folder（文件夹）
    └── ChatSession（对话）
        └── Message（消息）
```

- 创建 / 重命名 / 删除 Workspace、Folder
- 标签（多对多）与收藏（星标）
- 对话置顶 / 改名 / 单条删除 / 全选删除
- 按 provider / 时间 / 收藏筛选
- 拖拽移动对话

### 全文搜索 + 语义搜索

- **关键词搜索**：SQLite FTS5 全文索引，支持对话标题与消息内容
- **语义搜索**：向量嵌入 + 余弦相似度，跨会话语义检索（需配置 AI API）

### AI 增强（Phase 2）

- **对话总结**：自动生成摘要、关键要点、待办事项
- **knowledge.md**：把对话沉淀为可复用的知识文档
- **向量索引**：为消息生成向量，增量索引，已索引的跳过

### Project Memory 智能问答（Phase 3）

基于 RAG（检索增强生成）的智能问答系统：

1. 把问题向量化
2. 从全库向量中检索 Top-K 相关消息
3. 加载每条命中的上下文（前后各 1 条消息）
4. 组装 context prompt，调用 LLM 生成答案
5. 返回答案 + 引用来源（可点击跳转到原对话）

**相关讨论推荐**：基于会话向量质心，自动推荐与当前对话相关的其他讨论。

### Knowledge Vault 知识库（v1.1）

把决策、任务、知识从对话蒸馏的 JSON 数组提升为**一等公民实体**，可独立查询、关联、复用：

- **三类实体**：知识（knowledge）/ 决策（decision）/ 任务（task）
- **独立管理**：新建 / 编辑 / 删除 / 搜索，不依赖对话
- **任务勾选**：卡片内一键切换完成状态，已完成自动半透明 + 删除线
- **决策追踪**：状态标记（生效中 / 已废弃）
- **FTS 搜索**：知识条目专用全文索引（中文分词）
- **轻量 Memory Graph**：关系类型（supports / contradicts / derived-from / relates-to）
- **「提炼到知识库」按钮**：在对话蒸馏工具栏，一键把当前对话提炼为知识库条目（幂等）

### Memory Lifecycle 记忆生命周期（v1.4）

类人脑的记忆管理——不只是存储，还有遗忘和进化：

```
对话蒸馏                冲突检测                    衰减
    │                      │                        │
    ▼                      ▼                        ▼
创建偏好              新旧矛盾时               30天未访问
(subject+value)       旧记忆→superseded         confidence↓
confidence=0.6        新记忆→active             ≤0.05→archived
```

- **自动提取**：AI 蒸馏对话时自动识别用户偏好（如「喜欢初音未来」「用 VSCode」）
- **冲突检测**：用户改变偏好时（如从 iPhone 换 Android），旧记忆自动标记为 `superseded`，新记忆为 `active`
- **复现增强**：相同偏好再次出现时，confidence +0.15（最高 1.0）
- **置信度衰减**：超过 30 天未访问的偏好，每次启动降低 0.1；低于 0.05 自动归档
- **软删除（遗忘）**：archived 状态保留审计痕迹，不物理删除
- **用户画像**：按类别分组的偏好聚合，让 AI 快速了解用户

### 后台静默导入（v1.1）

后台定时轮询已安装的 AI 应用（Cursor / Claude Code / OpenCode / Windsurf / Cline），自动检测新增对话并导入：

- 可配置轮询间隔（默认 30 分钟）、目标文件夹、启用的应用
- 启动时自动执行一次
- 右下角浮动进度指示器，非阻塞
- 幂等去重：基于 sourceId 避免重复导入

### 主题系统与个性化

- **深色 / 浅色 / 跟随系统**三种主题模式
- **自定义背景图片**：上传图片作为应用背景
- **模糊度与不透明度**调节：让背景图与界面和谐共存
- **多语言支持**：简体中文 / English / 日本語

### 无限供应商 + 多协议 AI 配置（v1.2）

支持无限添加 AI 供应商，每个供应商独立选择 API 协议风格，配置完全隔离：

| 协议风格 | Chat | Embeddings | 鉴权方式 | 适用平台 |
|----------|:----:|:----------:|----------|-----|
| **OpenAI 兼容** | ✅ | ✅ | Bearer Token | OpenAI / DeepSeek / SiliconFlow / Kimi / 通义千问 / 大多数第三方 |
| **Anthropic 原生** | ✅ | 第三方 | x-api-key | Claude 官方 API |
| **Ollama 本地** | ✅ | ✅ | 无需鉴权 | 本地部署的 Ollama |
| **Google Gemini** | ✅ | ✅ | URL Key | Google AI Studio |

- 每个供应商可独立重命名、删除、切换协议
- 配置仅保存在本地，apiKey 加密存储（safeStorage）
- 测试连接通过 main 进程代理，同时验证 chat + embeddings 接口

### MCP Server

Memora 可作为 MCP Server 运行，把对话数据暴露给 Claude Desktop 等外部 AI 工具：

```json
{
  "mcpServers": {
    "memora": {
      "command": "node",
      "args": ["<memora-path>/out/main/index.js", "--mcp"]
    }
  }
}
```

暴露 17 个工具：

| 工具 | 用途 |
|------|------|
| `search_sessions` | 全文搜索对话 |
| `get_session` | 获取对话完整内容 |
| `list_sessions` | 列出对话（分页/筛选） |
| `list_workspaces` | 列出工作区 |
| `list_tags` | 列出标签 |
| `get_session_summary` | 获取对话蒸馏 |
| `add_session` | 创建新对话 |
| `add_message` | 追加消息 |
| `memory_recall` | **语义召回**：让 AI 查询「我以前有没有讨论过 X」 |
| `memory_write` | **知识沉淀**：让 AI 自动保存重要决定/经验到知识库 |
| `knowledge_search` | **知识搜索**：FTS 搜索知识/决策/任务条目 |
| `decision_search` | **决策搜索**：专搜架构决策 |
| `project_context` | **项目上下文**：组装近期决策 + 未完成任务 + 核心知识 |
| `memory_profile` | **用户画像**：返回用户全部偏好（按类别分组），让 AI 了解用户 |
| `memory_save_preference` | **保存偏好**：写入用户偏好，自动检测冲突（旧记忆标记 superseded） |
| `memory_forget` | **遗忘**：将偏好标记为 archived（软删除） |
| `preference_search` | **偏好搜索**：FTS 搜索用户偏好记忆 |

`memory_recall` / `memory_write` / `memory_profile` / `memory_save_preference` / `memory_forget` 让 Memora 从「对话管理器」升级为真正的 **Agent Memory OS**——AI Agent 可主动召回历史知识、了解用户偏好、沉淀新知识、遗忘过时信息。

### 分享导出

将对话导出为**自包含 HTML 文件**，内嵌所有内容与样式，任何人用浏览器打开即可查看，无需安装 Memora。

## 性能 Benchmark

`npm run benchmark` 在临时 SQLite + FTS5 索引上测量搜索性能（不启动 Electron GUI，不依赖 API Key）：

| 对话数 | 索引构建 | AND 搜索平均延迟 | OR 搜索平均延迟 |
|-------:|--------:|----------------:|---------------:|
| 1,000  | 114 ms  | 0.22 ms         | 0.20 ms        |
| 5,000  | 360 ms  | 0.41 ms         | 0.23 ms        |
| 10,000 | 837 ms  | 0.21 ms         | 0.16 ms        |

- 测试查询：5 个中文关键词（"SQLite 性能" / "Electron 项目" / "向量检索" / "React 渲染" / "索引原理"）
- 语义/向量搜索召回率需真实 Embedding API，不在此 benchmark 范围
- 实际应用受磁盘 I/O 和并发影响，延迟会有波动

## 支持平台

<div align="center">

| | | | | | |
|:---:|:---:|:---:|:---:|:---:|:---:|
| ChatGPT | Claude | Gemini | DeepSeek | Kimi | 通义 |
| Cursor | Grok | Markdown | JSON | HTML | |

</div>

## 安装与运行

### 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发模式（Electron + Vite HMR）
npm run dev
```

### 生产构建

```bash
# 类型检查
npm run typecheck

# 打包
npm run build

# 打包为 Windows 安装包
npm run dist:win

# 预览生产版本
npm run preview
```

### MCP Server 模式

```bash
# 以 MCP Server 运行（stdio 传输）
npm run mcp
```

## 配置 AI

在使用记忆蒸馏、语义搜索、Project Memory 之前，需要配置 AI 供应商：

1. 启动 Memora，点击侧边栏「⚙ 设置」→ AI 配置
2. 点击「+ 新增供应商」添加任意数量的 AI 供应商
3. 每个供应商独立选择 API 协议风格（OpenAI 兼容 / Anthropic / Ollama / Gemini）
4. 填入 API Base URL、API Key（Ollama 无需）、对话模型、嵌入模型、向量维度
5. 点击「测试连接」验证配置（同时验证 chat + embeddings）

配置仅保存在本地，apiKey 加密存储。支持 OpenAI、DeepSeek、SiliconFlow、Kimi、通义千问、Claude、Ollama、Gemini 及任何兼容接口。

## 项目架构

```
┌──────────────────────────────────────────────────────────┐
│  Renderer Process (React UI)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Sidebar  │  │ ChatList │  │ChatViewer│               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       └─────────────┴─────────────┘                      │
│                     │ window.memora.* (preload bridge)   │
└─────────────────────┼────────────────────────────────────┘
                      │ IPC (contextBridge)
┌─────────────────────┼────────────────────────────────────┐
│  Main Process       ▼                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ importer │  │ database │  │  search  │  │   ai     │ │
│  └──────────┘  └────┬─────┘  └──────────┘  └──────────┘ │
│                     │                                    │
│                     ▼                                    │
│              ┌─────────────┐                             │
│              │  SQLite DB  │  (用户数据目录)             │
│              └─────────────┘                             │
└──────────────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 | 选型理由 |
|----|------|----------|
| 前端 | React 18 + TypeScript 5.7 | 生态成熟、类型安全 |
| 桌面 | Electron 33 | 跨平台、better-sqlite3 集成成熟 |
| 构建 | Vite + electron-vite | 快速 HMR |
| 存储 | SQLite (better-sqlite3) | 嵌入式、高性能、支持 FTS5 |
| 搜索 | SQLite FTS5 + 向量检索 | 关键词 + 语义双层 |
| 状态 | Zustand | 轻量、TypeScript 友好 |
| 样式 | Tailwind CSS | 暗色优先、CSS 变量驱动 |

### 目录结构

```
memora/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── ipc/           # IPC 处理器
│   │   └── index.ts       # 主进程入口（含 MCP 模式 + Tray）
│   ├── preload/           # contextBridge 安全 API
│   ├── renderer/          # React UI
│   │   └── src/components/
│   │       ├── Sidebar/   # 工作区导航 + 搜索
│   │       ├── ChatList/  # 对话列表（多选/批量/置顶）
│   │       ├── ChatViewer/# 对话查看 + AI 工具栏
│   │       ├── ProjectMemory/ # RAG 问答面板
│   │       ├── ImportCenter/  # 导入中心（扒取+扫描）
│   │       ├── Settings/      # 主题+AI配置+背景图
│   │       └── AiSettings/    # 多供应商 AI 配置
│   ├── importer/          # 导入器 + 扫描器 + 应用探测器 + 本地扒取器
│   ├── database/          # SQLite + 6 个 Repository
│   ├── search/            # FTS5 + 语义搜索
│   ├── ai/                # 总结 + 嵌入 + Project Memory
│   ├── mcp/               # MCP Server
│   ├── sharing/           # HTML 导出
│   └── shared/            # 跨进程类型与常量
├── assets/                # 品牌资源（logo / banner）
├── build/                 # 打包图标
└── package.json
```

## 开发路线

### Phase 1：MVP（v0.1）✅

- [x] Electron + Vite + React 工程脚手架
- [x] SQLite 数据层 + Schema + 迁移
- [x] 统一数据模型 + 类型定义
- [x] ChatGPT / Claude / Markdown / JSON 导入器
- [x] Workspace / Folder 树形管理
- [x] 对话列表 + 查看器 UI
- [x] FTS5 全文搜索
- [x] 自包含 HTML 分享导出
- [x] 拖拽导入 + 批量操作
- [x] DeepSeek / Kimi / 通义导入器

### Phase 2：AI 增强（v0.5）✅

- [x] 记忆蒸馏（摘要 / 关键决定 / 待办）
- [x] 自动生成 knowledge.md
- [x] 语义搜索（向量嵌入 + 相似度检索）
- [x] 可配置 AI API Key（OpenAI/DeepSeek/自定义）

### Phase 3：生态（v1.0）✅

- [x] Project Memory 智能问答（RAG）
- [x] 相关讨论推荐（基于向量相似度）
- [x] MCP Server（暴露对话数据给外部工具）
- [x] Gemini / Grok / Cursor 导入器
- [x] 智能导入中心（自动检测 + 本地扒取）
- [x] 主题系统（深色/浅色/系统 + 背景图片）
- [x] 多供应商 AI 配置（独立存储，互不干扰）
- [x] 多语言支持（中/英/日）
- [x] 系统托盘 + 应用图标
- [x] Windows 安装包打包

### Phase 4：Agent Memory OS（v1.4）✅

- [x] Preference 实体（结构化用户偏好：subject + value + confidence）
- [x] 记忆生命周期（创建 → 冲突检测 → 衰减 → 遗忘）
- [x] MCP 记忆工具（memory_profile / memory_save_preference / memory_forget / preference_search）
- [x] AI 蒸馏自动提取偏好
- [x] PreferenceExplorer UI（偏好画像 + 置信度可视化 + 衰减操作）
- [x] 安全加固（Electron sandbox + CSP + 异常处理器 + SnippetRenderer）
- [x] README AI 项目声明 + 安全披露

### 后续规划

- [ ] `memora.chat` 在线分享托管（可选上传）
- [ ] 账号系统 + 云端同步（端到端加密）
- [ ] 浏览器插件（一键采集网页对话）
- [ ] Cursor / VSCode 插件（IDE 内查看项目记忆）
- [ ] 协作 Workspace（团队共享）

## 变更日志

详见 [CHANGELOG.md](CHANGELOG.md) — 基于 Keep a Changelog 格式，记录所有重要变更。

## 安全披露

本项目为 AI 生成代码，已知和潜在的安全问题包括但不限于：

- **XSS 风险**：部分渲染路径历史上使用 `dangerouslySetInnerHTML`（v1.3.0 已修复为安全组件）
- **CSP 缺失**：v1.3.0 前未设置 Content-Security-Policy 头（v1.3.0 已修复）
- **沙箱未启用**：v1.3.0 前渲染进程未启用 Electron sandbox 模式（v1.3.0 已修复）
- **全局异常未捕获**：v1.3.0 前未注册 `unhandledRejection` / `uncaughtException` 处理器（v1.3.0 已修复）
- **依赖漏洞**：`npm audit` 报告 20 个已知漏洞（18 个高风险），主要来自 Electron 33.x
- **SQL 注入**：部分查询使用字符串拼接，虽经过参数校验但未经渗透测试
- **IPC 安全**：preload 桥接层暴露了较宽的主进程 API 面，存在被恶意利用的可能

**如果你发现安全漏洞，请通过 GitHub Issues 或邮件私下报告，不要公开披露。** 我们会在确认后尽快修复并致谢。

## 核心原则

> **你的 AI 对话，应当像代码一样被版本化、被搜索、被分享、被复用。**
> **数据归你所有，工具为你服务。**

- **Local-First**：数据存储在本地，优先保证离线可用和用户数据所有权
- **Privacy-First**：数据不离开本地，分享由用户主动选择
- **跨平台**：不锁死单一平台，数据可迁移
- **AI 原生**：为 AI 对话量身设计的数据模型，理解 provider/model/role/timestamp

## License

[MIT](LICENSE)

---

<div align="center">

<sub>Built with Electron · React · TypeScript · SQLite</sub><br/>
<sub>© 2026 Memora · Memory + Aura</sub>

</div>
