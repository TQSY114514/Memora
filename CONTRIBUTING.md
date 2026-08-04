# 贡献指南

感谢你对 Memora 的兴趣！这份指南帮助你参与项目。

## 开发环境

```bash
# 克隆仓库
git clone https://github.com/TQSY114514/Memora.git
cd Memora

# 安装依赖（better-sqlite3 是 native 模块，会自动编译）
npm install

# 启动开发模式（Vite + Electron）
npm run dev
# 或
start.bat  # Windows
```

## 技术栈

- **Electron 39** + **Vite** 桌面应用框架
- **React 18** + **TypeScript** 渲染层
- **better-sqlite3** 本地数据库（同步、WAL 模式）
- **Zustand** 状态管理
- **Tailwind CSS** 样式
- **FTS5 + 向量检索** 混合搜索

## 项目结构

```
src/
├── main/              # Electron 主进程
│   ├── ipc/           # IPC handler + safeHandle 共享模块
│   │   ├── handlers/  # 11 个 IPC 处理器
│   │   └── safeHandle.ts
│   ├── backup.ts      # 自动热备份 + AES-256-GCM 加密
│   ├── logger.ts      # 全局结构化日志
│   ├── memoryLifecycle.ts  # 仿生学遗忘 + 分层记忆 + 用户画像
│   └── index.ts       # 主进程入口
├── renderer/          # 渲染进程
│   └── src/
│       ├── components/  # React 组件
│       ├── stores/      # Zustand store
│       └── i18n/        # 多语言
├── preload/           # preload 脚本（contextBridge）
├── database/          # SQLite schema + migrations + repositories
│   └── repositories/  # 9 个 repo + sqlHelpers 共享 SQL 工具
├── importer/          # 各平台对话导入器（适配器模式）
├── search/            # FTS5 + 语义搜索 + 向量 LRU 缓存
├── ai/                # AI 总结、嵌入、RAG
├── mcp/               # MCP Server（31 工具）+ 字段级权限
├── sharing/           # HTML/Markdown/JSON/Claude Code/MMF 导出 + E2E 加密工作区共享
└── shared/            # 跨进程共享类型/常量
```

## 编码规范

- TypeScript strict 模式，避免 `any`
- ESLint + Prettier 已配置：`npm run lint` / `npm run format`
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat: 新功能`
  - `fix: 修复 bug`
  - `perf: 性能优化`
  - `refactor: 重构`
  - `docs: 文档`
- 提交前运行 `npm run typecheck` 确保无类型错误
- 提交前运行 `npm run lint` 确保无 lint 错误
- 主进程代码改动后需重启应用（`start.bat`）才生效

## 新增 AI 平台导入器

Memora 采用适配器模式，新增平台支持只需：

1. 在 `src/importer/` 下新建目录（如 `gemini/`）
2. 实现 `Importer` 接口（`detect()` / `extract()` / `parse()`）
3. 在 `src/importer/registry.ts` 注册
4. 在 `src/shared/constants.ts` 的 `PROVIDER_META` 加平台元信息

参考 `src/importer/claude/` 的实现。

## 新增 AI 供应商配置

1. 在 `src/shared/types.ts` 的 `Provider` 类型加标识
2. 在 `src/shared/constants.ts` 的 `PROVIDER_META` 加颜色/标签
3. 在 `aiConfigStore.ts` 加该供应商的配置存储

## 提交 PR

1. Fork 仓库并创建分支：`git checkout -b feat/your-feature`
2. 提交改动：`git commit -m 'feat: 描述'`
3. 推送：`git push origin feat/your-feature`
4. 创建 PR，描述改动内容和动机

### PR 检查清单

- [ ] `npm run typecheck` 无错误
- [ ] `npm run lint` 无错误
- [ ] `npm run test` 全部通过
- [ ] `npm run test:coverage` 达到覆盖率门禁
- [ ] `npm run build` 构建通过
- [ ] 提交信息符合 Conventional Commits
- [ ] 新功能有对应 UI（如适用）
- [ ] 不破坏现有功能

## 报告 Bug

提交 Issue 时请包含：

- 操作系统（Windows / macOS / Linux）
- 复现步骤
- 预期行为 vs 实际行为
- 错误日志（如有）

## 行为准则

保持友善、尊重。技术讨论对事不对人。
