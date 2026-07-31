/**
 * 向量数学工具（v1.2 抽取，消除 3 处重复定义）
 *
 * 支持两种输入：number[] 和 Float32Array，避免重复实现。
 */

/**
 * 计算余弦相似度（支持 number[] 和 Float32Array）
 * - 长度不一致时取较短长度（容错，正常应等长）
 * - 任一向量范数为 0 返回 0
 */
export function cosineSimilarity(
  a: number[] | Float32Array,
  b: number[] | Float32Array
): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
