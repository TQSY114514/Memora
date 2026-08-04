<div align="center">

<!-- Hero Banner -->
<img src="assets/banner.svg" width="600" alt="Memora - 个人 AI 知识保险库"/>

<p>
  <strong>换 AI，不换人生积累。</strong><br/>
  <sub>你的 AI 应该永远记得你 — 无论你换多少次模型、多少个平台</sub>
</p>

<!-- Badges -->
<p>
  <img src="https://img.shields.io/badge/version-1.13-6366f1?style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/Electron-39-47848F?style=flat-square" alt="Electron"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/SQLite-FTS5-003B57?style=flat-square" alt="SQLite"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/Local_First-%E2%9C%93-6366f1?style=flat-square" alt="Local First"/>
  <img src="https://img.shields.io/badge/MCP-31_tools-6366f1?style=flat-square" alt="MCP Tools"/>
</p>

<!-- Language Switcher -->
<p>
  <a href="./README.md">English</a> · <strong>中文</strong>
</p>

<!-- Quick Nav -->
<p>
  <a href="#痛点">痛点</a> ·
  <a href="#演示">演示</a> ·
  <a href="#杀手级功能">杀手级功能</a> ·
  <a href="#为什么选择-memora">为什么 Memora</a> ·
  <a href="#对比">对比</a> ·
  <a href="#核心功能">核心功能</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#架构">架构</a>
</p>

</div>

---

## AI 项目声明

> **本项目 90%+ 代码由 AI 生成，未经人工安全审计。** 用于管理敏感对话前请自行评估风险。详见 [AI 开发声明](docs/AI_DEVELOPMENT.md)。

---

## 痛点

> AI 模型越来越强，但**记忆越来越碎**。

你用 ChatGPT、Claude、Cursor、DeepSeek、Kimi……每个平台都是独立的数据孤岛。换一个 AI 就得从头解释你是谁、做什么、喜欢什么。

**ChatGPT Memory、Mem0 都在解决"存储"问题，但没人解决"你是谁"的问题。**

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

## 演示

### MCP：AI 瞬间了解你的偏好

```bash
# 1. 启动 Memora 的 MCP 服务
$ node out/main/index.js --mcp

# 2. 在 Claude Code / Cursor / OpenCode 中，AI 调用 memory_recall：

> memory_recall({ query: "用户技术栈偏好" })

{
  "preferences": [
    {
      "subject": "技术栈偏好",
      "value": "首选 Electron + React + TypeScript，偏好本地优先架构",
      "confidence": 0.92,
      "reasons": ["高置信度（多次确认）", "频繁访问（23 次）"],
      "sourceSession": {
        "title": "Memora 架构设计讨论",
        "provider": "Claude Code",
        "createdAt": "2026-07-21"
      }
    }
  ],
  "explanation": "为什么是这条记忆？置信度 92%，在 3 段对话中被确认 7 次"
}
```

### AI 身份画像：一键复制，随处粘贴

```bash
# 在 Memora 界面中生成身份画像 → 一键复制

# My AI Identity Profile
## About Me
- 全栈开发者
- 偏好 TypeScript 和 Rust

## Decision Patterns
- 开源偏好: 85%
- 尝鲜程度: 72%
- 极简偏好: 90%

## Communication Style
- 正式度: 随意
- 详细程度: 简洁
- 偏好: 简短回答、代码优先、Markdown 格式

# 粘贴到任何新 AI 对话开头 → AI 即时了解你
```

### 记忆时间线：看你的知识如何演化

```
2026-01 ━━━ Python 80%  →  "主要用 Python 做后端"
2026-05 ━━━ Rust 65%    →  "开始学习 Rust，感觉有意思"
2026-08 ━━━ TypeScript 92% → "全栈开发主语言，Electron 项目"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
趋势: 技术栈从 Python 后端 → TypeScript 全栈，新语言探索活跃
```

---

## 杀手级功能

### 一键 AI 身份画像 2.0

从你的偏好、知识库、对话历史中自动生成**完整的 AI 人格画像** — 新增**决策模式分析**和**沟通风格推断**：

```markdown
# My AI Identity Profile

## About Me
- 全栈开发者
- 偏好 TypeScript 和 Rust

## Tech Stack
- Electron, React, SQLite, Tailwind

## Decision Patterns (v2.0)
- 开源偏好: 85%
- 成本敏感: 70%
- 尝鲜程度: 72%
- 隐私重视: 90%
- 极简偏好: 88%

## Communication Style (v2.0)
- 正式度: 随意
- 详细程度: 简洁
- 偏好: 简短回答、代码优先、Markdown

## Projects
- Memora — 个人 AI 记忆系统
- ...
```

**一键复制，粘贴到任何新 AI 对话开头 — 换 AI，不换人设。**

### 31 个 MCP 工具 — AI 世界的 iCloud

不只是读写，而是**理解型记忆**：

| 类型 | 工具 | 用途 |
|------|------|------|
| 召回 | `memory_recall` | 语义搜索历史讨论 |
| 写入 | `memory_write` | 沉淀知识到知识库 |
| 画像 | `memory_profile` | 获取用户完整偏好 |
| **解释** | `memory_explain` | **为什么返回这条记忆？置信度、来源、频率、关联记忆** |
| **时间线** | `memory_timeline` | **用户偏好如何随时间变化？（按月分组 + 趋势分析）** |
| **对比** | `memory_diff` | **过去和现在有什么不同？** |
| **合并** | `memory_consolidate` | **自动合并重复/相似记忆** |

接入 Claude Code / Cursor / OpenCode / AstrBot，AI 即刻拥有你的全部记忆。

### 记忆安全中心

```
加密状态      safeStorage 可用
              3 个 API Key 已加密

敏感信息      检测到 12 处
              3 个 API Key · 2 个手机号 · 7 个邮箱

注入检测      已扫描 200 条消息
              发现 2 处潜在风险 (medium)

建议          导入时启用自动脱敏
              定期备份数据库
```

### 记忆生命周期 — 像人脑一样成长

```
偏好追踪:      Python ━━━━ 80%  →  Rust ━━━━ 75%
冲突检测:      新旧偏好自动发现 → 旧标记 superseded → 新标记 active
记忆合并:      3 条 "Python" 偏好 → 合并为 1 条 (置信度 92%)
置信度衰减:    30 天未访问 → confidence -0.1 → 低于 0.05 自动归档
```

---

## 为什么选择 Memora 而不是 ChatGPT Memory / Mem0？

| | ChatGPT Memory | Claude | Mem0 | Memora |
|---|:---:|:---:|:---:|:---:|
| 数据本地存储 | 否 | 否 | 否 | **是** |
| 跨平台记忆 | 仅 ChatGPT | 仅 Claude | API 集成 | **11+ 平台导入** |
| 偏好生命周期 | 无 | 无 | 无 | **创建 → 冲突 → 合并 → 衰减 → 遗忘** |
| AI 身份画像 | 无 | 无 | 无 | **一键生成 + 可复制 + 决策模式** |
| **记忆可解释** | 无 | 无 | 无 | **memory_explain（来源、置信度、频率）** |
| **记忆时间线** | 无 | 无 | 无 | **演化追踪 + 趋势分析** |
| **记忆合并去重** | 无 | 无 | 无 | **自动合并重复记忆** |
| **混合检索** | 基础 | 基础 | 仅向量 | **FTS5 + 向量 + 时间衰减 + 图谱增强** |
| MCP 生态 | 无 | 无 | 无 | **31 个工具 + 字段级权限** |
| **字段级权限** | 无 | 无 | 无 | **按客户端控制类别访问** |
| **注入攻击检测** | 无 | 无 | 无 | **导入时自动扫描** |
| 端到端加密 | — | — | — | **AES-256-GCM** |
| 开源 | 否 | 否 | 否 | **MIT** |

---

## 核心功能

### 智能导入中心
自动检测本地 AI 应用，一键扒取：Cursor、Claude Code、OpenCode、Windsurf、Cline + 11 种格式导入。内置 Prompt Injection 检测。

### 混合检索（v2.0）
FTS5 关键词搜索 + 向量语义检索 + 时间衰减 + 图谱增强，毫秒级响应，附带完整评分明细。可选 **Reranker 精排**（交叉编码器）对 top-k 结果按查询相关性重排——配置嵌入模型后自动启用，未配置时优雅回退为加权融合排序。

### 知识库
将对话蒸馏为结构化的知识/决策/任务，可独立搜索、关联、复用。

### 记忆版本控制
Git for Memory — 每次变更生成 commit + diff，支持 blame 追溯、版本回滚。

### 可定制蒸馏模板
自定义蒸馏格式（背景 → 方案 → 决策 → 理由），按项目设定不同策略。内置 8 套模板，覆盖开发者、研究者、产品经理、设计师、写作者、学习者、AI 工程师、创业者等角色。

### 导出格式扩展
MMF（Memora Memory Format）— 完整偏好+知识+对话，可导入其他实例。同时支持 JSON（OpenAI 兼容）、Markdown、HTML、Claude Code .jsonl。

### 记忆智能体
定期扫描记忆库，主动发现知识缺口、提醒总结、间隔重复复习。

### AI 迁移向导（v2.0）
自动检测本机已安装的 AI 工具（Cursor、Claude Code、OpenCode、Windsurf），三步引导迁移，针对不同平台自动提取数据。

### 端到端加密云同步
AES-256-GCM 加密，零知识同步，兼容 WebDAV/S3，跨设备使用。

### 更多
- 团队记忆共享（协作 Workspace + 可见性控制 + 评论）
- 记忆时间胶囊（封存记忆，未来开启时生成对比报告）
- 记忆模板市场（8 套内置"专家记忆包" + 社区导入导出）
- MCP 权限系统（按客户端粒度授权 + 字段级类别控制）

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

#### 字段级权限（v2.0）

```bash
# 限制 Claude 只能访问 tech + project，Cursor 可以访问 tech + communication + project
export MEMORA_FIELD_RESTRICTIONS="claude:tech,project;cursor:tech,communication,project"
```

---

## 架构

```
┌─────────────────────────────────────────────────────┐
│  Renderer (React 18)                                │
│  Sidebar · ChatList · ChatViewer · 30+ 面板         │
│  window.Memora.* (preload bridge)                   │
└─────────────────┬───────────────────────────────────┘
                  │ IPC
┌─────────────────┴───────────────────────────────────┐
│  Main Process                                       │
│  importer · database · search · ai · mcp            │
│  identity · security · sync · capsule · team        │
│  migration · templates · memoryAgent                │
│  └── SQLite (FTS5 + 向量)                           │
└─────────────────────────────────────────────────────┘
```

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript 5.7 |
| 桌面 | Electron 39 |
| 构建 | Vite + electron-vite |
| 存储 | SQLite (better-sqlite3) + FTS5 |
| 搜索 | 混合: FTS5 + 向量 + 时间衰减 + 图谱 |
| 状态 | Zustand |
| 样式 | Tailwind CSS |
| 加密 | AES-256-GCM + PBKDF2（60 万次迭代） |

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