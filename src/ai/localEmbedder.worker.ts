/**
 * 本地嵌入 Worker（v1.9 #3）
 *
 * 把 ONNX 推理从主进程迁到 worker_threads：
 * - 主进程 UI/IPC 不再被模型加载和推理阻塞
 * - worker 内独立 V8 isolate，模型/ONNX 运行时只加载一次
 * - 主进程通过 postMessage 请求，按 reqId 匹配响应（支持并发）
 *
 * 通信协议：
 *   main → worker: { type: 'init', cacheDir }
 *   main → worker: { type: 'load', reqId, modelId }
 *   main → worker: { type: 'embed', reqId, inputs: string[] }
 *   main → worker: { type: 'dispose' }
 *   worker → main: { type: 'ready' }
 *   worker → main: { type: 'load-result', reqId, ok, dim?, error? }
 *   worker → main: { type: 'embed-result', reqId, ok, vectors?: number[][], error? }
 *   worker → main: { type: 'error', error }
 */
// 标记为模块（避免与其他 worker 的全局 parentPort 声明冲突）
export {}

const { parentPort } = require('worker_threads')

let pipelineFn: any = null
let extractor: any = null
let cacheDir: string | null = null

/** mean pooling fallback（pipeline 未配置 pooling 时用） */
function meanPoolAndNormalize(output: any): number[][] {
  const data = output.data as Float32Array | number[]
  const dims = output.dims as number[]
  if (dims.length !== 3) {
    throw new Error(`预期 3D 张量 [batch, seq, dim]，实际 ${dims.length}D`)
  }
  const [batch, seqLen, dim] = dims
  const results: number[][] = []
  for (let b = 0; b < batch; b++) {
    const vec = new Array(dim).fill(0)
    for (let s = 0; s < seqLen; s++) {
      const offset = (b * seqLen + s) * dim
      for (let d = 0; d < dim; d++) vec[d] += data[offset + d] as number
    }
    for (let d = 0; d < dim; d++) vec[d] /= seqLen
    let norm = 0
    for (let d = 0; d < dim; d++) norm += vec[d] * vec[d]
    norm = Math.sqrt(norm) || 1
    for (let d = 0; d < dim; d++) vec[d] /= norm
    results.push(vec)
  }
  return results
}

async function handleLoad(modelId: string): Promise<{ ok: boolean; dim?: number; error?: string }> {
  try {
    if (!pipelineFn) {
      const transformers = await import('@huggingface/transformers')
      pipelineFn = transformers.pipeline
    }
    const { env } = await import('@huggingface/transformers')
    if (cacheDir) env.cacheDir = cacheDir

    // 优先 q8 量化（内存减半、推理提速 ~2×），模型无 q8 文件时回退 fp32
    try {
      extractor = await pipelineFn('feature-extraction', modelId, { dtype: 'q8' })
    } catch (q8Err) {
      console.warn(`[localEmbedder.worker] q8 量化加载失败，回退 fp32: ${(q8Err as Error).message}`)
      extractor = await pipelineFn('feature-extraction', modelId, { dtype: 'fp32' })
    }

    // 从首次推理输出推断维度，避免硬编码
    const probe = await extractor(['dim-probe'], { pooling: 'mean', normalize: true })
    const probeDims = probe.dims as number[]
    const dim = probeDims.length === 2 ? probeDims[1] : (probeDims[2] ?? 0)
    return { ok: true, dim }
  } catch (e) {
    extractor = null
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function handleEmbed(inputs: string[]): Promise<{ ok: boolean; vectors?: number[][]; error?: string }> {
  try {
    if (!extractor) {
      return { ok: false, error: '模型未加载' }
    }
    const truncated = inputs.map((t) => (t.length > 2000 ? t.slice(0, 2000) + '…' : t))
    const output = await extractor(truncated, { pooling: 'mean', normalize: true })
    const data = output.data as Float32Array | number[]
    const dims = output.dims as number[]

    if (dims.length === 2) {
      const [batch, dim] = dims
      const vectors: number[][] = []
      for (let b = 0; b < batch; b++) {
        const offset = b * dim
        vectors.push(Array.from(data.slice(offset, offset + dim)))
      }
      return { ok: true, vectors }
    }
    return { ok: true, vectors: meanPoolAndNormalize(output) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

parentPort!.on('message', async (msg: { type: string; reqId?: number; modelId?: string; inputs?: string[]; cacheDir?: string }) => {
  try {
    if (msg.type === 'init') {
      cacheDir = msg.cacheDir ?? null
      parentPort!.postMessage({ type: 'ready' })
    } else if (msg.type === 'load') {
      const r = await handleLoad(msg.modelId!)
      parentPort!.postMessage({ type: 'load-result', reqId: msg.reqId, ...r })
    } else if (msg.type === 'embed') {
      const r = await handleEmbed(msg.inputs!)
      parentPort!.postMessage({ type: 'embed-result', reqId: msg.reqId, ...r })
    } else if (msg.type === 'dispose') {
      if (extractor && typeof extractor.dispose === 'function') {
        try { await extractor.dispose() } catch { /* 忽略 */ }
      }
      extractor = null
    }
  } catch (err) {
    parentPort!.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
  }
})
