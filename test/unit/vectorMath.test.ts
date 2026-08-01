import { describe, it, expect } from 'vitest'
import { MinHeap, quantizeToInt8, dotProductInt8, precomputeNorm, cosineInt8 } from '../../src/search/vectorMath'

describe('MinHeap', () => {
  it('维护固定大小的 top-k（堆顶是最小值）', () => {
    const heap = new MinHeap<{ id: number; score: number }>((x) => x.score)
    const k = 3
    // 插入 5 个元素，只保留 score 最大的 3 个
    const items = [
      { id: 1, score: 0.1 },
      { id: 2, score: 0.9 },
      { id: 3, score: 0.5 },
      { id: 4, score: 0.3 },
      { id: 5, score: 0.8 }
    ]
    for (const item of items) {
      if (heap.size < k) {
        heap.push(item)
      } else if (item.score > heap.peek()!.score) {
        heap.pop()
        heap.push(item)
      }
    }
    // 堆中应剩 {0.9, 0.8, 0.5}，堆顶是 0.5（最小）
    expect(heap.size).toBe(3)
    expect(heap.peek()!.score).toBe(0.5)

    // 弹出应为升序（最小堆）
    const popped: number[] = []
    while (heap.size > 0) popped.push(heap.pop()!.score)
    expect(popped).toEqual([0.5, 0.8, 0.9])
  })

  it('空堆 peek/pop 返回 undefined', () => {
    const heap = new MinHeap<number>((x) => x)
    expect(heap.peek()).toBeUndefined()
    expect(heap.pop()).toBeUndefined()
  })

  it('push 后立即 pop 保持堆性质', () => {
    const heap = new MinHeap<number>((x) => x)
    heap.push(5)
    heap.push(2)
    heap.push(8)
    heap.push(1)
    heap.push(3)
    const sorted: number[] = []
    while (heap.size > 0) sorted.push(heap.pop()!)
    expect(sorted).toEqual([1, 2, 3, 5, 8])
  })

  it('支持负数 score', () => {
    const heap = new MinHeap<{ s: number }>((x) => x.s)
    heap.push({ s: -0.5 })
    heap.push({ s: -0.1 })
    heap.push({ s: -0.9 })
    const result: number[] = []
    while (heap.size > 0) result.push(heap.pop()!.s)
    expect(result).toEqual([-0.9, -0.5, -0.1])
  })
})

describe('quantizeToInt8', () => {
  it('正确量化 L2 归一化向量（值域 [-1,1]）', () => {
    const vec = new Float32Array([1.0, -1.0, 0.5, -0.5, 0.0])
    const q = quantizeToInt8(vec)
    expect(q).toBeInstanceOf(Int8Array)
    expect(q[0]).toBe(127)   // 1.0 * 127 = 127
    expect(q[1]).toBe(-127)  // -1.0 * 127 = -127
    expect(q[2]).toBe(64)    // 0.5 * 127 = 63.5 → Math.round 向 +∞ = 64
    expect(q[3]).toBe(-63)   // -0.5 * 127 = -63.5 → Math.round 向 +∞ = -63
    expect(q[4]).toBe(0)
  })

  it('钳位超出 [-1,1] 的值', () => {
    const vec = new Float32Array([2.0, -2.0, 100.0, -100.0])
    const q = quantizeToInt8(vec)
    expect(q[0]).toBe(127)   // 钳位到 127
    expect(q[1]).toBe(-128)  // 钳位到 -128
    expect(q[2]).toBe(127)
    expect(q[3]).toBe(-128)
  })

  it('量化后内存占用为 float32 的 1/4', () => {
    const f32 = new Float32Array(1000)
    const i8 = quantizeToInt8(f32)
    expect(i8.byteLength).toBe(f32.byteLength / 4)
    expect(i8.byteLength).toBe(1000)  // 1000 bytes vs 4000 bytes
  })
})

describe('dotProductInt8（混合精度点积）', () => {
  it('量化+反解后点积与 float 域点积误差 < 0.01', () => {
    // 模拟 L2 归一化向量
    const a = new Float32Array([0.3, -0.4, 0.5, 0.6, -0.2, 0.1])
    const b = new Float32Array([0.4, 0.3, -0.5, 0.2, 0.1, -0.6])

    // float 域点积（ground truth）
    let floatDot = 0
    for (let i = 0; i < a.length; i++) floatDot += a[i] * b[i]

    // int8 混合精度点积
    const bq = quantizeToInt8(b)
    const int8Dot = dotProductInt8(a, bq)

    // 量化误差应 < 0.01（int8 量化精度 ~0.008）
    expect(Math.abs(floatDot - int8Dot)).toBeLessThan(0.01)
  })

  it('相同向量点积 > 不同向量点积（相似性保持）', () => {
    const v = new Float32Array([0.5, 0.5, 0.5, 0.5])
    const different = new Float32Array([-0.5, -0.5, 0.5, 0.5])

    const selfDot = dotProductInt8(v, quantizeToInt8(v))
    const diffDot = dotProductInt8(v, quantizeToInt8(different))

    expect(selfDot).toBeGreaterThan(diffDot)
    expect(selfDot).toBeGreaterThan(0)
  })
})

describe('precomputeNorm', () => {
  it('正确计算 L2 范数', () => {
    const v = new Float32Array([3, 4])
    expect(precomputeNorm(v)).toBeCloseTo(5)  // 3-4-5 三角
  })

  it('零向量范数为 0', () => {
    expect(precomputeNorm(new Float32Array([0, 0, 0]))).toBe(0)
  })

  it('L2 归一化向量范数为 1', () => {
    const v = new Float32Array([0.6, 0.8])  // 0.6² + 0.8² = 1
    expect(precomputeNorm(v)).toBeCloseTo(1)
  })
})

describe('cosineInt8（混合精度余弦相似度）', () => {
  it('相同方向向量相似度接近 1', () => {
    const v = new Float32Array([0.6, 0.8])
    const vNorm = precomputeNorm(v)
    const score = cosineInt8(v, quantizeToInt8(v), vNorm)
    expect(score).toBeGreaterThan(0.99)
  })

  it('正交向量相似度接近 0', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0, 1])
    const bNorm = precomputeNorm(b)
    const score = cosineInt8(a, quantizeToInt8(b), bNorm)
    expect(Math.abs(score)).toBeLessThan(0.01)
  })

  it('相反方向向量相似度接近 -1', () => {
    const a = new Float32Array([0.6, 0.8])
    const b = new Float32Array([-0.6, -0.8])
    const bNorm = precomputeNorm(b)
    const score = cosineInt8(a, quantizeToInt8(b), bNorm)
    expect(score).toBeLessThan(-0.99)
  })

  it('量化后 top-k 排序与 float 域一致', () => {
    // 模拟 5 个候选向量，验证 int8 量化的相似度排序与 float 一致
    const query = new Float32Array([0.5, 0.5, 0.5, 0.5])
    const candidates = [
      new Float32Array([0.5, 0.5, 0.5, 0.5]),    // 完全相同
      new Float32Array([0.6, 0.4, 0.5, 0.5]),    // 高度相似
      new Float32Array([0.5, -0.3, 0.5, 0.5]),   // 部分相似
      new Float32Array([-0.5, -0.5, 0.5, 0.5]),  // 正交
      new Float32Array([-0.5, -0.5, -0.5, -0.5]) // 相反
    ]

    const floatScores = candidates.map((c) => {
      let dot = 0
      for (let i = 0; i < c.length; i++) dot += query[i] * c[i]
      return dot / (precomputeNorm(query) * precomputeNorm(c))
    })
    const int8Scores = candidates.map((c) => cosineInt8(query, quantizeToInt8(c), precomputeNorm(c)))

    // 排序后的索引顺序应一致
    const floatOrder = floatScores.map((_, i) => i).sort((a, b) => floatScores[b] - floatScores[a])
    const int8Order = int8Scores.map((_, i) => i).sort((a, b) => int8Scores[b] - int8Scores[a])
    expect(int8Order).toEqual(floatOrder)
  })

  it('零向量返回 0（避免 NaN）', () => {
    const zero = new Float32Array([0, 0, 0])
    const v = new Float32Array([1, 1, 1])
    expect(cosineInt8(zero, quantizeToInt8(v), precomputeNorm(v))).toBe(0)
    expect(cosineInt8(v, quantizeToInt8(zero), 0)).toBe(0)
  })
})
