/**
 * 语义搜索 Worker（独立文件，消除 eval:true 安全隐患）
 *
 * 由 semantic.ts 通过 `new Worker(__dirname/semantic.worker.js)` 启动。
 * 职责：加载全库向量到内存缓存，对查询向量做余弦相似度暴力扫描，返回 Top-K。
 *
 * 向量存储格式：DB 中为 BLOB（Float32Array 二进制 buffer），读取零解析。
 *
 * 性能优化（v1.9）：
 * - 范数预计算：loadCache 时一次性算好每个向量的 L2 范数，搜索时省去重复计算（省 ~1/3 乘加）
 * - top-k 最小堆：维护大小为 K 的最小堆，O(n log k) 替代全量排序 O(n log n)
 * - int8 量化缓存：float32 向量入库时量化为 int8 存储，内存占用 4x↓，缓存命中率↑
 *   点积用 float(query) × int8(stored) 累加后 /127 还原；范数用原始 float 计算，精度无损
 *   嵌入向量经 L2 归一化值域 [-1,1]，int8 量化精度 ~0.008，对 top-k 排序影响可忽略
 *
 * 核心算法（MinHeap / 量化 / 点积）已提取到 vectorMath.ts，可独立单测
 */
// 标记为模块（避免与其他 worker 的全局 parentPort 声明冲突）
export {}

const { parentPort } = require('worker_threads')
const { MinHeap, quantizeToInt8, precomputeNorm } = require('./vectorMath')

interface CacheEntry {
  messageId: string
  sessionId: string
  embedding: Int8Array  // int8 量化后的向量（v1.9：4x 内存节省）
  norm: number  // 原始 float 向量的 L2 范数（量化前计算，精度无损）
}

let cache: CacheEntry[] | null = null
let dbPath: string | null = null
let Database: typeof import('better-sqlite3') | null = null

function loadCache(): number {
  if (!Database) {
    Database = require('better-sqlite3')
  }
  if (!dbPath) {
    throw new Error('dbPath not initialized')
  }
  const DbImpl = Database as typeof import('better-sqlite3')
  const db = new DbImpl(dbPath, { readonly: true, fileMustExist: true })
  db.pragma('journal_mode = WAL')
  const rows = db
    .prepare('SELECT message_id, session_id, embedding FROM message_embeddings')
    .all() as Array<{ message_id: string; session_id: string; embedding: Buffer }>
  db.close()
  // BLOB → Float32Array → int8 量化缓存；范数用原始 float 计算（精度无损）
  cache = rows.map((r) => {
    const f32 = new Float32Array(
      r.embedding.buffer,
      r.embedding.byteOffset,
      r.embedding.byteLength / 4
    )
    // 原始 float 范数（量化前计算，精度无损）
    const norm = precomputeNorm(f32)
    // 对称 int8 量化（核心逻辑在 vectorMath.ts，可单测）
    const quantized = quantizeToInt8(f32)
    return { messageId: r.message_id, sessionId: r.session_id, embedding: quantized, norm }
  })
  return cache.length
}

parentPort!.on('message', (msg: { type: string; dbPath?: string; queryVec?: number[]; limit?: number; threshold?: number }) => {
  if (msg.type === 'init') {
    dbPath = msg.dbPath!
    parentPort!.postMessage({ type: 'ready' })
  } else if (msg.type === 'search') {
    try {
      if (!cache) {
        const n = loadCache()
        parentPort!.postMessage({ type: 'cacheLoaded', count: n })
      }
      const queryVec = new Float32Array(msg.queryVec!)
      const limit = msg.limit || 20
      const threshold = msg.threshold || 0.25
      const qlen = queryVec.length

      // 预计算查询向量范数
      const queryNorm = precomputeNorm(queryVec)
      if (queryNorm === 0) {
        parentPort!.postMessage({ type: 'result', data: [] })
        return
      }

      // top-k 最小堆：维护 score 最大的 K 条（堆顶是 K 条中最小的）
      // require 导入的 MinHeap 为 any，不需泛型参数
      const heap = new MinHeap(
        (x: { score: number }) => x.score
      )

      for (const row of cache!) {
        // 维度不一致（切换 embedding 模型）直接跳过
        if (row.embedding.length !== qlen || row.norm === 0) continue

        // 混合精度点积：float(query) × int8(stored) 累加，/127 还原为 float 域点积
        // stored 已量化为 int8（= round(float * 127)），故 dot_float = dot_int8 / 127
        let dotScaled = 0  // = dot_float * 127
        const emb = row.embedding
        for (let i = 0; i < qlen; i++) dotScaled += queryVec[i] * emb[i]
        const score = dotScaled / (127 * queryNorm * row.norm)

        if (score < threshold) continue

        if (heap.size < limit) {
          heap.push({ messageId: row.messageId, sessionId: row.sessionId, score })
        } else if (score > heap.peek().score) {
          heap.pop()
          heap.push({ messageId: row.messageId, sessionId: row.sessionId, score })
        }
      }

      // 堆中是 top-k（无序），弹出并逆序为降序
      const top: Array<{ messageId: string; sessionId: string; score: number }> = []
      while (heap.size > 0) top.push(heap.pop())
      top.reverse()

      parentPort!.postMessage({ type: 'result', data: top })
    } catch (err) {
      parentPort!.postMessage({ type: 'error', error: (err as Error).message || String(err) })
    }
  } else if (msg.type === 'invalidate') {
    cache = null
  }
})
