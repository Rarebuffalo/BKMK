import { afterEach, describe, expect, it, vi } from 'vitest'
import { importScanService, stageImport } from '../services/import'
import type { ScanResult } from '../domain/types'
import { partialNoteFor, toStagedImport } from './direct'
import { createMockBridge, syntheticRecords, type MockScenario } from './mockBridge'
import { ImportReceiveError, receiveImport, type BridgeRequest, type ImportBridge, type ReceiveProgress } from './receiver'
import { IMPORT_SCHEMA } from './record'

const receive = (scenario: MockScenario, batchSize = 50) => receiveImport(createMockBridge(scenario, { batchSize, delayMs: 0 }))

/** A hand-written source for protocol edge cases: answers `next` with whatever `batch(seq)` returns. */
function scripted(batch: (seq: number) => unknown): ImportBridge {
  return {
    async request(m: BridgeRequest) {
      if (m.type === 'hello') return { schema: IMPORT_SCHEMA, type: 'hello', source: { name: 'test', version: '1' } }
      if (m.type === 'start') return { schema: IMPORT_SCHEMA, type: 'started', importId: 'imp-1' }
      if (m.type === 'next') return batch(m.seq)
      return { schema: IMPORT_SCHEMA, type: 'cancelled', importId: 'imp-1' }
    },
  }
}
const batchOf = (seq: number, records: unknown, extra: object = {}) => ({ schema: IMPORT_SCHEMA, type: 'batch', importId: 'imp-1', seq, records, ...extra })

afterEach(() => vi.useRealTimers())

describe('import receiver', () => {
  it('receives a complete import in batches and reports progress', async () => {
    const progress: ReceiveProgress[] = []
    const r = await receiveImport(createMockBridge('small', { batchSize: 15, delayMs: 0 }), { onProgress: (p) => progress.push(p) })
    expect(r.coverage).toBe('complete')
    expect(r.reason).toBeUndefined()
    expect(r.counts).toEqual({ received: 40, valid: 40, duplicates: 0, rejected: 0, batches: 3 })
    expect(r.items).toHaveLength(40)
    expect(r.source).toEqual({ name: 'BKMK mock source', version: '0.0.0' })
    expect(progress.map((p) => p.valid)).toEqual([0, 15, 30, 40, 40])
    expect(progress[0].expectedTotal).toBe(40)
  })

  it('skips duplicates across batches and counts them', async () => {
    const r = await receive('duplicates', 30)
    expect(r.counts).toMatchObject({ received: 190, valid: 150, duplicates: 40, rejected: 0 })
    expect(new Set(r.items.map((i) => i.id)).size).toBe(150)
  })

  it('rejects invalid records one by one and keeps the rest', async () => {
    const r = await receive('invalid')
    expect(r.coverage).toBe('complete')
    expect(r.counts).toMatchObject({ valid: 100, rejected: 8 })
    expect(r.rejections).toHaveLength(8)
    expect(r.rejections.map((x) => x.reason)).toContain('unexpected field "extra"')
  })

  it('a source that stops early yields a partial import with its reason', async () => {
    const r = await receive('partial')
    expect(r.coverage).toBe('partial')
    expect(r.reason).toBe('rate_limited')
    expect(r.counts.valid).toBe(200)
  })

  it('an interrupted transfer never becomes complete', async () => {
    const r = await receive('interrupted')
    expect(r).toMatchObject({ coverage: 'partial', reason: 'interrupted' })
    expect(r.counts.valid).toBe(150)
  })

  it('a timed-out answer mid-transfer counts as interrupted', async () => {
    const r = await receiveImport(scripted((seq) => (seq === 1 ? batchOf(1, syntheticRecords(5)) : new Promise(() => undefined))), { timeoutMs: 30 })
    expect(r).toMatchObject({ coverage: 'partial', reason: 'interrupted', counts: { valid: 5 } })
  })

  it('stops at the 5,000-bookmark limit and tells the source to stop', async () => {
    const bridge = createMockBridge('over_limit', { batchSize: 500, delayMs: 0 })
    const r = await receiveImport(bridge)
    expect(r).toMatchObject({ coverage: 'partial', reason: 'item_limit' })
    expect(r.counts.valid).toBe(5000)
    await vi.waitFor(() => expect(bridge.requests.at(-1)?.type).toBe('cancel'))
  })

  it('works with any batch size', async () => {
    for (const size of [1, 7, 500]) {
      const r = await receive('small', size)
      expect(r.counts.valid).toBe(40)
      expect(r.counts.batches).toBe(Math.ceil(40 / size))
    }
  })

  it('a batch for another import is a protocol error, and the import is partial', async () => {
    const r = await receive('malformed')
    expect(r).toMatchObject({ coverage: 'partial', reason: 'protocol_error' })
    expect(r.counts.valid).toBe(100)
  })

  it('rejects malformed messages mid-transfer', async () => {
    const cases: unknown[] = [
      'not an object',
      null,
      { ...batchOf(1, []), schema: 'bkmk.import/v9' },
      { ...batchOf(1, []), type: 'surprise' },
      batchOf(2, []), // out of order
      batchOf(1, 'records'),
      batchOf(1, Array.from({ length: 501 }, () => ({}))), // too many records
      { schema: IMPORT_SCHEMA, type: 'end', importId: 'imp-1', coverage: 'complete', reason: 'rate_limited' },
      { schema: IMPORT_SCHEMA, type: 'end', importId: 'imp-1', coverage: 'partial', reason: 'made_up' },
    ]
    for (const answer of cases) {
      const r = await receiveImport(scripted(() => answer))
      expect(r, JSON.stringify(answer)?.slice(0, 60)).toMatchObject({ coverage: 'partial', reason: 'protocol_error' })
    }
  })

  it('rejects an oversized message without reading its records', async () => {
    const huge = batchOf(1, [{ id: '1', url: 'https://x.com/a/status/1' }], { padding: 'x'.repeat(2 * 1024 * 1024) })
    const r = await receiveImport(scripted(() => huge))
    expect(r).toMatchObject({ coverage: 'partial', reason: 'protocol_error', counts: { received: 0 } })
  })

  it('refuses a source on an unknown schema version', async () => {
    await expect(receive('wrong_version')).rejects.toMatchObject({ code: 'unsupported_version' })
  })

  it('fails clearly when no source answers', async () => {
    await expect(receive('unavailable')).rejects.toBeInstanceOf(ImportReceiveError)
    await expect(receive('unavailable')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('stopping mid-import keeps what arrived, marked partial', async () => {
    const controller = new AbortController()
    const r = await receiveImport(createMockBridge('large', { batchSize: 100, delayMs: 5 }), {
      signal: controller.signal,
      onProgress: (p) => p.batches === 2 && controller.abort(),
    })
    expect(r).toMatchObject({ coverage: 'partial', reason: 'cancelled' })
    expect(r.counts.valid).toBe(200)
  })

  it('has no window message channel: messages posted by other origins are ignored', async () => {
    const listen = vi.spyOn(window, 'addEventListener')
    const done = receiveImport(createMockBridge('small', { batchSize: 10, delayMs: 5 }))
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: batchOf(1, syntheticRecords(500)) }))
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, data: batchOf(1, syntheticRecords(500)) }))
    const r = await done
    expect(r.counts).toMatchObject({ received: 40, valid: 40 })
    expect(listen.mock.calls.filter(([type]) => type === 'message')).toEqual([])
    listen.mockRestore()
  })
})

describe('direct import → existing analysis pipeline', () => {
  it('stages records as the usual RawBookmarks, labelled as a direct import', async () => {
    const staged = toStagedImport(await receive('small'), 'synthetic')
    expect(staged.raw).toHaveLength(40)
    expect(staged.raw[0]).toMatchObject({ accessible: true, url: expect.stringMatching(/^https:\/\/x\.com\//) })
    expect(staged.info).toMatchObject({ kind: 'bookmarks', formats: ['extension'], total: 40 })
    expect(staged.partialNote).toBeUndefined()
  })

  it('a partial import says why and is never presented as complete', async () => {
    const r = await receive('partial')
    expect(partialNoteFor(r)).toMatch(/^Partial import: it stopped early because the source was rate-limited/)

    vi.useFakeTimers()
    stageImport(toStagedImport(r, 'synthetic'))
    let result: ScanResult | undefined
    importScanService.start({ handle: 'synthetic', mode: 'full' } as never, (e) => {
      if (e.type === 'done') result = e.result
    })
    await vi.runAllTimersAsync()
    expect(result).toBeDefined()
    expect(result!.coverage).toBe('partial')
    expect(result!.coverageNote).toMatch(/Partial import/)
    expect(result!.source).toBe('import')
    expect(result!.stats.accessible).toBe(200)
  })

  it('a complete direct import analyses as complete', async () => {
    const r = await receive('small')
    vi.useFakeTimers()
    stageImport(toStagedImport(r, 'synthetic'))
    let result: ScanResult | undefined
    importScanService.start({ handle: 'synthetic', mode: 'full' } as never, (e) => {
      if (e.type === 'done') result = e.result
    })
    await vi.runAllTimersAsync()
    expect(result!.coverage).toBe('complete')
    expect(result!.coverageNote).toMatch(/received by direct import/)
  })
})
