# Memora Benchmarks

Memora 的可复现性能与质量门禁。所有评测均在 CI（GitHub Actions）中强制执行，确保每次改动都不会让检索性能或记忆准确性退化。

## 一、搜索性能（Search Performance）

驱动真实 SQLite FTS5 建临时库，构造 N 条假对话，测量索引构建耗时与查询延迟。

```bash
npm run benchmark     # 内部：node scripts/run-benchmark.js
```

### 指标

| 数据量 | 索引构建 | AND 平均延迟 | OR 平均延迟 | OR/AND 召回率 |
| ------ | -------- | ------------ | ----------- | ------------- |
| 1,000  | ~142 ms  | 0.17 ms      | 0.11 ms     | 100%          |
| 5,000  | ~532 ms  | 0.24 ms      | 0.20 ms     | 100%          |
| 10,000 | ~1,016 ms| 0.32 ms      | 0.25 ms     | 100%          |

### 门禁阈值（CI 强断）

| 阈值 | 值 | 说明 |
| ---- | -- | ---- |
| 索引构建（10k 条） | < 1500 ms | 当前基线 ~1016 ms，留 50% 余量 |
| AND 平均延迟（10k 条） | < 1 ms | 当前基线 ~0.32 ms |
| OR/AND 召回率 | ≥ 80% | 宽松上界校验，防召回退化 |

> 语义/向量搜索依赖真实 Embedding API，不在本 benchmark 范围。延迟为 5 个查询的平均值（SQLite FTS5，临时内存库），实际受磁盘 I/O 与并发影响会有波动。

## 二、记忆检索评测（Memory Retrieval）

驱动真实 MCP 工具链（`memory_save_preference` / `preference_search` / `memory_profile`），在全新本地数据库上评测三项可复现指标。

```bash
npm run mem-bench    # 内部：node scripts/run-mem-bench.js
```

### 指标说明

1. **召回率（Recall）**：写入 10 个已知偏好，随后用各自相关关键词逐一查询，统计「被检索到」的比例。衡量记忆是否"找得到"。
2. **时态正确率（Temporal Correctness）**：同一 subject 连续更新 3 次（VSCode → VSCode + Cursor → Cursor（主）+ VSCode），验证检索返回的是**最新活性版本**，而非被取代（superseded）的旧版本。衡量记忆是否"记得准"。
3. **重复去重率（Deduplication）**：同一 subject+value 重复保存 5 次，验证检索收敛为 1 条而非 N 条。衡量记忆是否"不冗余"。

### 当前结果（可复现）

| 指标 | 结果 | 门禁 |
| ---- | ---- | ---- |
| 召回率 | 100% (10/10) | ≥ 90% |
| 时态正确率 | 100% | = 100% |
| 重复去重率 | 100% (收敛为 1 条) | = 100% |

### 实现要点

- 评测在 `ELECTRON_RUN_AS_NODE` 下运行 `out/main` 的真实工具实现，匹配 better-sqlite3 的 Electron ABI，非合成数据。
- 结果写入 `test/benchmark/memory-results.json`；CI 读取后执行阈值断言，任一指标不达标即失败。
- 旧版本偏好（`superseded`）在 `preference_search` 中被过滤，只返回 `status = 'active'` 的当前记忆——这是时态正确率的基础。

## 三、CI 集成

`.github/workflows/ci.yml` 中新增 `mem-bench` 与 `demo` 任务，与既有 `perf`（搜索性能）任务共同构成门禁：

- **perf**：`npm run benchmark` — 搜索性能阈值断言
- **mem-bench**：`npm run mem-bench` — 记忆检索三项指标断言
- **demo**：`npm run demo` — 一键「换 AI」演示可复现（产出真实输出，防回归）

## 四、本地复现

```bash
npm run build         # 先构建（demo / mem-bench 依赖 out/main）
npm run benchmark     # 搜索性能
npm run mem-bench     # 记忆检索
npm run demo          # 一键换 AI 演示
```