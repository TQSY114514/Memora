# Memora 安全威胁模型与加固基线（v10 P0-C2）

> 目标：把安全加固措施固化为**可审计清单**，而非一次性声明。
> 每项都标注代码位置与对应测试，便于安全审计与回归验证。
> 配套可复现自检：`npm run self-test`（CLI）或 设置 → 安全中心 →「安全自检」。

**定位**：Memora 是 **Local-first 本地优先** 的跨 AI 个人记忆层。你的对话记忆、偏好、知识库默认只存在你的设备上。本文件说明我们在「本地数据安全」上的承诺边界、已实施加固、待强化项与已知限制。

---

## 一、资产与信任边界

| 资产 | 存放位置 | 保护级别 |
| --- | --- | --- |
| 对话记忆 / 偏好 / 知识库 | SQLite 主库（`userData/memora.db`） | 依赖文件权限 0600 + 本地安全 |
| AI API Key / 令牌 | `userData/secrets.enc`（safeStorage 加密） | 加密 at-rest |
| 备份 | `userData/backups/*`（可选 AES-256-GCM 加密） | 可加密 at-rest |
| 同步载荷 | 云端（零知识加密，云端不可解密） | 端到端加密 |

信任边界：**渲染进程视为不可信**（可能被 XSS 攻破）；主进程是唯一可信边界；所有跨边界访问必须经过白名单校验。

---

## 二、已实施加固（✅ 可审计）

### 1. 渲染进程隔离（sandbox + contextIsolation）
- 位置：[src/main/index.ts](file:///d:/Memora/src/main/index.ts) `webPreferences`（`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`）
- 作用：渲染进程被攻破后无法直接访问 Node 与 preload API。
- 测试：`test/sanitizer.test.ts`、`test/unit/piiInjection.test.ts`

### 2. Content-Security-Policy（CSP）
- 位置：[src/main/index.ts](file:///d:/Memora/src/main/index.ts) `onHeadersReceived` + [src/renderer/index.html](file:///d:/Memora/src/renderer/index.html)
- 作用：生产模式 `script-src 'self'`，禁止内联/动态脚本；开发模式放宽以支持 HMR。
- 测试：`test/securityCenter.test.ts`

### 3. IPC 路径白名单（防路径遍历 / 任意文件读）
- 位置：[src/main/ipc/safeHandle.ts](file:///d:/Memora/src/main/ipc/safeHandle.ts) `assertSafePath`
- 作用：`normalize + resolve` 后校验最终路径必须位于 userData/Downloads/Documents/Desktop 白名单根目录内；拒绝空字节、`..` 绕过。
- 测试：`test/unit/safePath.test.ts`

### 4. 自定义协议 `app://` + 路径遍历防护
- 位置：[src/main/index.ts](file:///d:/Memora/src/main/index.ts) `protocol.registerSchemesAsPrivileged` + `protocol.handle`
- 作用：替代 `file://` 解决 chunk 加载问题；`resolve` 后校验最终路径在 rendererDist 内，越界返回 403。

### 5. 数据库文件权限 0600
- 位置：[src/database/connection.ts](file:///d:/Memora/src/database/connection.ts) `chmodSync(path, 0o600)`
- 作用：仅当前用户可读写主库（Linux/macOS 生效；Windows 依赖 NTFS ACL）。
- 测试：`test/unit/repositories/*`

### 6. IPC 路径/文件名二次断言（备份、导入）
- 位置：[src/main/ipc/handlers/system.ipc.ts](file:///d:/Memora/src/main/ipc/handlers/system.ipc.ts) `assertSafeFilename`
- 作用：备份文件名、导入路径等进入主进程前再次校验。
- 测试：`test/backup.test.ts`、`test/unit/safePath.test.ts`

### 7. 原子备份与恢复（防数据损坏）
- 位置：[src/main/backup.ts](file:///d:/Memora/src/main/backup.ts) `renameSync` 原子替换 + SHA-256 sidecar 校验
- 作用：备份先写 `.tmp` 再原子 rename；恢复强制校验校验和与数据库完整性，失败不破坏原库。
- 测试：`test/backup.test.ts`

### 8. 端到端加密（AES-256-GCM + PBKDF2）
- 位置：[src/crypto/e2e.ts](file:///d:/Memora/src/crypto/e2e.ts)
- 作用：备份/同步（可选）载荷加密；认证标签可检测篡改；错误口令拒绝。
- 测试：`test/crypto-e2e.test.ts`、`test/cloudSync.test.ts`

### 9. 可复现加密自检
- 位置：[src/crypto/selfTest.ts](file:///d:/Memora/src/crypto/selfTest.ts) + CLI 入口 [src/main/index.ts](file:///d:/Memora/src/main/index.ts) `--self-test`
- 作用：一键验证「数据确实加密、只有我能解、可检测篡改」，输出 7 项 PASS/FAIL 报告。
- 测试：`test/unit/selfTest.test.ts`

### 10. API Key 安全存储（safeStorage）
- 位置：[src/main/secretStore.ts](file:///d:/Memora/src/main/secretStore.ts)
- 作用：密钥经系统级 safeStorage 加密落盘，不明文存储。
- 测试：`test/unit/secretStore.test.ts`

### 11. HTML 导出 URL 消毒（防 javascript: XSS）
- 位置：[src/sharing/htmlExporter.ts](file:///d:/Memora/src/sharing/htmlExporter.ts)
- 作用：导出富文本时阻断 `javascript:` 协议，防止渲染执行恶意脚本。
- 测试：`test/unit/htmlExporter.test.ts`

### 12. 导入内容消毒（XSS）
- 位置：[src/importer/sanitizer.ts](file:///d:/Memora/src/importer/sanitizer.ts)
- 作用：第三方导入的 Markdown/HTML 先消毒再入库，阻断脚本注入。
- 测试：`test/sanitizer.test.ts`

### 13. 窗口外链只放行 https/mailto
- 位置：[src/main/index.ts](file:///d:/Memora/src/main/index.ts) `setWindowOpenHandler`
- 作用：拒绝 `file://`、自定义协议等可能 RCE 的链接，其余用系统浏览器打开。

### 14. 全局异常兜底
- 位置：[src/main/index.ts](file:///d:/Memora/src/main/index.ts) `unhandledRejection` / `uncaughtException`
- 作用：异常不静默崩溃，记录日志后保持进程存活。

### 15. 会话隔离（INNER JOIN 防跨工作区泄漏）
- 位置：[src/database/repositories/sessionRepo.ts](file:///d:/Memora/src/database/repositories/sessionRepo.ts)
- 作用：会话查询强制 INNER JOIN `chat_sessions`，避免跨 workspace 数据串扰。
- 测试：`test/unit/repositories/sessionRepo.test.ts`

### 16. 向量维度校验 + embeddingDim 范围校验
- 位置：[src/search/vectorMath.ts](file:///d:/Memora/src/search/vectorMath.ts)
- 作用：余弦相似度前校验维度一致；embeddingDim 限制 1–8192。
- 测试：`test/unit/vectorMath.test.ts`、`test/unit/embeddingRepo.test.ts`

> **合计：已实施 16 项安全加固 + 1 项可复现自检。**

---

## 三、待强化（🔶 已规划 / 需投入）

| 项 | 说明 | 优先级 |
| --- | --- | --- |
| 主库 at-rest 全程加密 | 目前仅备份/同步加密，主库明文落盘（依赖 0600 权限）。可评估 WAL 级透明加密（SQLCipher）。 | 高 |
| 入站网络请求 CORS 严格校验 | 渲染进程 fetch 目标应进一步白名单化，防止被 XSS 利用为代理。 | 中 |
| 自动更新签名校验完整性 | 更新包应校验发布者签名，防中间人。 | 中 |
| 敏感信息检测覆盖加密态 | 当前敏感信息扫描基于明文抽样；可扩展为对加密块的结构化检测。 | 低 |

---

## 四、已知限制（⚠️ 诚实披露）

- **主库默认不加密 at-rest**：本地 SQLite 为明文（仅备份可选择加密、密钥 safeStorage 加密）。Local-first 的取舍是「数据在你设备上」，代价是设备被完全攻破时数据可读。
- **Windows 上 0600 语义有限**：`chmod` 对 NTFS ACL 影响有限，主要依赖用户账户隔离。
- **未做第三方安全审计**：加固经过自测与回归，但尚未由外部专业机构审计。我们通过「可复现自检 + 公开清单」降低信任成本。
- **AI 提供商请求为出站**：调用云端模型时，对话片段会发送给对应提供商（受其隐私政策约束）；本地模型可避免。
- **云同步依赖提供商**：载荷零知识加密，但可用性/保密性仍受所接云服务影响。

---

## 五、验证命令

```bash
# 可复现加密自检（7 项断言）
npm run self-test

# 全量测试（含安全相关回归）
npx vitest run

# 类型与静态检查
npm run typecheck && npm run lint
```

---

## 六、README 披露措辞（v10 P0-C2 同步）

> 已实施 **16 项安全加固**，并提供**可复现的本地加密自检**（`npm run self-test`），让信任可验证而非仅凭声明。
> 我们也诚实披露：主库默认不加密 at-rest，且尚未经外部第三方专业审计。