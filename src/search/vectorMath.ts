/**
 * 向量数学工具（v1.9）
 *
 * 从 semantic.worker.ts 提取的核心算法，使其可独立单测：
 * - MinHeap：top-K 维护，O(n log k) 替代全量排序
 * - quantizeToInt8 / dotProductInt8：int8 量化与混合精度点积
 * - precomputeNorm：L2 范数预计算
 *
 * 量化策略：对称 int8 量化（int8 = round(float * 127)）
 * 嵌入向量经 L2 归一化后值域 [-1,1]，量化误差 ~0.008，对 top-k 排序影响可忽略
 */

/**
 * Top-K 最小堆（堆顶是最小 score，用于高效维护前 K 大元素）
 * O(n log k) 替代全量 sort O(n log n)，k 远小于 n 时收益显著
 */
export class MinHeap<T> {
  private arr: T[] = []
  constructor(private key: (t: T) => number) {}

  get size(): number {
    return this.arr.length
  }

  peek(): T | undefined {
    return this.arr[0]
  }

  push(item: T): void {
    this.arr.push(item)
    this.bubbleUp(this.arr.length - 1)
  }

  /** 弹出堆顶（最小元素） */
  pop(): T | undefined {
    const top = this.arr[0]
    const last = this.arr.pop()
    if (this.arr.length > 0 && last !== undefined) {
      this.arr[0] = last
      this.bubbleDown(0)
    }
    return top
  }

  private bubbleUp(i: number): void {
    const k = this.key
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k(this.arr[i]) < k(this.arr[p])) {
        ;[this.arr[i], this.arr[p]] = [this.arr[p], this.arr[i]]
        i = p
      } else break
    }
  }

  private bubbleDown(i: number): void {
    const n = this.arr.length
    const k = this.key
    while (true) {
      const l = 2 * i + 1
      const r = 2 * i + 2
      let smallest = i
      if (l < n && k(this.arr[l]) < k(this.arr[smallest])) smallest = l
      if (r < n && k(this.arr[r]) < k(this.arr[smallest])) smallest = r
      if (smallest !== i) {
        ;[this.arr[i], this.arr[smallest]] = [this.arr[smallest], this.arr[i]]
        i = smallest
      } else break
    }
  }
}

/**
 * 对称 int8 量化：float → int8
 * int8 = round(float * 127)，钳位到 [-128, 127]
 */
export function quantizeToInt8(vec: Float32Array | number[]): Int8Array {
  const out = new Int8Array(vec.length)
  for (let i = 0; i < vec.length; i++) {
    let q = Math.round(vec[i] * 127)
    if (q > 127) q = 127
    else if (q < -128) q = -128
    out[i] = q
  }
  return out
}

/**
 * 混合精度点积：float(query) × int8(stored)
 * stored 已量化为 int8（= round(float * 127)），故 dot_float = dot_int8 / 127
 *
 * @param queryVec 查询向量（float，未量化）
 * @param storedVec 存储向量（int8 量化后）
 * @returns float 域点积（已除以 127 还原）
 */
export function dotProductInt8(queryVec: Float32Array | number[], storedVec: Int8Array): number {
  let dotScaled = 0  // = dot_float * 127
  const len = Math.min(queryVec.length, storedVec.length)
  for (let i = 0; i < len; i++) dotScaled += queryVec[i] * storedVec[i]
  return dotScaled / 127
}

/** 预计算 L2 范数 */
export function precomputeNorm(vec: Float32Array | number[]): number {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  return Math.sqrt(norm)
}

/**
 * 余弦相似度（混合精度版）
 * score = dot(q, s) / (|q| * |s|)
 * 其中 dot 用 int8 混合精度，范数用原始 float（精度无损）
 */
export function cosineInt8(
  queryVec: Float32Array | number[],
  storedVec: Int8Array,
  storedNorm: number
): number {
  const queryNorm = precomputeNorm(queryVec)
  if (queryNorm === 0 || storedNorm === 0) return 0
  return dotProductInt8(queryVec, storedVec) / (queryNorm * storedNorm)
}
