import { cosineSimilarity } from '@shared/math'

/** 待精排的文档（来自融合检索结果） */
export interface RerankDocument {
  sessionId: string
  title: string
  content: string
  fusionScore: number
}

export interface RerankOptions {
  /** embedding 函数：输入文本数组，返回向量数组（第 0 个为 query 向量） */
  embed?: (texts: string[]) => Promise<number[][]>
  /** 精排权重（0-1），默认 0.5 */
  weight?: number
  /** 参与精排的最大候选数，默认 20 */
  topK?: number
}

export interface RerankedDoc extends RerankDocument {
  rerankScore: number
  finalScore: number
}

/**
 * 对融合检索结果做精排（可选）。
 *
 * 用 query 与文档的向量余弦相似度作为精排信号，与融合得分按权重合并：
 *   finalScore = (1 - weight) * fusionScore + weight * rerankScore
 *
 * embed 未提供或调用失败时返回原样（保持 fusionScore 顺序），
 * 保证默认行为稳定、不因无模型而回退。
 */
export async function rerank(
  query: string,
  results: RerankDocument[],
  options?: RerankOptions
): Promise<RerankedDoc[]> {
  if (results.length === 0) return []

  const topK = options?.topK ?? 20
  const weight = options?.weight ?? 0.5
  const embed = options?.embed

  const identity = (r: RerankDocument): RerankedDoc => ({
    ...r,
    rerankScore: 0,
    finalScore: r.fusionScore
  })

  if (!embed) return results.map(identity)

  const candidates = results.slice(0, topK)
  const rest = results.slice(topK)

  try {
    const texts = [query, ...candidates.map((c) => `${c.title} ${c.content}`.slice(0, 500))]
    const vecs = await embed(texts)
    if (!vecs || vecs.length !== texts.length) return results.map(identity)

    const queryVec = vecs[0]
    const scored: RerankedDoc[] = candidates.map((c, i) => {
      const rerankScore = cosineSimilarity(queryVec, vecs[i + 1])
      const finalScore = (1 - weight) * c.fusionScore + weight * rerankScore
      return { ...c, rerankScore, finalScore }
    })
    scored.sort((a, b) => b.finalScore - a.finalScore)
    return [...scored, ...rest.map(identity)]
  } catch {
    return results.map(identity)
  }
}