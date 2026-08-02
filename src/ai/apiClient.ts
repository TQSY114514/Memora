/**
 * AI API 统一客户端（v1.2）
 *
 * 职责：
 * 1. 统一封装 chat completions 和 embeddings 调用，消除 4 处重复代码
 * 2. 根据 config.apiStyle 路由不同协议（openai / anthropic / ollama / gemini）
 * 3. 内置指数退避重试 + 超时控制
 *
 * 协议适配：
 * - openai:    POST {base}/chat/completions          body {model, messages, temperature}
 *              POST {base}/embeddings                 body {model, input: string[]}
 *              Header: Authorization: Bearer {apiKey}
 * - anthropic: POST {base}/v1/messages               body {model, messages, system, max_tokens}
 *              （embedding 走 OpenAI 兼容端点或第三方，这里仍尝试 /v1/embeddings）
 *              Header: x-api-key: {apiKey}, anthropic-version: 2023-06-01
 * - ollama:    POST {base}/api/chat                  body {model, messages, stream: false}
 *              POST {base}/api/embeddings             body {model, prompt: string}
 *              无鉴权
 * - gemini:    POST {base}/v1beta/models/{model}:generateContent?key={apiKey}
 *              body {contents: [{parts: [{text}]}], systemInstruction}
 *              POST {base}/v1beta/models/{model}:embedContent?key={apiKey}
 *              body {content: {parts: [{text}]}}
 */

import type { AiConfig } from '@shared/types'

/** 请求超时（毫秒） */
const DEFAULT_TIMEOUT = 60_000
/** 最大重试次数（不含首次） */
const DEFAULT_RETRIES = 2
/** 重试基础延迟（毫秒），指数退避：base * 2^i */
const RETRY_BASE_DELAY = 1000

/** 可重试的 HTTP 状态码（限流、网关错误） */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599)
}

/** 可重试的网络错误关键词 */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket|aborted/i.test(msg)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 带重试 + 超时的 fetch 封装
 * - 网络错误 / 5xx / 429 自动重试（指数退避）
 * - 4xx（非 429）直接抛出，不重试
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { retries?: number; timeout?: number } = {}
): Promise<Response> {
  const { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const resp = await fetch(url, {
        ...init,
        signal: controller.signal
      })

      clearTimeout(timer)

      // 可重试的状态码：等待后重试
      if (isRetryableStatus(resp.status) && attempt < retries) {
        await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt))
        continue
      }
      return resp
    } catch (err) {
      // 网络错误：等待后重试
      if (isRetryableError(err) && attempt < retries) {
        await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt))
        continue
      }
      throw err
    }
  }
  // 理论上不可达（所有路径要么 return 要么 throw），作为安全兜底
  throw new Error('fetchWithRetry: unexpected end of loop')
}

/** 从响应中提取错误信息（兼容各协议） */
async function extractError(resp: Response): Promise<string> {
  const txt = await resp.text().catch(() => '')
  if (!txt) return `${resp.status} ${resp.statusText}`
  try {
    const json = JSON.parse(txt)
    // OpenAI / DeepSeek / Gemini 风格（error.message）
    if (json.error?.message) return `${resp.status}: ${json.error.message}`
    // Anthropic 风格（error.type + error.message）
    if (json.error?.type) return `${resp.status}: ${json.error.type} - ${json.error.message ?? ''}`
    // Ollama 风格（error 为字符串）
    if (typeof json.error === 'string') return `${resp.status}: ${json.error}`
    // 兜底：error 为对象
    if (json.error) return `${resp.status}: ${JSON.stringify(json.error)}`
  } catch {
    // 非 JSON，返回截断文本
  }
  return `${resp.status}: ${txt.slice(0, 200)}`
}

// ===== Chat Completions =====

/**
 * 调用对话接口（统一入口，根据 apiStyle 路由）
 * @returns LLM 生成的文本内容
 */
export async function callChat(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; timeoutMs?: number }
): Promise<string> {
  const style = config.apiStyle ?? 'openai'
  const temperature = options?.temperature ?? 0.3
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT

  switch (style) {
    case 'anthropic':
      return callChatAnthropic(config, systemPrompt, userPrompt, temperature, timeoutMs)
    case 'ollama':
      return callChatOllama(config, systemPrompt, userPrompt, temperature, timeoutMs)
    case 'gemini':
      return callChatGemini(config, systemPrompt, userPrompt, temperature, timeoutMs)
    case 'openai':
    default:
      return callChatOpenai(config, systemPrompt, userPrompt, temperature, timeoutMs)
  }
}

/** OpenAI 兼容协议 */
async function callChatOpenai(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature
    })
  }, { timeout: timeoutMs })
  if (!resp.ok) throw new Error(await extractError(resp))

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('API 返回空内容')
  return content
}

/** Anthropic 原生协议 */
async function callChatAnthropic(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/v1/messages`
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.chatModel,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 4096,
      temperature
    })
  }, { timeout: timeoutMs })
  if (!resp.ok) throw new Error(await extractError(resp))

  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)
  const text = data.content?.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Anthropic API 返回空内容')
  return text
}

/** Ollama 本地协议 */
async function callChatOllama(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/chat`
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: false,
      options: { temperature }
    })
  }, { timeout: timeoutMs })
  if (!resp.ok) throw new Error(await extractError(resp))

  const data = (await resp.json()) as {
    message?: { content?: string }
    error?: string
  }
  if (data.error) throw new Error(data.error)
  const content = data.message?.content
  if (!content) throw new Error('Ollama API 返回空内容')
  return content
}

/** Google Gemini 协议 */
async function callChatGemini(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<string> {
  const base = config.baseUrl.replace(/\/$/, '')
  const url = `${base}/v1beta/models/${config.chatModel}:generateContent?key=${config.apiKey}`
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature }
    })
  }, { timeout: timeoutMs })
  if (!resp.ok) throw new Error(await extractError(resp))

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini API 返回空内容')
  return text
}

// ===== Embeddings =====

/**
 * 调用 embedding 接口（单条文本）
 * @returns 向量（number[]）
 */
export async function embedQuery(config: AiConfig, text: string): Promise<number[]> {
  const vectors = await embedBatch(config, [text])
  return vectors[0]
}

/**
 * 调用 embedding 接口（批量，OpenAI 兼容 + Ollama + 本地 ONNX 支持）
 * - 本地 ONNX（v1.8 #15）：config.embeddingMode === 'local' 时走 localEmbedder
 * - OpenAI / Anthropic 第三方 / Gemini：批量请求
 * - Ollama：逐条请求（Ollama 的 /api/embeddings 只支持单条 prompt）
 */
export async function embedBatch(
  config: AiConfig,
  inputs: string[]
): Promise<number[][]> {
  if (inputs.length === 0) return []

  // v1.8 #15：本地嵌入模式
  if (config.embeddingMode === 'local') {
    const { embedBatchLocal } = await import('./localEmbedder')
    return embedBatchLocal(inputs, config.embeddingModel || undefined)
  }

  const style = config.apiStyle ?? 'openai'

  if (style === 'ollama') {
    // Ollama 逐条请求
    const results: number[][] = []
    for (const text of inputs) {
      const vec = await embedOllama(config, text)
      results.push(vec)
    }
    return results
  }

  if (style === 'gemini') {
    // Gemini 逐条请求（embedContent 只支持单条）
    const results: number[][] = []
    for (const text of inputs) {
      const vec = await embedGemini(config, text)
      results.push(vec)
    }
    return results
  }

  // OpenAI 兼容 / Anthropic 第三方：批量请求
  return embedOpenaiCompatible(config, inputs)
}

/** OpenAI 兼容 embeddings（批量） */
async function embedOpenaiCompatible(
  config: AiConfig,
  inputs: string[]
): Promise<number[][]> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/embeddings`
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: inputs
    })
  })
  if (!resp.ok) throw new Error(await extractError(resp))

  const data = (await resp.json()) as {
    data?: Array<{ embedding?: number[] }>
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)
  if (!data.data || data.data.length === 0) throw new Error('Embedding API 返回空')

  return data.data.map((d) => {
    if (!d.embedding || d.embedding.length === 0) {
      throw new Error('返回的向量为空')
    }
    return d.embedding
  })
}

/** Ollama embeddings（单条） */
async function embedOllama(config: AiConfig, text: string): Promise<number[]> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/embeddings`
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.embeddingModel,
      prompt: text
    })
  })
  if (!resp.ok) throw new Error(await extractError(resp))

  const data = (await resp.json()) as { embedding?: number[]; error?: string }
  if (data.error) throw new Error(data.error)
  if (!data.embedding || data.embedding.length === 0) throw new Error('Ollama 返回空向量')
  return data.embedding
}

/** Gemini embeddings（单条） */
async function embedGemini(config: AiConfig, text: string): Promise<number[]> {
  const base = config.baseUrl.replace(/\/$/, '')
  const url = `${base}/v1beta/models/${config.embeddingModel}:embedContent?key=${config.apiKey}`
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    })
  })
  if (!resp.ok) throw new Error(await extractError(resp))

  const data = (await resp.json()) as {
    embedding?: { values?: number[] }
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)
  const vec = data.embedding?.values
  if (!vec || vec.length === 0) throw new Error('Gemini 返回空向量')
  return vec
}
