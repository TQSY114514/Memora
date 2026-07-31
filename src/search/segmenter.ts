/**
 * 中文分词工具（FTS5 预处理）
 *
 * 痛点：FTS5 的 unicode61 tokenizer 对中文逐字切分，
 * 搜"知识管理工具"可能因分词不匹配而漏掉结果。
 *
 * 方案：用 Node 18+ 内置的 Intl.Segmenter 做中文分词，
 * 写入 FTS 前对文本做分词（空格分隔），查询时同样分词。
 * 这样 unicode61 按空格切分就能正确命中词组。
 *
 * 零依赖，无需 jieba-wasm 等额外库。
 */

let segmenter: Intl.Segmenter | null = null

function getSegmenter(): Intl.Segmenter {
  if (!segmenter) {
    segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  }
  return segmenter
}

/**
 * 对文本做中文分词，返回空格分隔的词序列
 * - 中文连续段落按词切分
 * - 英文/数字保持原样（unicode61 本身能处理）
 * - 过滤标点和空白
 */
export function segment(text: string): string {
  if (!text) return ''
  const seg = getSegmenter()
  const tokens: string[] = []
  for (const { segment, isWordLike } of seg.segment(text)) {
    if (!isWordLike) continue
    const trimmed = segment.trim()
    if (trimmed) tokens.push(trimmed)
  }
  return tokens.join(' ')
}

/**
 * 从查询字符串提取搜索词（分词 + 空格拆词合并）
 * 返回去重的词数组
 */
export function segmentQuery(query: string): string[] {
  const segmented = segment(query)
  const terms = segmented
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  // 去重，保持顺序
  return Array.from(new Set(terms))
}
