<div align="center">

<!-- Hero Banner -->
<img src="assets/banner.svg" width="600" alt="Memora - Personal AI Knowledge Vault"/>

<p>
  <strong>Your memory, not your tools. Switch AI, keep your accumulated life.</strong><br/>
  <sub>换 AI，不换人生积累 — 无论你换多少次模型、多少个平台</sub>
</p>

<!-- Badges -->
<p>
  <img src="https://img.shields.io/badge/version-1.14.0-6366f1?style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/Electron-39-47848F?style=flat-square" alt="Electron"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/SQLite-FTS5-003B57?style=flat-square" alt="SQLite"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/Local_First-%E2%9C%93-6366f1?style=flat-square" alt="Local First"/>
  <img src="https://img.shields.io/badge/MCP-32_tools-6366f1?style=flat-square" alt="MCP Tools"/>
</p>

<!-- Language Switcher -->
<p>
  <strong>English</strong> · <a href="./README.zh-CN.md">中文</a>
</p>

<!-- Quick Nav -->
<p>
  <a href="#the-problem">Problem</a> ·
  <a href="#demo">Demo</a> ·
  <a href="#killer-features">Features</a> ·
  <a href="#why-memora">Why Memora</a> ·
  <a href="#comparison">Comparison</a> ·
  <a href="#core-features">Core Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a>
</p>

</div>

---

## AI Development Notice

> **90%+ of this project's code is AI-generated and has not undergone manual security audit.** Please evaluate the risk yourself before using it to manage sensitive conversations. See [AI Development Statement](docs/AI_DEVELOPMENT.md).

---

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

## Demo

### MCP: AI instantly knows your preferences

Every result below is **real output** captured by driving Memora's actual MCP tools against a fresh local database (`scripts/demo-mcp.js`).

```bash
# 1. Start Memora with MCP server
$ node out/main/index.js --mcp

# 2. In Claude Code / Cursor / OpenCode, AI calls memory_profile:
> memory_profile({ workspaceId: "3a15..." })

{
  "workspaceId": "3a15b8e1-da21-4a5f-a83b-18b74d0419ef",
  "totalPreferences": 5,
  "activePreferences": 4,
  "bySubject": [
    { "subject": "architecture", "value": "Local-First，数据留在本地设备", "confidence": 0.95 },
    { "subject": "editor",       "value": "VSCode + Cursor", "confidence": 0.85 },
    { "subject": "language",     "value": "Rust，最近在学系统编程", "confidence": 0.68 },
    { "subject": "tech stack",   "value": "Electron + React + TypeScript，本地优先架构", "confidence": 0.92 }
  ]
}

# 3. Search a specific preference:
> preference_search({ query: "tech stack", workspaceId: "3a15..." })

[
  {
    "subject": "tech stack",
    "value": "Electron + React + TypeScript，本地优先架构",
    "confidence": 0.92,
    "status": "active",
    "source": "mcp"
  }
]

# 4. Explain WHY Memora holds this memory (source tracing + evidence chain):
> memory_explain({ query: "tech stack", workspaceId: "3a15..." })

{
  "query": "tech stack",
  "matchCount": 1,
  "explanations": [
    {
      "subject": "tech stack",
      "value": "Electron + React + TypeScript，本地优先架构",
      "confidence": 0.92,
      "reasons": ["高置信度（多次确认）", "最初记录于 2026/8/7"],
      "source": "mcp",
      "status": "active"
    }
  ],
  "summary": "找到 1 条相关记忆。高置信度（多次确认）；最初记录于 2026/8/7"
}
```

> Regenerate this demo anytime with `npm run build && npm run demo` — outputs land in `demo/output/memory-demo.json`.

### One-command "switch AI" loop — your memory follows you

Import conversations → distill preferences → export a portable memory package → **switch to a new AI** → inject memory → the new AI instantly knows you. All real MCP output.

```bash
# ① Before switching: a fresh new AI has NO memory of you
> memory_profile({ workspaceId: "5806..." })          # new AI workspace
{ "workspaceId": "5806...", "totalPreferences": 0, "activePreferences": 0, "bySubject": [] }

# ② Export the portable memory package (old AI's profile)
> memory_profile({ workspaceId: "36db..." })         # old AI workspace
{ "workspaceId": "36db...", "totalPreferences": 5, "activePreferences": 4, ... }

# ③ Inject memory into the new AI
> memory_save_preference({ workspaceId: "5806...", subject: "tech stack", value: "Electron + React + TypeScript，本地优先架构", confidence: 0.92 })
{ "preferenceId": "b516...", "subject": "tech stack", "status": "active", "note": "新偏好已保存" }

# ④ After switching: the new AI instantly knows you
> memory_profile({ workspaceId: "5806..." })
{ "workspaceId": "5806...", "totalPreferences": 5, "activePreferences": 4, ... }

# ⑤ The new AI can also recall your preferences
> preference_search({ query: "tech stack", workspaceId: "5806..." })
[ { "subject": "tech stack", "value": "Electron + React + TypeScript，本地优先架构", "confidence": 0.92, "status": "active" } ]
```

### AI Identity Profile: One-click portable persona

```bash
# Generate identity profile in Memora UI → Copy to clipboard

# My AI Identity Profile
## About Me
- Full-stack developer
- Prefers TypeScript and Rust

## Decision Patterns
- Open Source Preference: 85%
- Early Adopter: 72%
- Prefers Simplicity: 90%

## Communication Style
- Formality: casual
- Detail Level: brief
- Prefers: Short answers, Code-first responses, Markdown format

# Paste into any new AI conversation → AI instantly knows you
```

### Memory Timeline: Watch your knowledge evolve

```
2026-01 ━━━ Python 80%  →  "主要用 Python 做后端"
2026-05 ━━━ Rust 65%    →  "开始学习 Rust，感觉有意思"
2026-08 ━━━ TypeScript 92% → "全栈开发主语言，Electron 项目"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trend: 技术栈从 Python 后端 → TypeScript 全栈，新语言探索活跃
```

---

## Killer Features

### 1. One-Click AI Identity Profile 2.0

Automatically generates a **complete AI persona profile** from your preferences, knowledge base, and conversation history — now with **decision pattern analysis** and **communication style inference**:

```markdown
# My AI Identity Profile

## About Me
- Full-stack developer
- Prefers TypeScript and Rust

## Tech Stack
- Electron, React, SQLite, Tailwind

## Decision Patterns (v2.0)
- Open Source Preference: 85%
- Cost Sensitive: 70%
- Early Adopter: 72%
- Privacy Conscious: 90%
- Prefers Simplicity: 88%

## Communication Style (v2.0)
- Formality: casual
- Detail Level: brief
- Prefers: Short answers, Code-first, Markdown

## Projects
- Memora — Personal AI Memory System
- ...
```

**Copy once, paste into any new AI conversation — switch AI, keep your identity.**

### 2. 32 MCP Tools — The iCloud for AI

Not just read/write, but **understanding-based memory**:

| Type | Tool | What It Does |
|------|------|-------------|
| Recall | `memory_recall` | Semantic search across history |
| Write | `memory_write` | Distill knowledge into the knowledge base |
| Profile | `memory_profile` | Get complete user preferences |
| **Explain** | `memory_explain` | **Why this memory? Confidence, source, frequency, related memories** |
| **Timeline** | `memory_timeline` | **How preferences evolved over time (monthly groups + trend analysis)** |
| **Diff** | `memory_diff` | **What changed between then and now?** |
| **Consolidate** | `memory_consolidate` | **Merge duplicate/similar memories automatically** |

Plug into Claude Code / Cursor / OpenCode / AstrBot — AI instantly has your full memory.

### 3. Memory Security Center

```
Encryption       safeStorage available
                 3 API Keys encrypted

Sensitive Info   12 items detected
                 3 API Keys · 2 phone numbers · 7 emails

Prompt Injection 200 messages scanned
                 2 potential risks detected (medium)

Recommendations  Enable auto-redaction on import
                 Back up database regularly
```

### 4. Memory Lifecycle — Grows Like a Brain

```
Preference Tracking:   Python ━━━━ 80%  →  Rust ━━━━ 75%
Conflict Detection:    New vs old auto-detected → old marked superseded → new marked active
Consolidation:         3 "Python" preferences → 1 merged entry (confidence 92%)
Confidence Decay:      30 days unaccessed → confidence -0.1 → below 0.05 auto-archived
```

---

## Why Memora?

| | ChatGPT Memory | Claude | Mem0 | Memora |
|---|:---:|:---:|:---:|:---:|
| Local Data Storage | No | No | No | **Yes** |
| Cross-Platform Memory | ChatGPT only | Claude only | API integration | **11+ platforms** |
| Preference Lifecycle | None | None | None | **Create → Conflict → Consolidate → Decay → Forget** |
| AI Identity Profile | None | None | None | **One-click + portable + decision patterns** |
| **Explainable Memory** | None | None | None | **memory_explain (source, confidence, frequency)** |
| **Memory Timeline** | None | None | None | **Evolution tracking + trend analysis** |
| **Memory Consolidation** | None | None | None | **Auto merge duplicates** |
| **Hybrid Retrieval** | Basic | Basic | Vector only | **FTS5 + Vector + Time Decay + Graph Boost** |
| MCP Ecosystem | None | None | None | **32 tools + field-level permissions** |
| **Field-Level Permissions** | None | None | None | **Per-client category control** |
| **Prompt Injection Detection** | None | None | None | **Import-time scanning** |
| E2E Encryption | — | — | — | **AES-256-GCM** |
| Open Source | No | No | No | **MIT** |

---

## Core Features

### Smart Import Center
Auto-detects local AI apps, one-click extraction: Cursor, Claude Code, OpenCode, Windsurf, Cline + 11 format imports. Built-in prompt injection detection.

### Hybrid Retrieval (v2.0)
FTS5 keyword search + vector semantic retrieval + time decay + graph boost, sub-millisecond response with comprehensive score breakdown. Optional **Reranker** (cross-encoder) refines the top-k results by query relevance — enabled when you configure an embedding model, and gracefully falls back to weighted fusion when disabled.

### Knowledge Base
Distill conversations into structured knowledge/decisions/tasks — searchable, linkable, reusable.

### Memory Version Control
Git for Memory — every change generates commit + diff, with blame tracing and version rollback.

### Custom Distillation Templates
Define your own distillation format (Background → Options → Decision → Rationale), per-project strategies. 8 built-in templates covering developer, researcher, PM, designer, writer, learner, AI engineer, and startup founder personas.

### Export Formats
MMF (Memora Memory Format) — full preferences + knowledge + conversations, importable to other instances. Also supports JSON (OpenAI-compatible), Markdown, HTML, Claude Code .jsonl.

### E2E Encrypted Workspace Sharing
Export a workspace as an **AES-256-GCM encrypted payload** (password-protected, SHA-256 verified) and securely share it across Claude Code / Cursor / OpenCode / other Memora instances. Only the receiver holding the correct password can decrypt and restore the full memory (preferences, constitution, knowledge, audit logs).

### Memory Agent
Periodically scans your memory library, proactively finds knowledge gaps, reminds you to summarize, spaced repetition.

### AI Migration Wizard (v2.0)
Auto-detects installed AI tools on your machine (Cursor, Claude Code, OpenCode, Windsurf), 3-step guided migration with platform-specific extraction.

### E2E Encrypted Cloud Sync
AES-256-GCM encryption, zero-knowledge sync, WebDAV/S3 compatible, cross-device usage.

### More
- Team Memory Sharing (collaborative workspace + visibility control + comments)
- Memory Time Capsule (seal memories, unlock in the future with comparison report)
- Memory Template Market (8 built-in "expert memory packs" + community import/export)
- MCP Permission System (per-client granularity authorization + field-level category control)

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

#### Field-Level Permissions (v2.0)

```bash
# Restrict Claude to tech + project only, Cursor to tech + communication + project
export MEMORA_FIELD_RESTRICTIONS="claude:tech,project;cursor:tech,communication,project"
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
│  migration · templates · memoryAgent                │
│  └── SQLite (FTS5 + vectors)                        │
└─────────────────────────────────────────────────────┘
```

| Layer | Technology |
|----|------|
| Frontend | React 18 + TypeScript 5.7 |
| Desktop | Electron 39 |
| Build | Vite + electron-vite |
| Storage | SQLite (better-sqlite3) + FTS5 |
| Search | Hybrid: FTS5 + Vector + Time Decay + Graph |
| State | Zustand |
| Styling | Tailwind CSS |
| Encryption | AES-256-GCM + PBKDF2 (600K iterations) |

---

## Core Principles

> **Your memory, not your tools.**
> **Switch AI, keep your accumulated life.**

- **Local-First** — Data stored locally, works offline
- **Privacy-First** — Data never leaves your device unless you choose to share
- **AI Native** — Data model designed specifically for AI memory
- **Open Source** — MIT license, transparent and auditable

---

## Security

Memora ships with **16 implemented hardening measures** and a **reproducible local self-test** so trust is verifiable, not just claimed.

```bash
# Local, no network: verify your data encryption in seconds
npm run self-test
```

- **Encryption** — AES-256-GCM + PBKDF2 (600K iterations); API keys secured via OS safeStorage; backups and sync payloads encrypted at-rest.
- **Isolation** — Sandboxed renderer + `contextIsolation` + strict CSP; all IPC file access gated by a path whitelist.
- **Atomicity** — Backups/recovery use atomic rename + SHA-256 sidecar verification; tampering is detected.
- **XSS defense** — Import sanitizer + HTML-exporter URL sanitization (blocks `javascript:`).

See the full, auditable checklist (each item with code location & tests) in [docs/security/THREAT_MODEL.md](docs/security/THREAT_MODEL.md).

> **Honest disclosure:** the on-disk SQLite database is **not encrypted at-rest by default** (only backups, secrets, and sync payloads are), and Memora has not yet undergone an external third-party security audit. We lower the trust bar via the reproducible self-test and this public checklist.

---

## Acknowledgments

This project studies and learns from several outstanding open-source projects in the AI memory and agent context space. Their insights have shaped Memora's design:

| Project | What we learned |
| --- | --- |
| [mem0](https://github.com/mem0ai/mem0) | Entity extraction & cross-memory linking to strengthen retrieval relevance (see `computeEntityBoost` in our hybrid search) |
| [OpenViking](https://github.com/volcengine/OpenViking) | Tiered L0/L1/L2 memory loading to save tokens in MCP `memory_recall` responses |
| [MemOS](https://github.com/MemTensor/MemOS) | Natural-language memory feedback loop (`memory_feedback`) for correcting/supplementing/replacing preferences |
| [MemPalace](https://github.com/MemPalace/mempalace) | Structured search scope (by person / project / topic) for filtering retrieval range |

---

## License

[MIT](LICENSE)

---

<div align="center">

<sub>Built with Electron · React · TypeScript · SQLite</sub><br/>
<sub>2026 Memora — Your AI remembers you forever.</sub>

</div>