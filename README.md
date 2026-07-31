<div align="center">

<!-- Hero：书架 M 品牌视觉 -->
<img src="assets/banner.svg" width="560" alt="Memora - AI Memory Workspace"/>

<p>
  <strong>Local-First 的 AI 记忆工作台</strong><br/>
  统一管理 · 搜索 · 分享 · 复用来自不同 AI 平台的聊天记录
</p>

<!-- 徽章 -->
<p>
  <img src="https://img.shields.io/badge/version-0.1.0-F97316" alt="version"/>
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

## 为什么需要 Memora

现代 AI 用户同时使用 10+ 个平台：ChatGPT、Claude、Gemini、DeepSeek、Kimi、通义、Cursor、Grok……每个平台都是一个**数据孤岛**。

- 同一项目的 AI 讨论散落在 5 个平台，无法统一查看
- 换账号、换平台时，历史对话无法带走
- 三个月后想找回某段精彩讨论，翻遍几百条记录也找不到
- 平台默认按时间线展示，没有项目维度的组织能力

> 现有 AI 平台是「对话工具」，不是「知识管理工具」。Memora 要补上这一层。

## Memora 是什么

Memora 是一个 **Local-First 的 AI 记忆工作台**。它不是另一个 AI Agent，也不是简单的聊天导出工具——它是一个跨平台的 **AI 对话聚合层 + 项目记忆系统**。

- ✅ 跨平台聚合：ChatGPT / Claude / Gemini / DeepSeek / Kimi / 通义 / Cursor / Grok ……
- ✅ 本地优先：数据存储在本地 SQLite，离线可用，隐私可控
- ✅ 统一数据模型：屏蔽平台差异，所有对话归一为 `ChatSession`
- ✅ 全文 + 语义搜索：FTS5 关键词搜索 + 向量语义检索
- ✅ AI 增强：自动总结、knowledge.md 生成、Project Memory 智能问答
- ✅ 可分享：导出为自包含 HTML，任何人用浏览器即可查看
- ✅ **智能导入中心**：自动检测已安装的 AI 应用，一键扒取本地记录

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

### 主题系统与个性化

- **深色 / 浅色 / 跟随系统**三种主题模式
- **自定义背景图片**：上传图片作为应用背景
- **模糊度与不透明度**调节：让背景图与界面和谐共存
- **多语言支持**：简体中文 / English / 日本語

### 多供应商 AI 配置

每个供应商独立配置，互不干扰：

| 供应商 | Chat | Embeddings | 说明 |
|--------|:----:|:----------:|------|
| OpenAI | ✅ | ✅ | 官方接口 |
| DeepSeek | ✅ | — | 对话可用，语义搜索需另配 |
| 自定义 | ✅ | ✅ | 任何 OpenAI 兼容接口 |

配置仅保存在本地 localStorage，不会上传。测试连接通过 main 进程代理（避免 CORS 限制）。

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

暴露 6 个工具：`search_sessions`、`get_session`、`list_sessions`、`list_workspaces`、`list_tags`、`get_session_summary`

### 分享导出

将对话导出为**自包含 HTML 文件**，内嵌所有内容与样式，任何人用浏览器打开即可查看，无需安装 Memora。

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

在使用 AI 总结、语义搜索、Project Memory 之前，需要配置 OpenAI 兼容的 API：

1. 启动 Memora，点击侧边栏「⚙ 设置」→ AI 配置
2. 选择供应商（OpenAI / DeepSeek / 自定义），各供应商独立配置
3. 填入 API Base URL、API Key、对话模型、嵌入模型、向量维度
4. 点击「测试连接」验证配置

配置仅保存在本地 localStorage，不会上传。支持 OpenAI、DeepSeek 及任何 OpenAI 兼容接口。

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

- [x] 聊天自动总结（摘要 / 关键决定 / 待办）
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

### 后续规划

- [ ] `memora.chat` 在线分享托管（可选上传）
- [ ] 账号系统 + 云端同步（端到端加密）
- [ ] 浏览器插件（一键采集网页对话）
- [ ] Cursor / VSCode 插件（IDE 内查看项目记忆）
- [ ] 协作 Workspace（团队共享）

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
