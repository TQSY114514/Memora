import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))

import {
  LOCAL_EMBEDDING_MODELS,
  DEFAULT_LOCAL_MODEL,
  getLocalModelDim,
  getLocalEmbedderStatus
} from '../../src/ai/localEmbedder'

describe('localEmbedder 常量与纯函数', () => {
  it('提供三个预设模型且维度合法', () => {
    expect(LOCAL_EMBEDDING_MODELS).toHaveLength(3)
    for (const m of LOCAL_EMBEDDING_MODELS) {
      expect(m.dim).toBeGreaterThan(0)
      expect(m.id).toContain('/')
    }
  })

  it('默认模型为第一个预设', () => {
    expect(DEFAULT_LOCAL_MODEL).toBe(LOCAL_EMBEDDING_MODELS[0])
  })

  it('getLocalModelDim 返回对应模型维度，未知模型回退默认维度', () => {
    expect(getLocalModelDim('Xenova/all-MiniLM-L6-v2')).toBe(384)
    expect(getLocalModelDim('Xenova/bge-small-zh-v1.5')).toBe(512)
    expect(getLocalModelDim('unknown/model')).toBe(DEFAULT_LOCAL_MODEL.dim)
  })

  it('初始状态为 idle', () => {
    expect(getLocalEmbedderStatus()).toEqual({ state: 'idle' })
  })
})