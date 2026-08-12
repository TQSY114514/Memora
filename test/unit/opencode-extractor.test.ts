import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { extractLocal } from '@importer/localExtractor'

// 与 sst/opencode v1.18.16 一致的 schema：session / message / part
// message.data 的正文不在 data 里，而在 part 表（按 type 区分）
let tmpDir: string
let db: Database.Database | null = null

// 探测原生绑定是否可用：postinstall 默认装的是 Electron ABI 的二进制，
// 系统 node（vitest）下 new Database() 会因 NODE_MODULE_VERSION 不匹配抛错，
// 此时跳过真实 DB 测试（与 test/backup.test.ts 处理同源问题的方式一致）
let nativeAvailable = false
try {
  const probe = new Database(':memory:')
  probe.close()
  nativeAvailable = true
} catch {
  nativeAvailable = false
}

const MS = 1786526909000

beforeAll(() => {
  if (!nativeAvailable) return
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-extract-'))
  db = new Database(path.join(tmpDir, 'opencode.db'))
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      slug TEXT,
      directory TEXT,
      title TEXT,
      version TEXT,
      agent TEXT,
      model TEXT,
      time_created INTEGER,
      time_updated INTEGER
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      time_created INTEGER,
      time_updated INTEGER,
      data TEXT
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      session_id TEXT,
      data TEXT
    );
  `)

  const insSession = db.prepare(
    'INSERT INTO session (id, project_id, title, agent, model, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  insSession.run('ses_a', 'proj_1', '会话A', 'build', '{"id":"deepseek-v4","providerID":"opencode"}', MS, MS + 5000)
  insSession.run('ses_b', 'proj_1', null, 'build', null, MS + 10000, MS + 15000)

  const insMsg = db.prepare(
    'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)'
  )
  const insPart = db.prepare('INSERT INTO part (id, message_id, session_id, data) VALUES (?, ?, ?, ?)')

  // 会话 A：user + assistant（reasoning/text/tool/ignored/step-start）+ 空 parts 消息
  const msgA1 = 'msg_a1'
  insMsg.run(
    msgA1,
    'ses_a',
    MS,
    MS,
    JSON.stringify({ role: 'user', time: { created: MS }, model: { providerID: 'opencode', modelID: 'deepseek-v4' } })
  )
  insPart.run('prt_a1', msgA1, 'ses_a', JSON.stringify({ type: 'text', text: '你好' }))

  const msgA2 = 'msg_a2'
  insMsg.run(
    msgA2,
    'ses_a',
    MS + 1000,
    MS + 1000,
    JSON.stringify({ role: 'assistant', time: { created: MS + 1000 }, modelID: 'deepseek-v4', providerID: 'opencode' })
  )
  insPart.run('prt_a2r', msgA2, 'ses_a', JSON.stringify({ type: 'reasoning', text: '先思考' }))
  insPart.run('prt_a2t', msgA2, 'ses_a', JSON.stringify({ type: 'text', text: '这是回答' }))
  insPart.run('prt_a2i', msgA2, 'ses_a', JSON.stringify({ type: 'text', text: '被忽略', ignored: true }))
  insPart.run(
    'prt_a2tool',
    msgA2,
    'ses_a',
    JSON.stringify({
      type: 'tool',
      tool: 'webfetch',
      callID: 'call_1',
      state: { status: 'completed', input: { url: 'http://x' }, output: '抓取结果' }
    })
  )
  insPart.run('prt_a2step', msgA2, 'ses_a', JSON.stringify({ type: 'step-start' }))

  const msgA3 = 'msg_a3'
  insMsg.run(msgA3, 'ses_a', MS + 2000, MS + 2000, JSON.stringify({ role: 'user', time: { created: MS + 2000 } }))

  // 会话 B：无标题（回退首条 user 消息），两条消息
  const msgB1 = 'msg_b1'
  insMsg.run(msgB1, 'ses_b', MS + 10000, MS + 10000, JSON.stringify({ role: 'user', time: { created: MS + 10000 } }))
  insPart.run('prt_b1', msgB1, 'ses_b', JSON.stringify({ type: 'text', text: '第二次会话问题' }))

  const msgB2 = 'msg_b2'
  insMsg.run(msgB2, 'ses_b', MS + 11000, MS + 11000, JSON.stringify({ role: 'assistant', time: { created: MS + 11000 } }))
  insPart.run('prt_b2', msgB2, 'ses_b', JSON.stringify({ type: 'text', text: '回答B' }))
})

afterAll(() => {
  if (db) db.close()
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe.skipIf(!nativeAvailable)('extractOpenCode（SQLite 路径）', () => {
  it('从 opencode.db 扒取 2 个会话，消息内容/角色/顺序正确', () => {
    expect(nativeAvailable).toBe(true)
    const sessions = extractLocal('OpenCode', tmpDir)
    expect(sessions.length).toBe(2)

    const a = sessions.find((s) => s.title === '会话A')
    const b = sessions.find((s) => s.title === '第二次会话问题')
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a!.provider).toBe('OpenCode')
    expect(a!.source).toBe('OpenCode 本地扒取')

    // 会话 A：2 条消息（空 parts 的 msg_a3 被跳过）
    expect(a!.messages.length).toBe(2)
    expect(a!.messages[0].role).toBe('user')
    expect(a!.messages[0].content).toBe('你好')
    expect(a!.messages[0].model).toBe('deepseek-v4')
    expect(a!.messages[0].createdAt).toBe(new Date(MS).toISOString())

    const assistant = a!.messages[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.model).toBe('deepseek-v4')
    expect(assistant.content).toContain('[推理] 先思考')
    expect(assistant.content).toContain('这是回答')
    expect(assistant.content).toContain('[工具调用: webfetch]')
    expect(assistant.content).toContain('抓取结果')
    expect(assistant.content).not.toContain('被忽略')
    expect(assistant.content).not.toContain('step-start')
    // 消息按 time.created 升序排列
    expect(a!.messages[0].createdAt < a!.messages[1].createdAt).toBe(true)

    // 会话 B：无标题回退，2 条消息
    expect(b!.messages.length).toBe(2)
    expect(b!.messages[0].content).toBe('第二次会话问题')
    expect(b!.messages[1].content).toBe('回答B')
  })

  it('目录无 db 且无 storage 返回空数组', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-empty-'))
    try {
      const sessions = extractLocal('OpenCode', empty)
      expect(sessions).toEqual([])
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })
})
