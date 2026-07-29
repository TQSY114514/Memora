# Aether — 产品设计与架构分析

> AI 对话时代的知识管理工具
> Version: 0.1 设计草案 · 2026-07-29

---

# 一、产品定位

## 1.1 一句话定义

Aether 是一个 **Local-First 的 AI 对话知识工作台**，让用户在一个地方统一管理、搜索、分享和复用来自不同 AI 平台产生的聊天记录，并逐步演进为「AI 项目记忆系统」。

## 1.2 类比锚点

| 工具      | 管理对象       | Aether 的位置                    |
|-----------|----------------|----------------------------------|
| Notion    | 知识文档       | 管理 AI 对话这一新型知识载体     |
| Git       | 代码变更       | 管理 AI 协作产出的对话与决策     |
| Pinterest | 收藏内容       | 收藏并组织有价值的 AI 回答       |
| **Aether**| **AI 对话**    | **AI 对话时代的知识管理工具**    |

## 1.3 它「不是」什么

- ❌ 不是另一个 AI Agent / Chatbot
- ❌ 不是单纯的聊天记录导出/备份工具
- ❌ 不是某个 AI 平台的官方客户端
- ❌ 不是云端的 SaaS 聊天仓库

## 1.4 它「是」什么

- ✅ 跨平台的 **AI 对话聚合层**（ChatGPT / Claude / Gemini / DeepSeek / Kimi / 通义 / Cursor / Codex / Claude Code / OpenCode …）
- ✅ 本地优先、隐私优先的 **个人 AI 知识库**
- ✅ 支持 **分享与复用** 的 AI 知识协作层
- ✅ 面向未来的 **AI 项目记忆系统**（Project Memory）

## 1.5 核心价值主张

> 你的 AI 对话，应当像代码一样被版本化、被搜索、被分享、被复用。
> 数据归你所有，工具为你服务。

---

# 二、用户痛点

## 2.1 现状：AI 用户的碎片化困境

现代 AI 用户同时使用 10+ 个 AI 平台：

```
ChatGPT · Claude · Gemini · DeepSeek · Kimi · 通义
Claude Code · Codex · OpenCode · Cursor · GitHub Copilot
```

每个平台都是一个 **数据孤岛**。

## 2.2 六大核心痛点

### 痛点 1：AI 聊天记录分散在不同平台

用户在 ChatGPT 讨论需求、在 Claude 讨论架构、在 DeepSeek 优化代码、在 Cursor 写代码。**同一项目的 AI 讨论散落在 5 个平台**，无法统一查看。

```
项目「Aether」的讨论实际分布在：
├── ChatGPT    → 需求分析（3 段对话）
├── Claude     → 架构设计（7 段对话）
├── DeepSeek   → 代码优化（4 段对话）
├── Cursor     → 实际编码（20+ 段对话）
└── Kimi       → 中文资料检索（2 段对话）
```

### 痛点 2：不同账号之间无法迁移

换账号、换平台、换公司时，**历史 AI 对话无法带走**。ChatGPT 的导出格式 ≠ Claude 的导出格式 ≠ Gemini 的导出格式。

### 痛点 3：优质回答难以寻找

用户曾和 Claude 深入讨论「如何设计 Electron AI 工作台」。**三个月后想重新查看，需要翻找几百条聊天记录**，平台搜索能力弱，无法跨平台搜索。

### 痛点 4：多个项目的 AI 讨论混在一起

平台默认按时间线展示所有对话，**没有项目维度的组织能力**。工作项目、个人项目、学习笔记全部混在一起。

### 痛点 5：分享 AI 解决方案非常麻烦

想把一段精彩的「Claude × 架构讨论」分享给同事，只能：
- 截图（信息不完整、不可搜索）
- 复制粘贴（丢失结构、丢失模型信息）
- 分享平台链接（依赖对方有账号、对方看到的是原始时间线）

### 痛点 6：AI 生成的知识无法沉淀

AI 回答是一次性的。**对话结束后，知识就「死」了**。没有机制把 AI 对话转化为可检索、可复用的知识资产。

## 2.3 痛点的本质

> 现有 AI 平台是 **「对话工具」**，不是 **「知识管理工具」**。
> 它们优化的是「这一次对话」，而不是「跨时间、跨平台的知识沉淀」。

Aether 要补上这一层。

---

# 三、竞品分析

## 3.1 竞品全景

| 类别 | 代表项目 | 核心能力 | 缺陷 |
|------|----------|----------|------|
| 分享工具 | Shared-Claude-Chats | 分享 Claude 对话 | 仅分享，无管理/搜索/聚合 |
| 导出工具 | Chat export tools | 导出为 MD/HTML | 一次性导出，无组织无沉淀 |
| 通用笔记 | Notion / Obsidian | 知识管理 | 不理解 AI 对话结构，无导入器 |
| 平台记忆 | Claude Memory / ChatGPT memory | 平台内记忆 | 锁死单一平台，不可迁移 |
| 平台历史 | ChatGPT history | 平台内查看 | 不跨平台、无项目组织、无分享 |
| AI 桌面端 | Cherry Studio / ChatBox | 多模型对话客户端 | 侧重「发起对话」，非「管理历史」 |

## 3.2 逐项差异化分析

### vs Shared-Claude-Chats

- **它**：只做「分享单条 Claude 对话」，无存储、无搜索、无组织。
- **Aether**：分享只是功能之一，核心是 **跨平台聚合 + 本地知识库 + 项目化组织**。分享的链接带有元数据（模型/标签/项目/摘要）。

### vs Chat export tools

- **它**：把对话导出成 Markdown/HTML 文件，丢给用户自己管理。
- **Aether**：导出只是入口，Aether 提供 **统一数据模型 + 全文搜索 + Workspace 组织 + 分享**，是一个完整的管理系统而非导出器。

### vs Notion

- **它**：通用知识管理，强大但不理解 AI 对话结构。手动粘贴效率低，丢失模型/时间/角色元数据。
- **Aether**：**原生理解 AI 对话**（provider/model/role/timestamp），自动解析导入，保留完整上下文。未来可一键导出到 Notion。

### vs Obsidian

- **它**：本地优先的笔记工具，基于 Markdown 文件。但 AI 对话结构（多轮、角色、模型）需要手动建模。
- **Aether**：同样 Local-First，但 **为 AI 对话量身设计的数据模型**。可作为 Obsidian 的「AI 对话插件数据源」共存，而非替代。

### vs Claude Memory / ChatGPT memory

- **它**：平台内的记忆机制，**锁死单一平台**，不可迁移、不可跨平台搜索、不可分享。
- **Aether**：**跨平台聚合记忆**，数据归用户，可离线，可迁移。

### vs ChatGPT history

- **它**：ChatGPT 平台内的历史记录浏览，只能看 ChatGPT 自己的。
- **Aether**：聚合 **所有平台**，加上项目组织、全文搜索、分享能力。

### vs Cherry Studio / ChatBox 等多模型客户端

- **它**：侧重「**发起**新的多模型对话」，是客户端。
- **Aether**：侧重「**管理沉淀**已有的 AI 对话」，是知识库。两者正交，可互补。

## 3.3 Aether 的差异化护城河

```
┌─────────────────────────────────────────────────────────┐
│  差异化 = 跨平台导入 × 统一数据模型 × 项目化组织        │
│           × 本地优先 × 可分享 × 可沉淀为知识            │
└─────────────────────────────────────────────────────────┘
```

1. **跨平台导入器矩阵**：覆盖 8+ 主流 AI 平台的导入，形成数据入口壁垒。
2. **统一数据模型**：`ChatSession` 抽象屏蔽平台差异，是后续搜索/分享/AI 增强的基石。
3. **Workspace 项目化组织**：把「散落的对话」变成「项目知识」。
4. **Local-First 隐私承诺**：数据不离开本地，建立信任护城河。
5. **分享即知识协作**：`aether.chat` 链接让 AI 知识像 GitHub Gist 一样可流通。

---

# 四、MVP 设计（Version 0.1）

## 4.1 MVP 范围界定

> MVP 只做 **「导入 → 组织 → 搜索 → 分享」** 这条核心闭环。
> AI 增强、Project Memory 推迟到 Phase 2/3。

### MVP 包含

| 模块 | 功能 | 优先级 |
|------|------|--------|
| 导入 | ChatGPT / Claude / Markdown / JSON 导入 | P0 |
| 管理 | Workspace / 文件夹 / 标签 / 收藏 | P0 |
| 搜索 | SQLite FTS5 全文搜索 | P0 |
| 分享 | 导出可分享的单文件（HTML/自包含） | P1 |
| 查看 | 三栏式对话浏览器 | P0 |
| 暗色模式 | 主题切换 | P1 |

### MVP 不包含

- ❌ AI 总结 / 自动 knowledge.md（Phase 2）
- ❌ 语义搜索 / 向量检索（Phase 2）
- ❌ Project Memory 智能问答（Phase 3）
- ❌ 云端同步 / 账号系统（Phase 3）
- ❌ 在线分享托管平台（Phase 3）

## 4.2 核心功能详述

### 4.2.1 AI 聊天导入

**支持的导入源（MVP）：**

| 来源 | 导入格式 | 说明 |
|------|----------|------|
| ChatGPT | `conversations.json` | 官方导出格式 |
| Claude | JSON / HTML | 官方导出或页面导出 |
| Gemini | JSON | 对话导出 |
| DeepSeek | JSON / Markdown | 对话导出 |
| Kimi | JSON / Markdown | 对话导出 |
| 通义 | JSON / Markdown | 对话导出 |
| Markdown | `.md` | 通用 Markdown（含 frontmatter） |
| JSON | `.json` | 通用 JSON（符合 Aether schema） |
| HTML | `.html` | 通用 HTML 对话页面 |

**导入流程：**

```
用户拖拽/选择文件
    ↓
识别 provider（按文件结构/扩展名/内容特征）
    ↓
调用对应 Importer
    ↓
转换为统一 ChatSession
    ↓
写入 SQLite
    ↓
建立 FTS5 索引
    ↓
在 UI 中展示
```

**导入器设计原则：**
- 每个 provider 一个独立 Importer 模块
- 输入：原始文件 → 输出：`ChatSession[]`
- 容错：单条消息解析失败不阻断整体导入
- 幂等：相同 `sourceId` 重复导入时更新而非重复插入

### 4.2.2 聊天管理（Workspace）

**层级模型：**

```
Workspace（工作区）
└── Folder（文件夹）
    └── ChatSession（对话）
        └── Message（消息）
```

**示例：**

```
 Workspace: Aether 项目
 ├── 📁 Claude 架构讨论
 │    ├── 💬 Electron IPC 设计方案
 │    ├── 💬 数据模型设计
 │    └── 💬 分享功能架构
 ├── 📁 ChatGPT 需求分析
 │    ├── 💬 MVP 功能定义
 │    └── 💬 用户画像分析
 └── 📁 DeepSeek 代码优化
      └── 💬 SQLite FTS5 性能调优

 Workspace: 个人学习
 └── 📁 Kimi 资料检索
      └── 💬 RAG 架构调研
```

**支持的操作：**
- 创建 / 重命名 / 删除 Workspace、Folder
- 拖拽移动 ChatSession
- 标签（多对多）
- 收藏（星标）
- 重命名对话
- 按时间/provider/标签/收藏筛选

### 4.2.3 聊天分享（核心卖点）

**MVP 分享方式：自包含 HTML 文件**

将一段对话导出为 **单个 HTML 文件**，内嵌所有内容与样式，任何人用浏览器打开即可查看，无需安装 Aether、无需账号。

**分享内容包含：**
- 完整对话内容（保留 Markdown 渲染、代码高亮）
- 元数据：provider、model、时间、标签、描述
- 可选：用户自定义标题与描述
- 可选：Aether 水印（品牌曝光）

**未来演进：**
- Phase 3：`aether.chat/<id>` 在线托管（用户可选上传）
- 支持密码保护、有效期、访问统计

**为什么 MVP 不做在线托管：**
- 降低 MVP 复杂度（无需后端、无需账号系统）
- 符合 Local-First 定位
- 自包含 HTML 已能满足 90% 分享场景

### 4.2.4 全文搜索

**MVP：SQLite FTS5**

```
搜索 "Electron IPC"
    ↓
FTS5 匹配 messages.content + sessions.title
    ↓
返回：高亮片段 + 所属对话 + 所属 Workspace
    ↓
点击跳转到对话对应位置
```

**搜索范围：**
- 对话标题
- 消息内容
- 标签
- 描述

**搜索结果展示：**
- 按相关度排序
- 高亮匹配关键词
- 显示上下文片段
- 显示来源（provider / Workspace）

**Phase 2 演进：**
- 语义搜索（向量检索）
- 混合搜索（关键词 + 语义）

---

# 五、技术架构

## 5.1 技术选型

| 层 | 技术 | 选型理由 |
|----|------|----------|
| 前端框架 | React + TypeScript | 生态成熟、类型安全 |
| 桌面壳 | Electron | 跨平台、生态丰富、用户技术栈匹配（后续可评估 Tauri 减体积） |
| 构建 | Vite | 快速 HMR、用户熟悉 |
| 本地存储 | SQLite (better-sqlite3) | 嵌入式、高性能、支持 FTS5 |
| 全文搜索 | SQLite FTS5 | 零依赖、与 SQLite 一体 |
| UI 组件 | 自研轻量组件 + Tailwind CSS | 现代感、可控、暗色模式友好 |
| 状态管理 | Zustand | 轻量、TypeScript 友好 |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-highlight | 代码高亮、GFM 支持 |
| 进程通信 | Electron IPC (contextBridge) | 安全的 main↔renderer 通信 |

**为什么 MVP 选 Electron 而非 Tauri：**
- 用户技术栈为 Electron + Vite（熟练度高）
- better-sqlite3 在 Electron 下集成成熟
- MVP 优先「能跑起来」，体积优化留给后续

## 5.2 目录结构

```
aether/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
│
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # 主进程入口
│   │   ├── ipc/                       # IPC 处理器
│   │   │   ├── database.ts
│   │   │   ├── importer.ts
│   │   │   ├── search.ts
│   │   │   └── sharing.ts
│   │   └── window.ts                  # 窗口管理
│   │
│   ├── preload/                       # 预加载脚本
│   │   └── index.ts                   # contextBridge 暴露安全 API
│   │
│   ├── renderer/                      # 渲染进程（React UI）
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── pages/
│   │   │   │   ├── WorkspacePage.tsx
│   │   │   │   ├── ChatListPage.tsx
│   │   │   │   └── ChatViewPage.tsx
│   │   │   ├── components/
│   │   │   │   ├── Sidebar/           # 左侧 Workspace 树
│   │   │   │   ├── ChatList/          # 中间对话列表
│   │   │   │   ├── ChatViewer/        # 右侧对话内容
│   │   │   │   ├── SearchBar/
│   │   │   │   ├── ImportDialog/
│   │   │   │   └── ShareDialog/
│   │   │   ├── stores/                # Zustand stores
│   │   │   ├── hooks/
│   │   │   └── styles/
│   │   └── index.html
│   │
│   ├── importer/                      # 导入器（核心模块）
│   │   ├── types.ts                   # Importer 接口定义
│   │   ├── registry.ts                # 导入器注册表
│   │   ├── chatgpt/
│   │   │   ├── index.ts
│   │   │   └── parser.ts
│   │   ├── claude/
│   │   │   ├── index.ts
│   │   │   └── parser.ts
│   │   ├── gemini/
│   │   ├── deepseek/
│   │   ├── kimi/
│   │   ├── qwen/
│   │   ├── markdown/
│   │   ├── json/
│   │   └── html/
│   │
│   ├── database/                      # 数据层
│   │   ├── schema.ts                  # 建表语句
│   │   ├── connection.ts              # SQLite 连接管理
│   │   ├── migrations/                # 数据库迁移
│   │   ├── repositories/
│   │   │   ├── sessionRepo.ts         # ChatSession CRUD
│   │   │   ├── messageRepo.ts         # Message CRUD
│   │   │   ├── workspaceRepo.ts       # Workspace CRUD
│   │   │   ├── folderRepo.ts          # Folder CRUD
│   │   │   └── tagRepo.ts             # Tag CRUD
│   │   └── index.ts
│   │
│   ├── search/                        # 搜索层
│   │   ├── fts5.ts                    # FTS5 索引管理
│   │   ├── indexer.ts                 # 写入时建立索引
│   │   └── query.ts                   # 搜索查询
│   │
│   ├── workspace/                     # Workspace 业务逻辑
│   │   ├── service.ts                 # 组织/移动/排序
│   │   └── tree.ts                    # 树形结构操作
│   │
│   ├── sharing/                       # 分享层
│   │   ├── htmlExporter.ts            # 自包含 HTML 导出
│   │   ├── template.ts                # HTML 模板
│   │   └── renderer.ts                # 对话渲染为 HTML
│   │
│   ├── ai/                            # AI 增强（Phase 2 占位）
│   │   ├── summarizer.ts              # 聊天总结
│   │   ├── knowledgeExtractor.ts      # knowledge.md 生成
│   │   └── embeddings.ts              # 向量嵌入（语义搜索）
│   │
│   ├── shared/                        # 跨进程共享类型
│   │   ├── types.ts                   # ChatSession / Message 等类型
│   │   └── constants.ts
│   │
│   └── types/                         # 全局类型定义
│
├── resources/                         # 静态资源（图标等）
└── tests/
```

## 5.3 模块职责

### importer（导入器）

```
职责：把各平台原始导出文件 → 统一 ChatSession[]
边界：只做「解析 + 转换」，不直接写库（由 database 层写入）
接口：
  interface Importer {
    provider: string
    detect(file: File): boolean        // 是否能处理该文件
    parse(content: string): ChatSession[]
  }
扩展点：新增平台只需新增一个子目录 + 注册到 registry
```

### database（数据层）

```
职责：SQLite 连接、Schema、CRUD、迁移
边界：唯一接触 SQLite 的层，向上暴露 Repository 接口
关键：使用 better-sqlite3 同步 API，事务友好
```

### search（搜索层）

```
职责：FTS5 索引建立 + 搜索查询
边界：依赖 database 的写入事件触发索引更新
MVP：关键词全文搜索
Phase 2：向量检索（_embeddings.ts）
```

### workspace（组织层）

```
职责：Workspace/Folder/Session 的树形组织、拖拽、排序
边界：业务逻辑层，调用 repository 完成持久化
```

### sharing（分享层）

```
职责：把 ChatSession 渲染为自包含 HTML 文件
边界：纯输出，不涉及网络（MVP）
关键：HTML 内联 CSS/JS，单文件可离线打开
```

### ai（AI 增强，Phase 2）

```
职责：聊天总结、knowledge.md 生成、向量嵌入
边界：可选模块，MVP 不依赖
关键：通过本地模型或可配置 API Key 调用
```

## 5.4 进程架构

```
┌──────────────────────────────────────────────────────────┐
│  Renderer Process (React UI)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Sidebar  │  │ ChatList │  │ChatViewer│               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       └─────────────┴─────────────┘                      │
│                     │ window.aether.* (preload bridge)   │
└─────────────────────┼────────────────────────────────────┘
                      │ IPC (contextBridge)
┌─────────────────────┼────────────────────────────────────┐
│  Main Process       ▼                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ importer │  │ database │  │  search  │  │ sharing  │ │
│  └──────────┘  └────┬─────┘  └──────────┘  └──────────┘ │
│                     │                                    │
│                     ▼                                    │
│              ┌─────────────┐                             │
│              │  SQLite DB  │  (用户数据目录)             │
│              └─────────────┘                             │
└──────────────────────────────────────────────────────────┘
```

**IPC 安全原则：**
- 所有 Node 能力通过 `preload` 的 `contextBridge` 暴露
- Renderer 只能调用白名单 API，无法直接访问 fs/SQLite
- 文件操作在主进程完成，结果通过 IPC 返回

---

# 六、数据模型

## 6.1 统一数据模型（核心）

### ChatSession（对话会话）

```typescript
interface ChatSession {
  id: string              // UUID，Aether 内部主键
  sourceId?: string       // 原平台的对话 ID（用于幂等导入）
  provider: Provider      // 来源平台
  model?: string          // 模型名称（如 gpt-4o / claude-3.5-sonnet）
  title: string           // 对话标题
  description?: string    // 用户自定义描述
  createdAt: string       // ISO 时间戳
  updatedAt: string       // 最后更新时间
  messageCount: number    // 消息数
  folderId?: string       // 所属文件夹
  isFavorite: boolean     // 是否收藏
  tags: Tag[]             // 标签（多对多）
  messages: Message[]     // 消息列表
}

type Provider =
  | 'ChatGPT' | 'Claude' | 'Gemini' | 'DeepSeek'
  | 'Kimi' | 'Qwen' | 'Cursor' | 'ClaudeCode'
  | 'Codex' | 'OpenCode' | 'Markdown' | 'JSON' | 'HTML' | 'Unknown'
```

### Message（消息）

```typescript
interface Message {
  id: string
  sessionId: string       // 所属对话
  role: MessageRole       // 角色
  content: string         // 内容（Markdown 原文）
  model?: string          // 该消息使用的模型（支持对话中切换模型）
  createdAt: string       // 消息时间
  tokens?: number         // token 数（若原平台提供）
  attachments?: Attachment[]  // 附件（图片/文件）
  order: number           // 在对话中的顺序
}

type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

interface Attachment {
  id: string
  type: 'image' | 'file'
  filename: string
  mimeType: string
  data?: string           // base64（小文件）或文件路径（大文件）
}
```

### Workspace（工作区）

```typescript
interface Workspace {
  id: string
  name: string
  description?: string
  color?: string          // 主题色
  icon?: string
  createdAt: string
  updatedAt: string
  sortOrder: number
}
```

### Folder（文件夹）

```typescript
interface Folder {
  id: string
  workspaceId: string
  parentId?: string       // 支持嵌套（MVP 可限 2 层）
  name: string
  createdAt: string
  updatedAt: string
  sortOrder: number
}
```

### Tag（标签）

```typescript
interface Tag {
  id: string
  name: string
  color?: string
  createdAt: string
}
```

## 6.2 SQLite Schema

```sql
-- 工作区
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 文件夹（支持嵌套）
CREATE TABLE folders (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_folders_workspace ON folders(workspace_id);

-- 对话会话
CREATE TABLE chat_sessions (
  id            TEXT PRIMARY KEY,
  source_id     TEXT,                    -- 原平台对话 ID
  provider      TEXT NOT NULL,
  model         TEXT,
  title         TEXT NOT NULL,
  description   TEXT,
  folder_id     TEXT REFERENCES folders(id) ON DELETE SET NULL,
  is_favorite   INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  imported_at   TEXT NOT NULL
);
CREATE INDEX idx_sessions_folder ON chat_sessions(folder_id);
CREATE INDEX idx_sessions_provider ON chat_sessions(provider);
CREATE INDEX idx_sessions_favorite ON chat_sessions(is_favorite);
CREATE INDEX idx_sessions_source ON chat_sessions(source_id);

-- 消息
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  model       TEXT,
  tokens      INTEGER,
  msg_order   INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id);

-- 附件
CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  file_path   TEXT                       -- 本地存储路径
);

-- 标签
CREATE TABLE tags (
  id    TEXT PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL
);

-- 对话-标签 关联（多对多）
CREATE TABLE session_tags (
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

-- FTS5 全文索引（标题 + 内容）
CREATE VIRTUAL TABLE chat_fts USING fts5(
  session_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'                 -- 支持中文需额外配置（如 simple 或 jieba）
);
```

## 6.3 FTS5 中文支持说明

SQLite FTS5 默认 `unicode61` 分词器对中文支持有限（按字符切分）。MVP 方案：

- **方案 A（推荐 MVP）**：使用 `unicode61 remove_diacritics 2` + 按字符索引，覆盖简单中文搜索
- **方案 B（后续优化）**：集成 `simple` 分词器或自建 jieba 预分词后写入 FTS

> 真正的中文语义搜索留给 Phase 2 的向量检索。

---

# 七、UI 设计

## 7.1 设计语言

**参考标杆：** Linear / Notion / Obsidian / Arc Browser

**关键词：** 现代、克制、信息密度高、暗色优先、键盘友好

**避免：** 传统文件管理器质感、过度装饰、 Material Design 的强阴影

## 7.2 三栏布局

```
┌─────────────┬────────────────────┬───────────────────────────────┐
│  左栏       │  中栏               │  右栏                          │
│  Workspace  │  Chat List          │  Chat Viewer                   │
│             │                     │                                │
│ ⌘K 搜索框   │  筛选: 全部/收藏/标签│  💬 Electron IPC 设计方案      │
│             │                     │  Claude · claude-3.5 · 07-29   │
│ 📁 Aether   │  ┌──────────────┐  │  ─────────────────────────────│
│  ├ Claude   │  │ 💬 IPC 设计   │  │  👤 user:                     │
│  ├ ChatGPT  │  │ Claude · 07-29│  │  如何设计 Electron IPC...     │
│  └ DeepSeek │  └──────────────┘  │                                │
│             │  ┌──────────────┐  │  🤖 assistant:                │
│ 📁 个人学习 │  │ 💬 数据模型   │  │  Electron IPC 分为...         │
│             │  │ Claude · 07-28│  │  ```ts                        │
│ [+ 新建]    │  └──────────────┘  │  ipcMain.handle(...)          │
│             │                     │  ```                           │
│ ⚙ 设置      │  [+ 导入对话]       │                                │
└─────────────┴────────────────────┴───────────────────────────────┘
```

## 7.3 左栏：Workspace 导航

- 顶部：全局搜索框（`⌘K` / `Ctrl+K` 唤起）
- Workspace 列表（可折叠）
  - 每个 Workspace 显示文件夹树
  - 支持拖拽排序
- 底部：设置入口

## 7.4 中栏：对话列表

- 顶部工具栏：筛选（全部 / 收藏 / 按 provider / 按标签）
- 对话卡片：
  - 标题
  - provider 图标 + 名称
  - 时间
  - 标签 chips
  - 收藏星标
- 支持多选、批量移动、批量删除

## 7.5 右栏：对话查看器

- 顶部：对话元信息（provider / model / 时间 / 标签 / 描述）
- 主体：消息流
  - 用户消息 / 助手消息视觉区分
  - Markdown 渲染 + 代码高亮
  - 代码块支持复制
  - 消息时间戳（hover 显示）
- 右上角操作：分享 / 编辑信息 / 删除

## 7.6 暗色模式

- 默认暗色（符合开发者审美）
- 支持跟随系统 / 强制暗色 / 强制亮色
- CSS 变量驱动，无硬编码颜色

## 7.7 交互细节

- `⌘K` / `Ctrl+K`：全局搜索
- `⌘N` / `Ctrl+N`：新建对话（手动创建）
- `⌘I` / `Ctrl+I`：导入对话
- `⌘S` / `Ctrl+S`：分享当前对话
- 拖拽：文件直接拖入窗口触发导入
- 右键菜单：Workspace / Folder / Session 上下文操作

---

# 八、开发路线

## Phase 1：MVP（v0.1）

**目标：跑通「导入 → 组织 → 搜索 → 分享」闭环**

| 功能 | 技术难度 | 优先级 |
|------|----------|--------|
| Electron + Vite + React 工程脚手架 | 低 | P0 |
| SQLite 数据层 + Schema + 迁移 | 中 | P0 |
| 统一数据模型 + 类型定义 | 中 | P0 |
| ChatGPT 导入器 | 中 | P0 |
| Claude 导入器 | 中 | P0 |
| Markdown / JSON 通用导入器 | 低 | P0 |
| Workspace / Folder 树形管理 | 中 | P0 |
| 对话列表 + 查看器 UI | 中 | P0 |
| FTS5 全文搜索 | 中 | P0 |
| 暗色模式 + 主题 | 低 | P1 |
| 自包含 HTML 分享导出 | 中 | P1 |
| Gemini / DeepSeek / Kimi / 通义导入器 | 中 | P1 |
| 拖拽导入 + 导入进度 | 低 | P1 |
| 设置页（数据目录/主题/关于） | 低 | P2 |

**Phase 1 交付物：** 可安装的桌面应用，用户能导入 ChatGPT/Claude 对话，组织到 Workspace，全文搜索，导出分享 HTML。

## Phase 2：AI 增强（v0.5）

**目标：从「存储」升级为「知识」**

| 功能 | 技术难度 | 优先级 |
|------|----------|--------|
| 聊天自动总结（摘要 / 关键决定 / 待办） | 中 | P0 |
| 自动生成 knowledge.md（知识沉淀） | 中 | P0 |
| 语义搜索（向量嵌入 + 相似度检索） | 高 | P0 |
| 向量数据库集成（sqlite-vss 或本地向量库） | 高 | P0 |
| 可配置 AI API Key（OpenAI/Claude/本地模型） | 中 | P1 |
| 对话智能打标签 | 中 | P1 |
| 跨对话知识关联（相关讨论推荐） | 高 | P1 |
| 批量 AI 处理（总结多个对话） | 中 | P2 |
| 导出为 Notion / Obsidian | 中 | P2 |

**Phase 2 交付物：** AI 自动总结对话、生成知识卡片、支持语义搜索「找相似讨论」。

## Phase 3：生态（v1.0）

**目标：从「工具」升级为「平台」**

| 功能 | 技术难度 | 优先级 |
|------|----------|--------|
| Project Memory 智能问答（基于历史对话回答项目问题） | 高 | P0 |
| `aether.chat` 在线分享托管（可选上传） | 高 | P0 |
| 账号系统 + 云端同步（端到端加密） | 高 | P1 |
| 浏览器插件（一键采集网页对话） | 中 | P1 |
| Cursor / VSCode 插件（IDE 内查看项目记忆） | 中 | P1 |
| 协作 Workspace（团队共享） | 高 | P2 |
| 开放 API / 插件系统 | 高 | P2 |
| 移动端只读查看 | 中 | P2 |

**Phase 3 交付物：** 可问答的 AI 项目记忆系统 + 在线分享平台 + 生态插件。

---

# 九、风险分析

## 9.1 技术风险

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|----------|
| 各平台导出格式不稳定/变更 | 导入器失效 | 中 | Importer 接口解耦 + 版本化 + 单测覆盖 |
| FTS5 中文分词效果差 | 搜索体验差 | 高 | MVP 接受字符级搜索，Phase 2 向量检索兜底 |
| Electron 包体积过大 | 用户体验 | 中 | 后续评估 Tauri 迁移；MVP 先用 Electron |
| 大量对话时 SQLite 性能 | 卡顿 | 低 | 分页加载 + 索引优化 + 虚拟滚动 |
| 向量检索本地化复杂 | Phase 2 延期 | 中 | 优先支持 API 模型嵌入，本地嵌入作为可选 |

## 9.2 市场风险

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 用户习惯「在平台内看历史」 | 采用率低 | 用「跨平台 + 搜索 + 分享」的明确差异化打动重度用户 |
| AI 平台自己做知识管理 | 被上游挤压 | Aether 的价值在「跨平台」，单一平台无法替代 |
| 通用笔记工具加 AI 对话支持 | 被替代 | 深耕 AI 对话结构理解 + 导入器矩阵壁垒 |

## 9.3 法律与合规风险

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 导入对话含敏感信息 | 隐私问题 | Local-First，数据不离开本地；分享时用户主动选择 |
| 各平台导出条款限制 | 导入合规 | 只处理用户自己导出的数据，不抓取平台接口 |
| 分享内容版权 | 纠纷 | 分享内容归用户负责；Aether 仅提供工具 |

## 9.4 产品风险

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 功能蔓延，MVP 做太大 | 难以交付 | 严格限定 MVP 为「导入→组织→搜索→分享」 |
| AI 增强喧宾夺主 | 偏离定位 | AI 增强 Phase 2 才做，且保持可选不强制依赖 |
| 过度设计架构 | 开发慢 | MVP 只实现必要模块，ai/ 目录留空占位 |

---

# 十、未来方向

## 10.1 商业化可能性

| 模式 | 说明 | 阶段 |
|------|------|------|
| 开源 + 本地免费 | 建立用户基础与信任 | Phase 1-2 |
| 云同步订阅 | 端到端加密的跨设备同步 | Phase 3 |
| 在线分享托管 | `aether.chat` 高级托管（自定义域名/统计） | Phase 3 |
| 团队协作版 | 团队共享 Workspace、权限管理 | Phase 3+ |
| 企业版 | 私有部署、SSO、审计日志 | 生态期 |
| AI 增强付费 | 高级 AI 总结/知识图谱/智能问答 | Phase 2+ |

**核心原则：** Local-First 功能永远免费，云端与协作功能订阅化。

## 10.2 生态愿景

```
                    ┌─────────────────┐
                    │  Aether Core    │
                    │  (本地知识库)    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  导入器生态     │  │  输出/集成生态   │  │  插件生态        │
│  (各 AI 平台)   │  │  (Notion/        │  │  (浏览器/IDE/    │
│                │  │   Obsidian/      │  │   自定义)        │
│                │  │   Logseq)        │  │                  │
└────────────────┘  └─────────────────┘  └──────────────────┘
                             │
                    ┌────────▼────────┐
                    │  aether.chat    │
                    │  分享平台        │
                    │  (AI 知识 Gist)  │
                    └─────────────────┘
```

## 10.3 终极形态：AI 时代的「第二大脑」

Aether 的终局不是「聊天记录管理器」，而是：

> **AI 时代的个人/团队知识操作系统**
>
> 所有 AI 对话自动流入 → 自动结构化 → 自动总结为知识 → 可搜索可问答可分享 → 成为你的「AI 记忆外脑」

当用户问「为什么这个项目用 SQLite？」时，Aether 能回答：

```
📖 来源：2026-07-29 Claude 讨论「Aether 数据层设计」
💡 原因：Local-First 设计要求嵌入式数据库；FTS5 一体化支持全文搜索
🎯 关键决策者：用户 × Claude
🔗 相关讨论：2026-07-30 DeepSeek「SQLite vs DuckDB 对比」
```

---

# 附录：MVP 开发优先级速览

```
Week 1-2: 工程脚手架 + 数据层 + 统一数据模型
Week 3-4: ChatGPT + Claude + Markdown 导入器
Week 5-6: Workspace 树 + 对话列表 + 对话查看器 UI
Week 7:   FTS5 搜索 + 搜索结果页
Week 8:   自包含 HTML 分享 + 暗色模式 + 打磨
Week 9:   Gemini/DeepSeek/Kimi/通义导入器
Week 10:  内测 + Bug 修复 → v0.1 发布
```

---

*本文档为 Aether v0.1 设计草案，将随开发迭代持续更新。*
