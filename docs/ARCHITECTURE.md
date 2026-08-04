# Memora 架构设计说明

本文档记录 Memora 核心模块的设计思路与实现要点，供贡献者与维护者理解关键决策。

## 1. 混合检索（Hybrid Retrieval）

`src/search/hybridSearch.ts` 将多路召回融合为综合排序，解决单一召回方式（纯关键词或纯向量）的局限：

- **FTS5 关键词召回**：基于 SQLite FTS5，对会话标题/内容做词法匹配，中文经 `Intl.Segmenter` 分词后写入索引。
- **向量语义召回**：`src/search/semantic.ts` 通过 embedding 模型将查询与消息向量化，用余弦相似度召回语义相近结果（查询向量 LRU 缓存 + Worker 常驻池，失败时回退主进程同步计算）。
- **加权融合公式**：

  ```
  total = ftsScore * 0.4 + vectorScore * 0.3 + timeDecay * 0.15 + graphBoost + favoriteBonus
  ```

- **图谱增强**：`computeGraphBoost` 基于 `knowledge_entries` / `knowledge_relations` 计算会话的知识连接度，最多 +0.1。
- **Reranker 精排（可选）**：`src/search/reranker.ts` 对融合后的 top-k 结果，用交叉编码器对 query 与结果做相关性精排。**默认关闭**，用户配置 embedding 模型后启用；失败时优雅回退为加权融合排序。

## 2. 记忆合并（Memory Consolidation）

`src/memoryAgent/consolidation.ts` 后台合并重复/相似记忆，防止记忆库膨胀：

- **文本相似度**：`textSimilarity` 采用 Jaccard + Overlap 加权组合，跨所有主题（非仅技术栈）检测转述措辞（如"喜欢 Python" vs "Python 是主要语言"）。
- **向量语义合并（可选）**：`scanConsolidationCandidates` 支持 `useEmbedding` 路径，对 `subject + value` 生成向量，余弦相似度 ≥ 阈值视为可合并。**默认关闭**，仅当 active 条目数 > 100 时启用，避免隐式 API 成本。
- **合并动作**：被合并条目标记为 `superseded`，保留最高置信度条目。

## 3. MCP 字段级权限控制

`src/mcp/accessControl.ts` 实现按客户端分类的字段访问控制：

- 通过环境变量 `MEMORA_FIELD_RESTRICTIONS` 配置不同客户端（如 Claude Code / Cursor）对不同类别偏好（tech / personal / communication / project）的访问权限。
- 默认拒绝访问受限类别，防止 MCP 工具泄漏敏感个人信息。
- 所有工具调用均记录审计日志（`auditToolCall`）。

## 4. 端到端加密工作区共享

`src/sharing/encryptedWorkspace.ts` 实现多 Agent 安全共享：

- 复用 `MMF`（Memora Memory Format）作为可移植载体，承载偏好、宪法、知识、审计日志。
- 外层叠加 AES-256-GCM 加密（`src/crypto/e2e.ts`），携带 SHA-256 校验和。
- 导出 `encryptSharedWorkspace`：渲染 MMF → 加密 → 产出 `EncryptedSharedWorkspace`。
- 导入 `decryptSharedWorkspace`：校验格式 → 解密 → 校验和比对 → 解析 MMF → 导入目标工作区。
- 只有持有正确密码的接收方才能解密还原，防止共享传输过程中的数据泄露与篡改。

## 5. Prompt Injection 检测与 PII 脱敏

`src/importer/promptInjectionDetector.ts` 与 `src/importer/piiDetector.ts` 在导入环节提供安全防线：

- **Prompt Injection**：检测指令覆盖、系统提示篡改、越狱（DAN）、间接注入（ChatML）、信息提取等 5 类规则，返回最高风险等级与命中详情。
- **PII 脱敏**：检测 API Key、私钥、JWT、邮箱、手机号、身份证、信用卡等，按 (start, end) 精确仲裁重叠区间，输出脱敏文本。