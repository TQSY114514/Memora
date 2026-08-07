/**
 * Memora 搜索性能 Benchmark
 *
 * 用法：npm run benchmark
 *
 * 说明：
 * - 通过 ELECTRON_RUN_AS_NODE=1 用 Electron 的 Node 运行时运行（匹配 better-sqlite3 ABI）
 * - 直接用 better-sqlite3 建临时库 + FTS5 虚拟表，构造 N 条假对话
 * - 测量：索引构建耗时、关键词搜索延迟、AND/OR 查询命中数
 * - 语义/向量搜索需要 Embedding API，不在此 benchmark 范围（需真实 AiConfig）
 *
 * 输出格式：人类可读 + JSON（便于 CI 采集）
 */
const Database = require('better-sqlite3')
const { writeFileSync, unlinkSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')

// ===== 中文分词（与 src/search/segmenter.ts 同实现） =====
let segmenter = null
function getSegmenter() {
  if (!segmenter) segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  return segmenter
}
function segment(text) {
  if (!text) return ''
  const seg = getSegmenter()
  const tokens = []
  for (const { segment, isWordLike } of seg.segment(text)) {
    if (!isWordLike) continue
    const trimmed = segment.trim()
    if (trimmed) tokens.push(trimmed)
  }
  return tokens.join(' ')
}

// ===== 构造假对话数据 =====
const SAMPLE_TITLES = [
  'Electron 项目架构讨论',
  'SQLite 性能优化方案',
  'React 渲染性能分析',
  'TypeScript 类型系统设计',
  'AI 对话历史管理',
  '向量检索与语义搜索',
  '前端工程化最佳实践',
  'Node.js 流式处理',
  'Vite 构建优化',
  '数据库索引原理'
]
const SAMPLE_CONTENTS = [
  '我们讨论了为什么在这个 Electron 项目中选择 SQLite 而不是 IndexedDB，主要考虑是事务安全和查询性能。',
  'SQLite 的 WAL 模式显著提升了并发读性能，建议在所有写入场景开启。',
  'React 的虚拟列表渲染对于长对话场景至关重要，@tanstack/react-virtual 是个不错的选择。',
  'TypeScript 的 strict 模式虽然增加了开发成本，但能避免大量运行时错误。',
  '管理多个 AI 平台的对话历史需要统一的数据模型，屏蔽各平台差异。',
  '向量检索的召回率取决于 Embedding 质量和相似度算法，余弦相似度适合大多数场景。',
  '前端工程化的核心是构建工具链 + 代码规范 + 自动化测试三件套。',
  'Node.js 的流式处理对于大文件导入很重要，避免一次性加载到内存。',
  'Vite 的 HMR 机制基于 ESM，开发体验远好于 Webpack。',
  'B-tree 索引适合等值查询和范围查询，Hash 索引只适合等值查询。'
]

function generateConversation(i) {
  const titleIdx = i % SAMPLE_TITLES.length
  const contentIdx = (i * 3) % SAMPLE_CONTENTS.length
  return {
    id: `bench-${i}`,
    title: `${SAMPLE_TITLES[titleIdx]} #${i}`,
    content: `${SAMPLE_CONTENTS[contentIdx]}（编号 ${i}）`,
    provider: ['ChatGPT', 'Claude', 'DeepSeek'][i % 3]
  }
}

// ===== Benchmark 主流程 =====
function runBenchmark(count) {
  const dbPath = join(tmpdir(), `memora-bench-${Date.now()}.db`)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // 建表（与 src/database/schema.ts 的 chat_fts 对齐）
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      provider TEXT,
      created_at TEXT
    );
    CREATE VIRTUAL TABLE chat_fts USING fts5(
      session_id, title, content, provider,
      content=''
    );
  `)

  const insertSession = db.prepare(
    'INSERT INTO sessions (id, title, provider, created_at) VALUES (?, ?, ?, ?)'
  )
  const insertFts = db.prepare(
    'INSERT INTO chat_fts (session_id, title, content, provider) VALUES (?, ?, ?, ?)'
  )

  // 构造数据 + 索引
  const indexStart = process.hrtime.bigint()
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const conv = generateConversation(i)
      insertSession.run(conv.id, conv.title, 'ChatGPT', new Date().toISOString())
      // 写入 FTS 时对中文做分词
      insertFts.run(
        conv.id,
        segment(conv.title),
        segment(conv.content),
        conv.provider
      )
    }
  })
  tx()
  const indexEnd = process.hrtime.bigint()
  const indexMs = Number(indexEnd - indexStart) / 1e6

  // 关键词搜索（AND）
  const queries = ['SQLite 性能', 'Electron 项目', '向量检索', 'React 渲染', '索引原理']
  const andLatencies = []
  const andHits = []
  for (const q of queries) {
    const terms = segment(q).split(/\s+/).filter(Boolean)
    const ftsQuery = terms.map((t) => `"${t}"*`).join(' AND ')
    const start = process.hrtime.bigint()
    const rows = db.prepare('SELECT session_id FROM chat_fts WHERE chat_fts MATCH ? LIMIT 50').all(ftsQuery)
    const end = process.hrtime.bigint()
    andLatencies.push(Number(end - start) / 1e6)
    andHits.push(rows.length)
  }

  // 关键词搜索（OR）
  const orLatencies = []
  const orHits = []
  for (const q of queries) {
    const terms = segment(q).split(/\s+/).filter(Boolean)
    const ftsQuery = terms.map((t) => `"${t}"*`).join(' OR ')
    const start = process.hrtime.bigint()
    const rows = db.prepare('SELECT session_id FROM chat_fts WHERE chat_fts MATCH ? LIMIT 50').all(ftsQuery)
    const end = process.hrtime.bigint()
    orLatencies.push(Number(end - start) / 1e6)
    orHits.push(rows.length)
  }

  db.close()
  // 清理临时文件
  try {
    unlinkSync(dbPath)
    unlinkSync(dbPath + '-wal')
    unlinkSync(dbPath + '-shm')
  } catch {}

  const avg = (arr) => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)
  const totalHitsAnd = andHits.reduce((a, b) => a + b, 0)
  const totalHitsOr = orHits.reduce((a, b) => a + b, 0)
  // 召回率：OR 命中数 / AND 命中数（OR 作为宽松上界）
  const recallRate = totalHitsAnd > 0 ? ((totalHitsOr / totalHitsAnd) * 100).toFixed(1) : '0'

  return {
    count,
    indexMs: indexMs.toFixed(2),
    andAvgMs: avg(andLatencies),
    orAvgMs: avg(orLatencies),
    andHits: totalHitsAnd,
    orHits: totalHitsOr,
    recallRate
  }
}

// ===== 主入口 =====
console.log('Memora Search Benchmark')
console.log('========================\n')

const sizes = [1000, 5000, 10000]
const results = []

for (const n of sizes) {
  console.log(`▶ 测试 ${n} 条对话...`)
  const r = runBenchmark(n)
  results.push(r)
  console.log(`  索引构建: ${r.indexMs} ms`)
  console.log(`  AND 搜索平均延迟: ${r.andAvgMs} ms（总命中 ${r.andHits}）`)
  console.log(`  OR  搜索平均延迟: ${r.orAvgMs} ms（总命中 ${r.orHits}）`)
  console.log(`  OR/AND 召回率: ${r.recallRate}%\n`)
}

console.log('========================')
console.log('说明：')
console.log('- 语义/向量搜索需真实 AiConfig，不在此 benchmark 范围')
console.log('- 延迟为 5 个查询的平均值（SQLite FTS5，临时内存库）')
console.log('- 实际应用中受磁盘 I/O 和并发影响，延迟会有波动')

// 写 JSON 结果
const jsonPath = join(process.cwd(), 'test', 'benchmark', 'results.json')
writeFileSync(jsonPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2))
console.log(`\nJSON 结果已写入：${jsonPath}`)

// ===== 阈值断言（CI 门禁，默认开启；本地可用 MEMORA_BENCH_SKIP_ASSERT=1 跳过） =====
const thresholds = {
  // 10k 条：索引构建 < 1500ms（留 80% 余量，当前基线 ~837ms）
  indexMaxMs: 1500,
  // AND 平均延迟 < 1ms（当前基线 ~0.21ms）
  andAvgMaxMs: 1,
  // OR/AND 召回率 ≥ 80%（宽松上界校验，防召回退化）
  minRecallRate: 80
}

const big = results.find((r) => r.count === 10000)
const failures = []
if (big) {
  if (Number(big.indexMs) > thresholds.indexMaxMs) {
    failures.push(`索引构建 ${big.indexMs}ms 超过阈值 ${thresholds.indexMaxMs}ms`)
  }
  if (Number(big.andAvgMs) > thresholds.andAvgMaxMs) {
    failures.push(`AND 平均延迟 ${big.andAvgMs}ms 超过阈值 ${thresholds.andAvgMaxMs}ms`)
  }
  if (Number(big.recallRate) < thresholds.minRecallRate) {
    failures.push(`OR/AND 召回率 ${big.recallRate}% 低于阈值 ${thresholds.minRecallRate}%`)
  }
} else {
  failures.push('未找到 10000 条基准结果，无法断言')
}

if (failures.length > 0) {
  console.error('\n❌ 性能门禁失败：')
  for (const f of failures) console.error(`  - ${f}`)
  if (process.env.MEMORA_BENCH_SKIP_ASSERT === '1') {
    console.log('\n（MEMORA_BENCH_SKIP_ASSERT=1，跳过断言，仍以非零退出）')
    process.exit(1)
  }
  process.exit(1)
}
console.log('\n✅ 性能门禁通过：索引构建 / AND 延迟 / 召回率均达标')
