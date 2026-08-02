<div align="center">

<!-- Hero：书架 M 品牌视觉 -->
<img src="assets/banner.svg" width="600" alt="Memora - Personal AI Knowledge Vault"/>

<p>
  <strong>换 AI，不换人生积累。</strong><br/>
  你的 AI 应该永远记得你 — 无论你换多少次模型、多少个平台。
</p>

<!-- 徽章 -->
<p>
  <img src="https://img.shields.io/badge/version-1.12-6366f1" alt="version"/>
  <img src="https://img.shields.io/badge/Electron-39-47848F" alt="Electron"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/SQLite-FTS5-003B57" alt="SQLite"/>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License"/>
  <img src="https://img.shields.io/badge/Local_First-&#x2713;-6366f1" alt="Local First"/>
  <img src="https://img.shields.io/badge/MCP-30_tools-6366f1" alt="MCP Tools"/>
</p>

<p>
  <a href="#痛点">痛点</a> ·
  <a href="#杀手级功能">杀手级功能</a> ·
  <a href="#为什么选择-memora">为什么 Memora</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#架构">架构</a>
</p>

</div>

---

## ⚠️ AI 项目声明

> **本项目 90%+ 代码由 AI 生成，未经人工安全审计。** 用于管理敏感对话前请自行评估风险。详见 [AI 开发声明](docs/AI_DEVELOPMENT.md)。

---

## 痛点

> AI 模型越来越强，但**记忆越来越碎**。

你用 ChatGPT、Claude、Cursor、DeepSeek、Kimi……每个平台都是独立的数据孤岛。换一个 AI 就得从头解释你是谁、做什么、喜欢什么。

**ChatGPT Memory、Mem0、OpenClaw 都在解决"存储"问题，但没人解决"你是谁"的问题。**

Memora 不是又一个聊天记录管理器。它是一个 **AI 身份层** — 让你在任何 AI 面前都能做自己。

```
Before:                               After Memora:

"你是谁？"                            "你好，我知道你是全栈开发者，
"不知道"                              正在做 Memora 项目，
"从头开始吧"                          技术栈是 Electron + React + SQLite，
                                      偏好简洁的代码风格，
                                      上次决定用 SQLite 是因为本地优先。
                                      继续上次的工作？"
```

---

## 杀手级功能

### 一键 AI 身份画像

从你的偏好、知识库、对话历史中自动生成**完整的 AI 人格画像**：

```
# My AI Identity Profile

## About Me
- 全栈开发者
- 偏好 TypeScript 和 Rust

## Tech Stack
- Electron, React, SQLite, Tailwind

## Communication Preferences
- 简洁直接的回复
- 使用 Markdown 格式
- 避免过度解释

## Projects
- Memora — 个人 AI 记忆系统
- ...
```

**一键复制，粘贴到任何新 AI 对话开头 — 换 AI，不换人设。**

### 30 个 MCP 工具 — AI 世界的 iCloud

不只是读写，而是**理解型记忆**：

| 类型 | 工具 | 用途 |
|------|------|------|
| 召回 | `memory_recall` | 语义搜索历史讨论 |
| 写入 | `memory_write` | 沉淀知识到知识库 |
| 画像 | `memory_profile` | 获取用户完整偏好 |
| **解释** | `memory_explain` | **为什么返回这条记忆？置信度、来源、频率** |
| **时间线** | `memory_timeline` | **用户偏好如何随时间变化？** |
| **对比** | `memory_diff` | **过去和现在有什么不同？** |

接入 Claude Code / Cursor / OpenCode / AstrBot，AI 即刻拥有你的全部记忆。

### 记忆安全中心

```
加密状态      safeStorage 可用
              3 个 API Key 已加密

敏感信息      检测到 12 处
              3 个 API Key · 2 个手机号 · 7 个邮箱

建议          导入时启用自动脱敏
              定期备份数据库
```

### 记忆生命周期 — 像人脑一样成长

```
偏好追踪:      Python ━━━━ 80%  →  Rust ━━━━ 75%
冲突检测:      新旧偏好自动发现 → 旧标记 superseded → 新标记 active
置信度衰减:    30 天未访问 → confidence -0.1 → 低于 0.05 自动归档
```

---

## 为什么选择 Memora 而不是 ChatGPT Memory / Mem0？

| | ChatGPT Memory | Mem0 | Memora |
|---|:---:|:---:|:---:|
| 数据本地存储 | 否 | 否 | **是** |
| 跨平台记忆 | 仅 ChatGPT | API 集成 | **11+ 平台导入** |
| 偏好生命周期 | 无 | 无 | **创建 → 冲突 → 衰减 → 遗忘** |
| AI 身份画像 | 无 | 无 | **一键生成 + 可复制** |
| 记忆可解释 | 无 | 无 | **memory_explain** |
| MCP 生态 | 无 | 无 | **30 个工具** |
| 端到端加密 | — | — | **AES-256-GCM** |
| 开源 | 否 | 否 | **MIT** |

---

## 核心功能

### 智能导入中心
自动检测本地 AI 应用，一键扒取：Cursor、Claude Code、OpenCode、Windsurf、Cline + 11 种格式导入。

### 全文 + 语义搜索
SQLite FTS5 关键词搜索 + 向量语义检索，毫秒级响应。

### 知识库
将对话蒸馏为结构化的知识/决策/任务，可独立搜索、关联、复用。

### 记忆版本控制
Git for Memory — 每次变更生成 commit + diff，支持 blame 追溯、版本回滚。

### 可定制蒸馏模板
自定义蒸馏格式（背景 → 方案 → 决策 → 理由），按项目设定不同策略。

### 导出格式扩展
MMF（Memora Memory Format）— 完整偏好+知识+对话，可导入其他实例。

### 记忆智能体
定期扫描记忆库，主动发现知识缺口、提醒总结、间隔重复复习。

### 端到端加密云同步
AES-256-GCM 加密，零知识同步，跨设备使用。

### 更多
- 团队记忆共享（协作 Workspace + 可见性控制 + 评论）
- 记忆时间胶囊（封存记忆，未来开启时生成对比报告）
- 记忆模板市场（社区"专家记忆包"导入导出）
- AI 迁移向导（三步迁移流程 + 多平台双向同步）
- MCP 权限系统（按客户端粒度授权）

---

## 性能 Benchmark

| 对话数 | 索引构建 | 搜索延迟 |
|-------:|--------:|--------:|
| 1,000  | 114 ms  | 0.22 ms |
| 5,000  | 360 ms  | 0.41 ms |
| 10,000 | 837 ms  | 0.21 ms |

---

## 快速开始

```bash
npm install
npm run dev
```

### MCP 接入

```json
{
  "mcpServers": {
    "Memora": {
      "command": "node",
      "args": ["/path/to/Memora/out/main/index.js", "--mcp"]
    }
  }
}
```

---

## 架构

```
┌─────────────────────────────────────────────────┐
│  Renderer (React 18)                            │
│  Sidebar · ChatList · ChatViewer · 30+ 面板     │
│  window.Memora.* (preload bridge)               │
└─────────────────┬───────────────────────────────┘
                  │ IPC
┌─────────────────┴───────────────────────────────┐
│  Main Process                                   │
│  importer · database · search · ai · mcp        │
│  identity · security · sync · capsule · team    │
│  └── SQLite (FTS5 + 向量)                       │
└─────────────────────────────────────────────────┘
```

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript 5.7 |
| 桌面 | Electron 39 |
| 构建 | Vite + electron-vite |
| 存储 | SQLite (better-sqlite3) + FTS5 |
| 状态 | Zustand |
| 样式 | Tailwind CSS |

---

## 核心原则

> **数据归你所有，工具为你服务。**
> **换 AI，不换人生积累。**

- **Local-First** — 数据存储在本地，离线可用
- **Privacy-First** — 数据不离开本地，分享由你主动选择
- **AI Native** — 为 AI 记忆量身设计的数据模型
- **开源** — MIT 协议，代码透明可审计

---

## License

[MIT](LICENSE)

---

<div align="center">

<sub>Built with Electron · React · TypeScript · SQLite</sub><br/>
<sub>2026 Memora — Your AI remembers you forever.</sub>

</div>