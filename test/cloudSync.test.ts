import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../src/main/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import {
  getDefaultSyncConfig,
  uploadToCloud,
  downloadFromCloud,
  listCloudFiles,
  deleteCloudFile,
  testCloudConnection,
  performSync,
  type CloudSyncConfig
} from '../src/sync/cloudSync'

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers()
  } as Response
}

function makeConfig(overrides: Partial<CloudSyncConfig> = {}): CloudSyncConfig {
  return {
    enabled: true,
    protocol: 'webdav',
    endpoint: 'https://cloud.example.com/',
    username: 'user',
    password: 'pass',
    intervalMinutes: 30,
    lastSyncAt: null,
    encryptionPassword: 'secret123',
    ...overrides
  }
}

describe('cloudSync.getDefaultSyncConfig', () => {
  it('returns safe defaults (sync disabled, no credentials persisted)', () => {
    const cfg = getDefaultSyncConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.protocol).toBe('webdav')
    expect(cfg.intervalMinutes).toBe(30)
    expect(cfg.lastSyncAt).toBeNull()
    expect(cfg.endpoint).toBe('')
    expect(cfg.username).toBeUndefined()
    expect(cfg.password).toBeUndefined()
    expect(cfg.encryptionPassword).toBeUndefined()
  })

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = getDefaultSyncConfig()
    const b = getDefaultSyncConfig()
    a.intervalMinutes = 5
    expect(b.intervalMinutes).toBe(30)
  })
})

describe('cloudSync.uploadToCloud', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('未设置加密密码时失败', async () => {
    const result = await uploadToCloud(makeConfig({ encryptionPassword: undefined }), 'k', 'data')
    expect(result.success).toBe(false)
    expect(result.error).toContain('加密密码')
  })

  it('上传成功并通过 PUT 发送加密载荷', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 200)))
    const result = await uploadToCloud(makeConfig(), 'data.json', 'hello')
    expect(result.success).toBe(true)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/memora/data.json')
    expect((init as RequestInit).method).toBe('PUT')
    // 载荷为加密后的 JSON
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toHaveProperty('ciphertext')
  })

  it('HTTP 非 2xx 时返回错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 500, 'Internal Error')))
    const result = await uploadToCloud(makeConfig(), 'data.json', 'hello')
    expect(result.success).toBe(false)
    expect(result.error).toContain('500')
  })

  it('网络异常时返回错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const result = await uploadToCloud(makeConfig(), 'data.json', 'hello')
    expect(result.success).toBe(false)
    expect(result.error).toContain('network down')
  })
})

describe('cloudSync.downloadFromCloud', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('未设置加密密码时失败', async () => {
    const result = await downloadFromCloud(makeConfig({ encryptionPassword: undefined }), 'k')
    expect(result.success).toBe(false)
  })

  it('404 时返回远程文件不存在', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 404, 'Not Found')))
    const result = await downloadFromCloud(makeConfig(), 'k')
    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
  })

  it('下载并解密成功', async () => {
    // 先加密得到真实载荷
    const { encrypt } = await import('../src/crypto/e2e')
    const pkg = encrypt('original-data', 'secret123')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(JSON.stringify(pkg), 200)))
    const result = await downloadFromCloud(makeConfig(), 'data.json')
    expect(result.success).toBe(true)
    expect(result.data).toBe('original-data')
  })
})

describe('cloudSync.listCloudFiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('解析 WebDAV PROPFIND 响应提取文件列表', async () => {
    const xml = `<?xml version="1.0"?>
<D:multistatus>
  <D:response><D:href>/memora/</D:href></D:response>
  <D:response><D:href>/memora/a.json</D:href></D:response>
  <D:response><D:href>/memora/b.json</D:href></D:response>
</D:multistatus>`
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(xml, 200)))
    const result = await listCloudFiles(makeConfig())
    expect(result.success).toBe(true)
    expect(result.files).toEqual(['a.json', 'b.json'])
  })

  it('PROPFIND 失败时回退 GET 并返回空列表', async () => {
    // 第一次调用（PROPFIND）返回 405，第二次（GET 回退）成功
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1
      return call === 1 ? jsonResponse('', 405, 'Method Not Allowed') : jsonResponse('', 200)
    }))
    const result = await listCloudFiles(makeConfig())
    expect(result.success).toBe(true)
    expect(result.files).toEqual([])
  })
})

describe('cloudSync.deleteCloudFile / testCloudConnection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deleteCloudFile 成功删除', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 200)))
    const result = await deleteCloudFile(makeConfig(), 'k')
    expect(result.success).toBe(true)
  })

  it('deleteCloudFile 404 视为成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 404)))
    const result = await deleteCloudFile(makeConfig(), 'k')
    expect(result.success).toBe(true)
  })

  it('testCloudConnection 成功并返回延迟', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 200)))
    const result = await testCloudConnection(makeConfig())
    expect(result.success).toBe(true)
    expect(result.latency).toBeGreaterThanOrEqual(0)
  })
})

describe('cloudSync.performSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('上传成功后返回成功状态', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 200)))
    const status = await performSync(makeConfig(), { a: '1', b: '2' })
    expect(status.syncing).toBe(false)
    expect(status.lastResult).toBe('success')
    expect(status.uploadedCount).toBe(2)
    expect(status.localHash).toBeTypeOf('string')
  })

  it('上传失败时返回 failed 状态', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 500, 'Internal Error')))
    const status = await performSync(makeConfig(), { a: '1' })
    expect(status.lastResult).toBe('failed')
    expect(status.error).toContain('500')
  })
})
