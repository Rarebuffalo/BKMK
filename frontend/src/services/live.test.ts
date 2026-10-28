import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { ApiReport, ApiScan } from '../api/endpoints'
import { analyze } from '../domain/analyze'
import type { ScanEvent } from './types'

const startScan = vi.fn()
const scan = vi.fn()
const dashboard = vi.fn()

vi.mock('../api/endpoints', async (orig) => ({
  ...(await orig<typeof import('../api/endpoints')>()),
  api: { startScan: (...a: unknown[]) => startScan(...a), scan: (...a: unknown[]) => scan(...a), dashboard: (...a: unknown[]) => dashboard(...a) },
}))

const { liveScanService } = await import('./live')

const base: ApiScan = {
  id: 'scan-1',
  status: 'running',
  mode: 'full',
  phase: 'retrieve',
  requestedLimit: 800,
  retrieved: 0,
  newBookmarks: 0,
  removedBookmarks: 0,
  classified: 0,
  pages: 0,
  events: [],
  coverage: null,
  coverageNote: null,
  stopReason: null,
  errorCode: null,
  errorMessage: null,
  apiRequests: 0,
  estimatedCostUsd: 0,
  startedAt: '',
  completedAt: null,
}

const empty = analyze({ handle: 'u', displayName: 'u', isDemo: false, raw: [], coverage: 'complete', scannedAt: '2026-10-28T00:00:00Z' })
const report: ApiReport = { ...empty, coverageNote: null, recent: [], scan: null, achievements: empty.achievements.map((a) => ({ ...a, unlockedAt: null, rulesVersion: null })) }

function collect(): Promise<ScanEvent[]> {
  return new Promise((resolve) => {
    const events: ScanEvent[] = []
    liveScanService.start({ identity: { handle: 'u', displayName: 'u', isDemo: false }, scenario: 'normal' }, (e) => {
      events.push(e)
      if (e.type === 'done' || e.type === 'error') resolve(events)
    })
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 })
  startScan.mockReset()
  scan.mockReset()
  dashboard.mockReset()
})

describe('live scan service', () => {
  it('turns persisted server events into progress, unlocks and a final report', async () => {
    startScan.mockResolvedValue(base)
    scan.mockResolvedValueOnce({
      ...base,
      phase: 'achievements',
      events: [
        { type: 'bookmarks_received', at: '', page: 1, total: 100, new: 100 },
        { type: 'achievement_unlocked', at: '', id: 'first-scan' },
      ],
    })
    scan.mockResolvedValue({ ...base, status: 'completed', phase: 'report', events: [] })
    dashboard.mockResolvedValue(report)
    const events = await collect()
    expect(events).toContainEqual({ type: 'progress', retrieved: 100, page: 1 })
    expect(events).toContainEqual({ type: 'achievement', id: 'first-scan' })
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') expect(done.result.isDemo).toBe(false)
  })

  it('reports the server error code on a failed scan', async () => {
    startScan.mockResolvedValue(base)
    scan.mockResolvedValue({ ...base, status: 'failed', errorCode: 'auth_expired', errorMessage: 'Expired' })
    const last = (await collect()).at(-1)
    expect(last).toMatchObject({ type: 'error', code: 'auth-expired', message: 'Expired' })
  })

  it('maps the scan cooldown to a non-retryable error', async () => {
    startScan.mockRejectedValue(new ApiError(429, 'scan_cooldown', 'You can scan again in 4 min.'))
    const last = (await collect()).at(-1)
    expect(last).toMatchObject({ type: 'error', code: 'cooldown', retryable: false })
  })
})
