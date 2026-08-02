<div align="center">

<!-- Hero Banner -->
<img src="assets/banner.svg" width="600" alt="Memora - Personal AI Knowledge Vault"/>

<p>
  <strong>Your AI remembers you forever. Switch models, keep yourself.</strong><br/>
  <sub>换 AI，不换人生积累 — 无论你换多少次模型、多少个平台</sub>
</p>

<!-- Badges -->
<p>
  <img src="https://img.shields.io/badge/version-1.12-6366f1?style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/Electron-39-47848F?style=flat-square" alt="Electron"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/SQLite-FTS5-003B57?style=flat-square" alt="SQLite"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/Local_First-%E2%9C%93-6366f1?style=flat-square" alt="Local First"/>
  <img src="https://img.shields.io/badge/MCP-30_tools-6366f1?style=flat-square" alt="MCP Tools"/>
</p>

<!-- Language Switcher -->
<p>
  <a href="#english">English</a> ·
  <a href="#中文">中文</a>
</p>

<!-- Quick Nav -->
<p>
  <a href="#the-problem">Problem</a> ·
  <a href="#killer-features">Features</a> ·
  <a href="#why-memora">Why Memora</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a>
</p>

</div>

---

## AI Development Notice

> **90%+ of this project's code is AI-generated and has not undergone manual security audit.** Please evaluate the risk yourself before using it to manage sensitive conversations. See [AI Development Statement](docs/AI_DEVELOPMENT.md).

---

<a id="english"></a>

## The Problem

> AI models are getting smarter, but your **memory is getting more fragmented**.

You use ChatGPT, Claude, Cursor, DeepSeek, Kimi... each platform is an isolated data silo. Switch AI and you start from scratch — re-explaining who you are, what you do, what you like.

**ChatGPT Memory, Mem0, and others solve "storage". Nobody solves "identity".**

Memora is not another chat log manager. It's an **AI Identity Layer** — letting you be yourself in front of any AI.

```
Before:                               After Memora:

"Who are you?"                        "Hi! I know you're a full-stack developer
"I don't know"                         working on Memora,
"Let's start from scratch"             using Electron + React + SQLite,
                                        you prefer concise code style,
                                        last time you chose SQLite for local-first.
                                        Continue where we left off?"
```

---

## Killer Features

### 1. One-Click AI Identity Profile

Automatically generates a **complete AI persona profile** from your preferences, knowledge base, and conversation history:

```markdown
# My AI Identity Profile

## About Me
- Full-stack developer
- Prefers TypeScript and Rust

## Tech Stack
- Electron, React, SQLite, Tailwind

## Communication Preferences
- Concise, direct answers
- Markdown format
- No over-explanation

## Projects
- Memora — Personal AI Memory System
- ...
```

**Copy once, paste into any new AI conversation — switch AI, keep your identity.**

### 2. 30 MCP Tools — The iCloud for AI

Not just read/write, but **understanding-based memory**:

| Type | Tool | What It Does |
|------|------|-------------|
| Recall | `memory_recall` | Semantic search across history |
| Write | `memory_write` | Distill knowledge into the knowledge base |
| Profile | `memory_profile` | Get complete user preferences |
| **Explain** | `memory_explain` | **Why this memory? Confidence, source, frequency** |
| **Timeline** | `memory_timeline` | **How preferences evolved over time** |
| **Diff** | `memory_diff` | **What changed between then and now?** |

Plug into Claude Code / Cursor / OpenCode / AstrBot — AI instantly has your full memory.

### 3. Memory Security Center

```
Encryption       safeStorage available
                 3 API Keys encrypted

Sensitive Info   12 items detected
                 3 API Keys · 2 phone numbers · 7 emails

Recommendations  Enable auto-redaction on import
                 Back up database regularly
```

### 4. Memory Lifecycle — Grows Like a Brain

```
Preference Tracking:   Python ━━━━ 80%  →  Rust ━━━━ 75%
Conflict Detection:    New vs old auto-detected → old marked superseded → new marked active
Confidence Decay:      30 days unaccessed → confidence -0.1 → below 0.05 auto-archived
```

---

## Why Memora?

| | ChatGPT Memory | Mem0 | Memora |
|---|:---:|:---:|:---:|
| Local Data Storage | No | No | **Yes** |
| Cross-Platform Memory | ChatGPT only | API integration | **11+ platforms** |
| Preference Lifecycle | None | None | **Create → Conflict → Decay → Forget** |
| AI Identity Profile | None | None | **One-click + portable** |
| Explainable Memory | None | None | **memory_explain** |
| MCP Ecosystem | None | None | **30 tools** |
| E2E Encryption | — | — | **AES-256-GCM** |
| Open Source | No | No | **MIT** |

---

## Core Features

### Smart Import Center
Auto-detects local AI apps, one-click extraction: Cursor, Claude Code, OpenCode, Windsurf, Cline + 11 format imports.

### Full-Text + Semantic Search
SQLite FTS5 keyword search + vector semantic retrieval, sub-millisecond response.

### Knowledge Base
Distill conversations into structured knowledge/decisions/tasks — searchable, linkable, reusable.

### Memory Version Control
Git for Memory — every change generates commit + diff, with blame tracing and version rollback.

### Custom Distillation Templates
Define your own distillation format (Background → Options → Decision → Rationale), per-project strategies.

### Export Formats
MMF (Memora Memory Format) — full preferences + knowledge + conversations, importable to other instances.

### Memory Agent
Periodically scans your memory library, proactively finds knowledge gaps, reminds you to summarize, spaced repetition.

### E2E Encrypted Cloud Sync
AES-256-GCM encryption, zero-knowledge sync, cross-device usage.

### More
- Team Memory Sharing (collaborative workspace + visibility control + comments)
- Memory Time Capsule (seal memories, unlock in the future with comparison report)
- Memory Template Market (community "expert memory packs")
- AI Migration Wizard (3-step migration + multi-platform sync)
- MCP Permission System (per-client granularity authorization)

---

## Performance

| Conversations | Index Build | Search Latency |
|-------:|--------:|--------:|
| 1,000  | 114 ms  | 0.22 ms |
| 5,000  | 360 ms  | 0.41 ms |
| 10,000 | 837 ms  | 0.21 ms |

---

## Quick Start

```bash
npm install
npm run dev
```

### MCP Integration

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

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Renderer (React 18)                                │
│  Sidebar · ChatList · ChatViewer · 30+ panels       │
│  window.Memora.* (preload bridge)                   │
└─────────────────┬───────────────────────────────────┘
                  │ IPC
┌─────────────────┴───────────────────────────────────┐
│  Main Process                                       │
│  importer · database · search · ai · mcp            │
│  identity · security · sync · capsule · team        │
│  └── SQLite (FTS5 + vectors)                        │
└─────────────────────────────────────────────────────┘
```

| Layer | Technology |
|----|------|
| Frontend | React 18 + TypeScript 5.7 |
| Desktop | Electron 39 |
| Build | Vite + electron-vite |
| Storage | SQLite (better-sqlite3) + FTS5 |
| State | Zustand |
| Styling | Tailwind CSS |

---

## Core Principles

> **Your data belongs to you. Tools serve you.**
> **Switch AI, keep your accumulated knowledge.**

- **Local-First** — Data stored locally, works offline
- **Privacy-First** — Data never leaves your device unless you choose to share
- **AI Native** — Data model designed specifically for AI memory
- **Open Source** — MIT license, transparent and auditable

---

<a id="中文"></a>

# 中文文档

## 痛点

> AI 模型越来越强，但**记忆越来越碎**。

你用 ChatGPT、Claude、Cursor、DeepSeek、Kimi……每个平台都是独立的数据孤岛。换一个 AI 就得从头解释你是谁、做什么、喜欢什么。

**ChatGPT Memory、Mem0 都在解决"存储"问题，但没人解决"你是谁"的问题。**

Memora 不是又一个聊天记录管理器。它是一个 **AI 身份层** — 让你在任何 AI 面前都能做自己。

---

## 杀手级功能

### 一键 AI 身份画像

从你的偏好、知识库、对话历史中自动生成**完整的 AI 人格画像**，一键复制到任何新 AI 对话。

### 30 个 MCP 工具

不只是读写，而是**理解型记忆**：
- `memory_explain` — 解释为什么返回这条记忆
- `memory_timeline` — 用户偏好如何随时间变化
- `memory_diff` — 过去和现在有什么不同

接入 Claude Code / Cursor / OpenCode / AstrBot，AI 即刻拥有你的全部记忆。

### 记忆安全中心

加密状态检查、敏感信息扫描（API Key / Token / 手机号 / 邮箱）、智能安全建议。

### 记忆生命周期

偏好追踪、冲突检测、置信度衰减 — 像人脑一样成长。

---

## 核心功能一览

| 功能 | 说明 |
|------|------|
| 智能导入中心 | 自动检测本地 AI 应用，支持 Cursor / Claude Code / OpenCode 等 + 11 种格式 |
| 全文 + 语义搜索 | SQLite FTS5 + 向量语义检索，毫秒级响应 |
| 知识库 | 对话蒸馏为结构化知识/决策/任务 |
| 记忆版本控制 | Git for Memory — commit + diff + 回滚 |
| 蒸馏模板 | 自定义格式，按项目设定策略 |
| MMF 导出 | 完整偏好+知识+对话，可导入其他实例 |
| 记忆智能体 | 知识缺口检测、间隔重复复习 |
| 端到端加密云同步 | AES-256-GCM，零知识同步 |
| 团队记忆共享 | 协作 Workspace + 可见性控制 + 评论 |
| 记忆时间胶囊 | 封存记忆，未来开启时生成对比报告 |
| 模板市场 | 社区"专家记忆包"导入导出 |
| AI 迁移向导 | 三步迁移 + 多平台同步 |
| MCP 权限系统 | 按客户端粒度授权 |

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
