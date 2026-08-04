import { describe, it, expect } from 'vitest'
import { rerank } from '../../src/search/reranker'

describe('reranker', () => {
  it('returns all results unchanged when embed is not provided', async () => {
    const docs = [
      { sessionId: 's1', title: 'A', content: 'hello world', fusionScore: 0.8 },
      { sessionId: 's2', title: 'B', content: 'foo bar', fusionScore: 0.6 }
    ]
    const result = await rerank('hello', docs)
    expect(result.length).toBe(2)
    expect(result[0].sessionId).toBe('s1')
    expect(result[1].sessionId).toBe('s2')
  })

  it('reorders results according to rerank score when embed is provided', async () => {
    // mock embed: "hello world" gets higher similarity to query "hello"
    const docs = [
      { sessionId: 's1', title: 'A', content: 'hello world', fusionScore: 0.6 },
      { sessionId: 's2', title: 'B', content: 'random text', fusionScore: 0.8 }
    ]
    let embedCalled = false
    const result = await rerank('hello', docs, {
      embed: async (texts) => {
        embedCalled = true
        // first text is query "hello"
        // text[1] "A hello world" → high sim
        // text[2] "B random text" → low sim
        return [
          [1, 0], // query
          [0.9, 0.1], // doc1 → cosine 0.9
          [0.1, 0.9] // doc2 → cosine 0.1
        ]
      }
    })
    expect(embedCalled).toBe(true)
    expect(result.length).toBe(2)
    expect(result[0].sessionId).toBe('s1') // reordered: higher final score
    expect(result[1].sessionId).toBe('s2')
    expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore)
  })

  it('returns unchanged when embed throws error', async () => {
    const docs = [
      { sessionId: 's1', title: 'A', content: 'x', fusionScore: 0.5 },
      { sessionId: 's2', title: 'B', content: 'y', fusionScore: 0.6 }
    ]
    const result = await rerank('query', docs, {
      embed: async () => {
        throw new Error('network error')
      }
    })
    expect(result.length).toBe(2)
    expect(result[0].sessionId).toBe('s1')
    expect(result[1].sessionId).toBe('s2')
  })

  it('returns empty when input is empty', async () => {
    const result = await rerank('hello', [])
    expect(result).toEqual([])
  })
})
