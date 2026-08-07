import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/memora-test-userdata' }
}))
vi.mock('../../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../src/database/repositories/workspaceRepo', () => ({
  listWorkspaces: vi.fn()
}))
vi.mock('../../src/memoryAgent/consolidation', () => ({
  scanConsolidationCandidates: vi.fn(),
  executeConsolidation: vi.fn()
}))

import {
  runAutoConsolidation,
  startAutoConsolidation,
  stopAutoConsolidation,
  getAutoConsolidationStatus
} from '../../src/main/memoryConsolidationScheduler'
import { listWorkspaces } from '../../src/database/repositories/workspaceRepo'
import { scanConsolidationCandidates, executeConsolidation } from '../../src/memoryAgent/consolidation'

describe('memoryConsolidationScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopAutoConsolidation()
  })

  it('无工作区时跳过合并，返回空结果', async () => {
    vi.mocked(listWorkspaces).mockReturnValue([])
    const r = await runAutoConsolidation()
    expect(r.merged).toBe(0)
    expect(r.workspaces).toBe(0)
    expect(scanConsolidationCandidates).not.toHaveBeenCalled()
    expect(getAutoConsolidationStatus().lastSummary).toBe('无工作区，跳过自动合并')
  })

  it('扫描到候选时执行合并并累加计数', async () => {
    vi.mocked(listWorkspaces).mockReturnValue([
      { id: 'w1', name: 'A' },
      { id: 'w2', name: 'B' }
    ] as any)
    vi.mocked(scanConsolidationCandidates).mockResolvedValue({
      candidates: [{ subject: 's', value: 'v', confidence: 0.6, mergedIds: ['a', 'b'], reason: 'r' }],
      totalMerged: 2,
      summary: 's'
    } as any)
    vi.mocked(executeConsolidation).mockReturnValue({ merged: 2, errors: [] })

    const r = await runAutoConsolidation()
    expect(r.merged).toBe(4)
    expect(r.workspaces).toBe(2)
    expect(executeConsolidation).toHaveBeenCalledTimes(2)
  })

  it('无候选时跳过执行合并', async () => {
    vi.mocked(listWorkspaces).mockReturnValue([{ id: 'w1', name: 'A' }] as any)
    vi.mocked(scanConsolidationCandidates).mockResolvedValue({
      candidates: [],
      totalMerged: 0,
      summary: '未发现可合并的偏好'
    } as any)

    const r = await runAutoConsolidation()
    expect(r.merged).toBe(0)
    expect(executeConsolidation).not.toHaveBeenCalled()
  })

  it('单个工作区合并失败不影响其他工作区', async () => {
    vi.mocked(listWorkspaces).mockReturnValue([
      { id: 'w1', name: 'A' },
      { id: 'w2', name: 'B' }
    ] as any)
    vi.mocked(scanConsolidationCandidates)
      .mockResolvedValueOnce({
        candidates: [{ subject: 's', value: 'v', confidence: 0.6, mergedIds: ['a'], reason: 'r' }],
        totalMerged: 1,
        summary: 's'
      } as any)
      .mockRejectedValueOnce(new Error('scan failed'))

    const r = await runAutoConsolidation()
    expect(r.merged).toBe(2)
    expect(r.workspaces).toBe(2)
  })

  it('start/stop 更新运行状态与下次运行时间', () => {
    const started = startAutoConsolidation()
    expect(started.running).toBe(true)
    expect(started.nextRunAt).toBeTruthy()
    const stopped = stopAutoConsolidation()
    expect(stopped.running).toBe(false)
    expect(stopped.nextRunAt).toBeNull()
  })
})