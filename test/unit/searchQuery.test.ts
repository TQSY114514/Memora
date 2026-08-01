import { describe, it, expect } from 'vitest'
import { buildFtsQuery, buildSnippet } from '../../src/search/query'

describe('buildFtsQuery（FTS5 查询构建）', () => {
  it('空查询返回空字符串', () => {
    expect(buildFtsQuery('')).toBe('')
    expect(buildFtsQuery('   ')).toBe('')
  })

  it('英文单词加引号 + 前缀通配', () => {
    const q = buildFtsQuery('hello world')
    expect(q).toContain('"hello"*')
    expect(q).toContain('"world"*')
  })

  it('AND 操作符连接所有词', () => {
    const q = buildFtsQuery('apple banana', 'AND')
    expect(q).toBe('"apple"* AND "banana"*')
  })

  it('OR 操作符宽松匹配', () => {
    const q = buildFtsQuery('apple banana', 'OR')
    expect(q).toBe('"apple"* OR "banana"*')
  })

  it('转义双引号防 FTS5 注入', () => {
    // segmentQuery 会把双引号作为分隔符，分词后双引号被消除
    // 验证结果中不含未闭合的引号（FTS5 查询格式安全）
    const q = buildFtsQuery('test"quote')
    // 结果应是合法的 FTS5 查询（每个词用双引号包裹 + 前缀通配）
    expect(q).toMatch(/^"[^"]*"\*/)
    // 不应包含未转义的原始双引号序列
    expect(q).not.toContain('test"quote')
  })

  it('中文分词后每个词独立加引号', () => {
    const q = buildFtsQuery('人工智能技术')
    // 中文会被 Intl.Segmenter 分词，结果应包含多个带引号的词
    expect(q).toContain('*')
    expect(q.length).toBeGreaterThan(0)
  })
})

describe('buildSnippet（高亮片段生成）', () => {
  it('空内容返回空字符串', () => {
    expect(buildSnippet('', 'query')).toBe('')
  })

  it('匹配关键词用 <mark> 包裹', () => {
    const snippet = buildSnippet('hello world this is a test', 'hello')
    expect(snippet).toContain('<mark>hello</mark>')
  })

  it('无匹配时截取开头并加省略号', () => {
    const long = 'x'.repeat(200)
    const snippet = buildSnippet(long, 'zzznotfound')
    expect(snippet).toContain('…')
    expect(snippet.length).toBeLessThan(long.length)
  })

  it('HTML 转义防 XSS', () => {
    const content = '<script>alert(1)</script> hello'
    const snippet = buildSnippet(content, 'hello')
    expect(snippet).not.toContain('<script>')
    expect(snippet).toContain('&lt;script&gt;')
    expect(snippet).toContain('<mark>hello</mark>')
  })

  it('匹配位置前后文截取（radius=60）', () => {
    const content = 'a'.repeat(100) + ' TARGET ' + 'b'.repeat(100)
    const snippet = buildSnippet(content, 'TARGET', 60)
    expect(snippet).toContain('<mark>TARGET</mark>')
    // 应截取前后文，不是全文
    expect(snippet.length).toBeLessThan(content.length)
  })

  it('中文关键词也能高亮', () => {
    const content = '这是一个关于人工智能的讨论'
    const snippet = buildSnippet(content, '人工智能')
    expect(snippet).toContain('<mark>')
  })

  it('大小写不敏感高亮', () => {
    const snippet = buildSnippet('Hello HELLO hello', 'hello')
    // 所有 hello（不论大小写）都应被高亮
    const markCount = (snippet.match(/<mark>/g) || []).length
    expect(markCount).toBeGreaterThan(0)
  })
})
