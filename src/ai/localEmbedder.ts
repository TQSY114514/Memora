/**
 * 本地嵌入模块（v1.9 #3：ONNX 推理迁 worker_threads）
 *
 * 本文件为 worker 代理：保持原有导出 API 不变（embedBatchLocal / loadModel /
 * getLocalEmbedderStatus / disposeLocalEmbedder 等），实际推理在
 * localEmbedder.worker.ts 内的独立线程完成，主进程 UI/IPC 不再被阻塞。
 *
 * 设计：
 * - worker 单例懒加载，首次 loadModel/embed 时启动
 * - 主进程同步维护 status，供 getLocalEmbedderStatus() 立即返回
 * - 请求按 reqId 匹配响应，支持并发 embed 调用
 * - worker 不可用时（创建失败）回退到主进程同步推理，保证可用性
 */

import { app } from 'electron'
import { Worker } from 'worker_threads'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'

/** 本地嵌入模型预设 */
export interface LocalEmbeddingModel {
  id: string        // HuggingFace 模型 ID（ONNX 格式）
  label: string     // 显示名
  dim: number       // 向量维度
  size: string      // 模型大小（近似）
  description: string
}

/** 可选模型列表 */
export const LOCAL_EMBEDDING_MODELS: LocalEmbeddingModel[] = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'all-MiniLM-L6-v2（轻量·多语言）',
    dim: 384,
    size: '~23MB',
    description: '轻量级通用嵌入模型，速度快，适合大多数场景'
  },
  {
    id: 'Xenova/multilingual-e5-small',
    label: 'multilingual-e5-small（多语言·含中文优化）',
    dim: 384,
    size: '~120MB',
    description: '多语言嵌入模型，中文表现更好，体积较大'
  },
  {
    id: 'Xenova/bge-small-zh-v1.5',
    label: 'bge-small-zh-v1.5（中文专用）',
    dim: 512,
    size: '~50MB',
    description: '中文专用嵌入模型，中文语义搜索效果最佳'
  }
]

/** 默认模型 */
export const DEFAULT_LOCAL_MODEL = LOCAL_EMBEDDING_MODELS[0]

/** 获取模型维度（预设表查询，用于 embeddingDim 校验） */
export function getLocalModelDim(modelId: string): number {
  const m = LOCAL_EMBEDDING_MODELS.find((m) => m.id === modelId)
  return m?.dim ?? DEFAULT_LOCAL_MODEL.dim
}

/** 当前状态 */
export interface ModelDownloadProgress {
  status?: string
  file?: string | null
  percent?: number | null
  loaded?: number | null
  total?: number | null
}

export type LocalEmbedderStatus =
  | { state: 'idle' }
  | { state: 'loading'; model: string; progress?: ModelDownloadProgress }
  | { state: 'ready'; model: string; dim: number }
  | { state: 'error'; model: string; error: string }

let status: LocalEmbedderStatus = { state: 'idle' }

export function getLocalEmbedderStatus(): LocalEmbedderStatus {
  return status
}

// ===== Download mirror (for users behind GFW / slow connections to huggingface.co) =====

let mirror: string | null = null

function mirrorConfigPath(): string {
  return join(app.getPath('userData'), 'models', 'config.json')
}

function loadMirrorConfig(): string | null {
  try {
    const raw = readFileSync(mirrorConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw) as { mirror?: string }
    return typeof parsed.mirror === 'string' && parsed.mirror.trim() ? parsed.mirror.trim() : null
  } catch {
    return null
  }
}

/** ?????????null = ?? HuggingFace? */
export function getLocalModelMirror(): string | null {
  return mirror
}

/** ?????????????????????? */
export async function setLocalModelMirror(value: string): Promise<string | null> {
  const next = value.trim() || null
  mirror = next
  try {
    const dir = join(app.getPath('userData'), 'models')
    mkdirSync(dir, { recursive: true })
    writeFileSync(mirrorConfigPath(), JSON.stringify({ mirror: next ?? '' }, null, 2), 'utf-8')
  } catch { /* persistence failure is non-fatal */ }
  if (worker) worker.postMessage({ type: 'set-mirror', mirror: next })
  return mirror
}

/** ???????????????????????? */
export async function deleteLocalModel(modelId: string): Promise<{ ok: boolean; error?: string }> {
  if (status.state === 'loading' || (status.state === 'ready' && status.model === modelId)) {
    status = { state: 'idle' }
  }
  try {
    if (!useFallback && worker) {
      const r = await requestWorker<{ ok: boolean; error?: string }>('delete-model', { modelId })
      return r
    }
    const dir = join(app.getPath('userData'), 'models', modelId)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** ???????????????????? */
export function getLocalModelCacheInfo(): { ok: boolean; models: Array<{ id: string; sizeBytes: number }>; totalBytes: number; error?: string } {
  const models: Array<{ id: string; sizeBytes: number }> = []
  let totalBytes = 0
  try {
    const root = join(app.getPath('userData'), 'models')
    if (existsSync(root)) {
      for (const name of readdirSync(root)) {
        const dir = join(root, name)
        if (!statSync(dir).isDirectory()) continue
        let size = 0
        const walk = (d: string): void => {
          for (const f of readdirSync(d)) {
            const fp = join(d, f)
            const st = statSync(fp)
            if (st.isDirectory()) walk(fp)
            else size += st.size
          }
        }
        try { walk(dir) } catch { /* skip unreadable dirs */ }
        if (size > 0) { models.push({ id: name, sizeBytes: size }); totalBytes += size }
      }
    }
  } catch (e) {
    return { ok: false, models: [], totalBytes: 0, error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true, models, totalBytes }
}

// ===== Worker 管理 =====

interface LoadResult { ok: boolean; dim?: number; error?: string }
interface EmbedResult { ok: boolean; vectors?: number[][]; error?: string }

let worker: Worker | null = null
let workerReady = false
/** worker 创建失败时回退到主进程同步推理 */
let useFallback = false

/** 待处理请求的 resolver，按 reqId 索引 */
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
let nextReqId = 1

/** 启动 worker */
function initWorker(): void {
  if (mirror === null) mirror = loadMirrorConfig()
  if (worker || useFallback) return
  try {
    worker = new Worker(join(__dirname, 'localEmbedder.worker.js'))
    worker.on('message', (msg: { type: string; reqId?: number; ok?: boolean; dim?: number; error?: string; vectors?: number[][]; modelId?: string; progress?: ModelDownloadProgress }) => {
      if (msg.type === 'ready') {
        workerReady = true
      } else if (msg.type === 'load-result' || msg.type === 'embed-result') {
        const id = msg.reqId!
        const p = pending.get(id)
        if (p) {
          pending.delete(id)
          const ok = msg.ok === true
          if (msg.type === 'load-result') {
            p.resolve({ ok, dim: msg.dim, error: msg.error } as LoadResult)
          } else {
            p.resolve({ ok, vectors: msg.vectors, error: msg.error } as EmbedResult)
          }
        }
      } else if (msg.type === 'progress') {
        if (msg.reqId !== undefined && pending.has(msg.reqId) && status.state === 'loading') {
          status = { ...status, progress: msg.progress }
        }
      } else if (msg.type === 'set-mirror-result' || msg.type === 'delete-model-result') {
        const id = msg.reqId!
        const p = pending.get(id)
        if (p) {
          pending.delete(id)
          p.resolve({ ok: msg.ok === true, error: msg.error } as LoadResult)
        }
      } else if (msg.type === 'error') {
        // worker 级别错误，reject 所有 pending
        const err = new Error(msg.error ?? 'worker error')
        for (const [, p] of pending) p.reject(err)
        pending.clear()
      }
    })
    worker.on('error', (err) => {
      console.warn('[localEmbedder] worker error, fallback to sync:', err.message)
      useFallback = true
      worker = null
      workerReady = false
      const e = new Error(err.message)
      for (const [, p] of pending) p.reject(e)
      pending.clear()
    })
    worker.postMessage({ type: 'init', cacheDir: join(app.getPath('userData'), 'models'), mirror })
  } catch (err) {
    console.warn('[localEmbedder] worker creation failed, fallback to sync:', err)
    useFallback = true
  }
}

/** 发送请求并等待响应 */
function requestWorker<T>(type: 'load' | 'embed' | 'delete-model', payload: { modelId?: string; inputs?: string[] }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!worker) {
      reject(new Error('worker not initialized'))
      return
    }
    const reqId = nextReqId++
    pending.set(reqId, { resolve: resolve as (v: any) => void, reject })
    worker.postMessage({ type, reqId, ...payload })
  })
}

// ===== Fallback：主进程同步推理（worker 不可用时用） =====

let fbPipeline: any = null
let fbExtractor: any = null

async function fbLoad(modelId: string): Promise<LoadResult> {
  try {
    if (!fbPipeline) {
      const transformers = await import('@huggingface/transformers')
      fbPipeline = transformers.pipeline
    }
    const { env } = await import('@huggingface/transformers')
    env.cacheDir = join(app.getPath('userData'), 'models')
    if (mirror) env.remoteHost = mirror
    try {
      fbExtractor = await fbPipeline('feature-extraction', modelId, { dtype: 'q8' })
    } catch {
      fbExtractor = await fbPipeline('feature-extraction', modelId, { dtype: 'fp32' })
    }
    const probe = await fbExtractor(['dim-probe'], { pooling: 'mean', normalize: true })
    const d = probe.dims as number[]
    const dim = d.length === 2 ? d[1] : (d[2] ?? 0)
    return { ok: true, dim }
  } catch (e) {
    fbExtractor = null
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function fbEmbed(inputs: string[]): Promise<EmbedResult> {
  if (!fbExtractor) return { ok: false, error: '模型未加载' }
  try {
    const truncated = inputs.map((t) => (t.length > 2000 ? t.slice(0, 2000) + '…' : t))
    const output = await fbExtractor(truncated, { pooling: 'mean', normalize: true })
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
    // fallback：手动 pooling
    const [batch, seqLen, dim] = dims
    const vectors: number[][] = []
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
      vectors.push(vec)
    }
    return { ok: true, vectors }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ===== 对外 API（签名不变） =====

/**
 * 加载模型（懒加载，重复调用会复用）
 * @param modelId HuggingFace 模型 ID
 */
export async function loadModel(modelId: string): Promise<void> {
  // 已加载相同模型直接返回
  if (status.state === 'ready' && status.model === modelId) return

  status = { state: 'loading', model: modelId }
  try {
    if (!useFallback) {
      if (!worker) initWorker()
      // worker 初始化失败时 initWorker 会置 useFallback=true
      if (!useFallback && worker) {
        // 等待 worker ready（init 消息回执）
        await waitForWorkerReady()
        const r = await requestWorker<LoadResult>('load', { modelId })
        if (!r.ok || !r.dim) throw new Error(r.error ?? '模型加载失败')
        status = { state: 'ready', model: modelId, dim: r.dim }
        return
      }
    }
    // fallback 同步路径
    const r = await fbLoad(modelId)
    if (!r.ok || !r.dim) throw new Error(r.error ?? '模型加载失败')
    status = { state: 'ready', model: modelId, dim: r.dim }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    status = { state: 'error', model: modelId, error: err }
    throw e
  }
}

/** 等待 worker ready（带超时） */
function waitForWorkerReady(timeoutMs = 5000): Promise<void> {
  if (workerReady) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const start = Date.now()
    let settled = false
    const onError = () => {
      if (settled) return
      settled = true
      clearInterval(timer)
      reject(new Error('worker init failed'))
    }
    const timer = setInterval(() => {
      if (workerReady) {
        if (settled) return
        settled = true
        clearInterval(timer)
        if (worker) worker.off('error', onError)
        resolve()
      } else if (Date.now() - start > timeoutMs) {
        if (settled) return
        settled = true
        clearInterval(timer)
        if (worker) worker.off('error', onError)
        reject(new Error('worker init timeout'))
      }
    }, 50)
    if (worker) {
      worker.once('error', onError)
    }
  })
}

/**
 * 批量本地嵌入
 * @param inputs 文本数组
 * @param modelId 模型 ID（若与已加载模型不同会自动切换）
 * @returns 向量数组
 */
export async function embedBatchLocal(
  inputs: string[],
  modelId: string = DEFAULT_LOCAL_MODEL.id
): Promise<number[][]> {
  if (inputs.length === 0) return []

  // 确保模型已加载
  if (status.state !== 'ready' || status.model !== modelId) {
    await loadModel(modelId)
  }

  if (!useFallback && worker) {
    const r = await requestWorker<EmbedResult>('embed', { inputs })
    if (!r.ok || !r.vectors) throw new Error(r.error ?? '嵌入推理失败')
    return r.vectors
  }
  const r = await fbEmbed(inputs)
  if (!r.ok || !r.vectors) throw new Error(r.error ?? '嵌入推理失败')
  return r.vectors
}

/**
 * 单条文本本地嵌入
 */
export async function embedQueryLocal(
  text: string,
  modelId?: string
): Promise<number[]> {
  const vectors = await embedBatchLocal([text], modelId)
  return vectors[0]
}

/** 释放模型资源（切换模型或退出时调用） */
export async function disposeLocalEmbedder(): Promise<void> {
  if (worker) {
    try {
      worker.postMessage({ type: 'dispose' })
      worker.terminate()
    } catch {
      // 忽略终止错误
    }
    worker = null
    workerReady = false
  }
  // fallback 资源
  if (fbExtractor && typeof fbExtractor.dispose === 'function') {
    try { await fbExtractor.dispose() } catch { /* 忽略 */ }
  }
  fbExtractor = null
  status = { state: 'idle' }
}
