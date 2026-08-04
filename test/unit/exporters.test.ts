import { describe, it, expect } from 'vitest'
import { renderSessionToJson } from '../../src/sharing/jsonExporter'
import { renderSessionToMd } from '../../src/sharing/mdExporter'
import { renderSessionToClaudeCode } from '../../src/sharing/claudeCodeExporter'
import type { ChatSession, Message } from '../../src/shared/types'

/** 构造测试会话 */
function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 's1',
    provider: 'ChatGPT',
    title: '测试对话',
    isFavorite: false,
    messageCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    importedAt: '2026-08-01T00:00:00.000Z',
    tags: [],
    messages: [],
    ...overrides
  } as ChatSession
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'user',
    content: '',
    order: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  } as Message
}

describe('jsonExporter.renderSessionToJson', () => {
  it('序列化会话元信息与消息数组', () => {
    const json = renderSessionToJson(
      makeSession({
        title: '技术讨论',
        model: 'gpt-4o',
        tags: [{ id: 't1', name: 'TS', createdAt: '2026-08-01' }],
        messages: [
          makeMessage({ role: 'user', content: '什么是 LSP？' }),
          makeMessage({ role: 'assistant', content: 'Language Server Protocol', model: 'gpt-4o' })
        ]
      })
    )
    const parsed = JSON.parse(json)
    expect(parsed.title).toBe('技术讨论')
    expect(parsed.provider).toBe('ChatGPT')
    expect(parsed.model).toBe('gpt-4o')
    expect(parsed.messageCount).toBe(2)
    expect(parsed.tags).toEqual(['TS'])
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0].role).toBe('user')
    expect(parsed.messages[1].model).toBe('gpt-4o')
  })

  it('未提供 model 时置为 null，消息无 model 时省略字段', () => {
    const json = renderSessionToJson(
      makeSession({ messages: [makeMessage({ role: 'user', content: 'hi' })] })
    )
    const parsed = JSON.parse(json)
    expect(parsed.model).toBeNull()
    expect(parsed.messages[0]).not.toHaveProperty('model')
  })

  it('自定义标题与描述覆盖 session 字段', () => {
    const json = renderSessionToJson(
      makeSession({ title: '原标题', description: '原描述' }),
      { customTitle: '自定义标题', customDescription: '自定义描述' }
    )
    const parsed = JSON.parse(json)
    expect(parsed.title).toBe('自定义标题')
    expect(parsed.description).toBe('自定义描述')
  })

  it('空 messages 不报错', () => {
    expect(() => JSON.parse(renderSessionToJson(makeSession()))).not.toThrow()
  })
})

describe('mdExporter.renderSessionToMd', () => {
  it('渲染标题、元信息与消息', () => {
    const md = renderSessionToMd(
      makeSession({
        title: '技术讨论',
        model: 'gpt-4o',
        messages: [makeMessage({ role: 'user', content: '你好' })]
      })
    )
    expect(md).toContain('# 技术讨论')
    expect(md).toContain('gpt-4o')
    expect(md).toContain('你好')
    expect(md).toContain('🧑 你')
    expect(md).toContain('Exported from Memora')
  })

  it('默认包含水印，可关闭', () => {
    expect(renderSessionToMd(makeSession())).toContain('Exported from Memora')
    expect(renderSessionToMd(makeSession(), { includeWatermark: false })).not.toContain('Exported from Memora')
  })

  it('assistant 消息使用 AI 角色标签', () => {
    const md = renderSessionToMd(
      makeSession({ messages: [makeMessage({ role: 'assistant', content: '回答' })] })
    )
    expect(md).toContain('🤖 AI')
  })

  it('自定义标题覆盖 session 字段', () => {
    const md = renderSessionToMd(makeSession({ title: '原标题' }), { customTitle: '自定义标题' })
    expect(md).toContain('# 自定义标题')
    expect(md).not.toContain('# 原标题')
  })

  it('空 messages 不报错', () => {
    expect(() => renderSessionToMd(makeSession())).not.toThrow()
  })
})

describe('claudeCodeExporter.renderSessionToClaudeCode', () => {
  it('输出 jsonl：首行 summary，后续消息按 parentUuid 串联', () => {
    const out = renderSessionToClaudeCode(
      makeSession({
        title: '技术讨论',
        messages: [
          makeMessage({ role: 'user', content: '你好' }),
          makeMessage({ role: 'assistant', content: '您好' })
        ]
      })
    )
    const lines = out.split('\n')
    expect(lines).toHaveLength(3)

    const summary = JSON.parse(lines[0])
    expect(summary.type).toBe('summary')
    expect(summary.summary).toBe('技术讨论')

    const user = JSON.parse(lines[1])
    const assistant = JSON.parse(lines[2])
    expect(user.type).toBe('user')
    expect(assistant.type).toBe('assistant')
    // user 用字符串，assistant 用数组
    expect(user.message.content).toBe('你好')
    expect(assistant.message.content).toEqual([{ type: 'text', text: '您好' }])
    // 串联
    expect(user.parentUuid).toBeNull()
    expect(assistant.parentUuid).toBe(user.uuid)
  })

  it('自定义标题覆盖 summary 标题', () => {
    const out = renderSessionToClaudeCode(makeSession({ title: '原标题' }), { customTitle: '自定义标题' })
    const summary = JSON.parse(out.split('\n')[0])
    expect(summary.summary).toBe('自定义标题')
  })

  it('空 messages 仍输出 summary 行', () => {
    const out = renderSessionToClaudeCode(makeSession())
    expect(out.split('\n')).toHaveLength(1)
    expect(JSON.parse(out.split('\n')[0]).type).toBe('summary')
  })
})