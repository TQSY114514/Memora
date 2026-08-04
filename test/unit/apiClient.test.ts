import { describe, it, expect, vi, beforeEach } from 'vitest'

// 模拟 fetch 响应
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers()
  } as Response
}

import { callChat, embedQuery, embedBatch } from '../../src/ai/apiClient'
import type { AiConfig } from '../../src/shared/types'

const openaiConfig: AiConfig = {
  provider: 'openai',
  apiStyle: 'openai',
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  chatModel: 'gpt-4o',
  embeddingModel: 'text-embedding-3-small'
} as any

describe('apiClient.callChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('routes to openai protocol and returns content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '你好' } }] })
    ))
    const out = await callChat(openaiConfig, 'sys', 'user')
    expect(out).toBe('你好')
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 校验请求是 openai 风格：URL 含 /chat/completions，带 Bearer
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-test' })
  })

  it('routes to anthropic protocol', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ content: [{ type: 'text', text: 'anthropic-response' }] })
    ))
    const out = await callChat({ ...openaiConfig, apiStyle: 'anthropic' }, 'sys', 'user')
    expect(out).toBe('anthropic-response')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/v1/messages')
  })

  it('routes to ollama protocol', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ message: { content: 'ollama-response' } })
    ))
    const out = await callChat({ ...openaiConfig, apiStyle: 'ollama' }, 'sys', 'user')
    expect(out).toBe('ollama-response')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/chat')
  })

  it('routes to gemini protocol', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'gemini-response' }] } }] })
    ))
    const out = await callChat({ ...openaiConfig, apiStyle: 'gemini' }, 'sys', 'user')
    expect(out).toBe('gemini-response')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain(':generateContent')
  })

  it('throws on non-ok response with error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ error: { message: 'rate limited' } }, 429)
    ))
    await expect(callChat(openaiConfig, 'sys', 'user')).rejects.toThrow('rate limited')
  })

  it('throws when API returns empty content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '' } }] })
    ))
    await expect(callChat(openaiConfig, 'sys', 'user')).rejects.toThrow('空内容')
  })
})

describe('apiClient.embedBatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty array for empty input', async () => {
    expect(await embedBatch(openaiConfig, [])).toEqual([])
  })

  it('calls openai-compatible embeddings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ data: [{ embedding: [0.1, 0.2] }] })
    ))
    const vecs = await embedBatch(openaiConfig, ['hello'])
    expect(vecs).toEqual([[0.1, 0.2]])
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/embeddings')
  })

  it('calls ollama embeddings per input', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ embedding: [0.5, 0.6] })
    ))
    const vecs = await embedBatch({ ...openaiConfig, apiStyle: 'ollama' }, ['a', 'b'])
    expect(vecs).toHaveLength(2)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it('calls gemini embeddings per input', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ embedding: { values: [0.5, 0.6] } })
    ))
    const vecs = await embedBatch({ ...openaiConfig, apiStyle: 'gemini' }, ['a'])
    expect(vecs).toEqual([[0.5, 0.6]])
  })

  it('embedQuery returns the first vector', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ data: [{ embedding: [1, 2, 3] }] })
    ))
    const vec = await embedQuery(openaiConfig, 'text')
    expect(vec).toEqual([1, 2, 3])
  })

  it('throws when embedding API returns empty data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ data: [] })
    ))
    await expect(embedBatch(openaiConfig, ['x'])).rejects.toThrow('空')
  })

  it('throws when embedding API returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ error: { message: 'embedding failed' } }, 500)
    ))
    await expect(embedBatch(openaiConfig, ['x'])).rejects.toThrow('embedding failed')
  })
})