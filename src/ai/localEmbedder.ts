/**
 * 本地嵌入模块（v1.8 #15）
 *
 * 使用 @huggingface/transformers 在本地运行 ONNX 格式的 embedding 模型，
 * 无需外部 API，隐私优先。
 *
 * 设计：
 * - 单例 pipeline，懒加载（首次调用时加载模型）
 * - 模型缓存到 userData/models/，首次使用时从 HuggingFace CDN 下载
 * - mean pooling 将 token 级输出聚合为句子向量
 * - 动态 import() 加载 ESM 包（主进程为 CommonJS）
 *
 * 默认模型：Xenova/all-MiniLM-L6-v2（384 维，~23MB，多语言）
 */

import { app } from 'electron'
import { join } from 'path'

// 懒加载的 pipeline 与模型元信息
let pipelineFn: any = null
let extractor: any = null
let loadingPromise: Promise<void> | null = null

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

/** 获取模型维度 */
export function getLocalModelDim(modelId: string): number {
  const m = LOCAL_EMBEDDING_MODELS.find((m) => m.id === modelId)
  return m?.dim ?? DEFAULT_LOCAL_MODEL.dim
}

/** 当前加载的模型 ID */
let currentModelId: string | null = null

/** 当前状态 */
export type LocalEmbedderStatus =
  | { state: 'idle' }
  | { state: 'loading'; model: string }
  | { state: 'ready'; model: string; dim: number }
  | { state: 'error'; model: string; error: string }

let status: LocalEmbedderStatus = { state: 'idle' }

export function getLocalEmbedderStatus(): LocalEmbedderStatus {
  return status
}

/**
 * 加载模型（懒加载，重复调用会复用）
 * @param modelId HuggingFace 模型 ID
 */
export async function loadModel(modelId: string): Promise<void> {
  if (extractor && currentModelId === modelId) return

  // 如果正在加载其他模型，等待完成
  if (loadingPromise) await loadingPromise

  // 加载完成后如果已匹配则直接返回
  if (extractor && currentModelId === modelId) return

  loadingPromise = doLoadModel(modelId)
  await loadingPromise
  loadingPromise = null
}

async function doLoadModel(modelId: string): Promise<void> {
  status = { state: 'loading', model: modelId }
  try {
    // 动态 import ESM 模块（主进程为 CommonJS）
    if (!pipelineFn) {
      const transformers = await import('@huggingface/transformers')
      pipelineFn = transformers.pipeline
    }

    // 设置模型缓存目录到用户数据目录
    const { env } = await import('@huggingface/transformers')
    env.cacheDir = join(app.getPath('userData'), 'models')

    // 创建 feature-extraction pipeline
    extractor = await pipelineFn('feature-extraction', modelId, {
      dtype: 'fp32'
    })
    currentModelId = modelId

    const dim = getLocalModelDim(modelId)
    status = { state: 'ready', model: modelId, dim }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    status = { state: 'error', model: modelId, error: err }
    // 重置以便重试
    extractor = null
    currentModelId = null
    throw e
  }
}

/**
 * 对文本进行 mean pooling（将 token 级输出聚合为句子向量）
 * @param output pipeline 输出（Tensor）
 * @returns 归一化后的向量
 */
function meanPoolAndNormalize(output: any): number[][] {
  // output 可能是 { data: Float32Array, dims: [batch, seq, dim] } 或类似结构
  const data = output.data as Float32Array | number[]
  const dims = output.dims as number[]

  if (dims.length !== 3) {
    throw new Error(`预期 3D 张量 [batch, seq, dim]，实际 ${dims.length}D`)
  }

  const [batch, seqLen, dim] = dims
  const results: number[][] = []

  for (let b = 0; b < batch; b++) {
    const vec = new Array(dim).fill(0)

    // Mean pooling：对每个维度取所有 token 的平均值
    for (let s = 0; s < seqLen; s++) {
      const offset = (b * seqLen + s) * dim
      for (let d = 0; d < dim; d++) {
        vec[d] += data[offset + d] as number
      }
    }
    for (let d = 0; d < dim; d++) {
      vec[d] /= seqLen
    }

    // L2 归一化（便于余弦相似度计算）
    let norm = 0
    for (let d = 0; d < dim; d++) norm += vec[d] * vec[d]
    norm = Math.sqrt(norm) || 1
    for (let d = 0; d < dim; d++) vec[d] /= norm

    results.push(vec)
  }

  return results
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
  if (!extractor || currentModelId !== modelId) {
    await loadModel(modelId)
  }

  // 截断超长文本（all-MiniLM-L6-v2 限制 256 tokens，保守按字符截断）
  const truncated = inputs.map((t) => {
    if (t.length > 2000) return t.slice(0, 2000) + '…'
    return t
  })

  // 执行推理
  const output = await extractor(truncated, {
    pooling: 'mean',
    normalize: true
  })

  // pipeline 已配置 pooling + normalize，直接提取向量
  // output.dims = [batch, dim]
  const data = output.data as Float32Array | number[]
  const dims = output.dims as number[]

  if (dims.length === 2) {
    const [batch, dim] = dims
    const results: number[][] = []
    for (let b = 0; b < batch; b++) {
      const offset = b * dim
      results.push(Array.from(data.slice(offset, offset + dim)))
    }
    return results
  }

  // fallback：手动 pooling（如果 pipeline 未配置 pooling）
  return meanPoolAndNormalize(output)
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
  if (extractor && typeof extractor.dispose === 'function') {
    try {
      await extractor.dispose()
    } catch {
      // 忽略释放错误
    }
  }
  extractor = null
  currentModelId = null
  status = { state: 'idle' }
}
