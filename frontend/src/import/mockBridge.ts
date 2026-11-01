// A synthetic import source for development and tests. It stands in for a future
// approved retrieval mechanism and speaks the protocol the receiver expects. It
// never contacts X or any other site: every record is generated locally from the
// demo templates, with made-up ids.

import { generateDemoBookmarks, type DemoPersona } from '../data/demoProfile'
import type { BridgeRequest, ImportBridge } from './receiver'
import { IMPORT_SCHEMA, type ImportRecordV1 } from './record'

export type MockScenario = 'small' | 'large' | 'duplicates' | 'invalid' | 'partial' | 'interrupted' | 'over_limit' | 'malformed' | 'wrong_version' | 'unavailable'

export const MOCK_SCENARIOS: { id: MockScenario; label: string; hint: string }[] = [
  { id: 'small', label: 'Small', hint: '40 bookmarks, complete' },
  { id: 'large', label: 'Large', hint: '3,000 bookmarks, complete' },
  { id: 'duplicates', label: 'Duplicates', hint: '150 bookmarks, 40 sent twice' },
  { id: 'invalid', label: 'Invalid records', hint: '100 valid, 8 malformed' },
  { id: 'partial', label: 'Partial', hint: 'source stops early: rate-limited' },
  { id: 'interrupted', label: 'Interrupted', hint: 'connection drops after 3 batches' },
  { id: 'over_limit', label: 'Over limit', hint: '5,300 bookmarks; BKMK stops at 5,000' },
  { id: 'malformed', label: 'Malformed message', hint: 'a batch for the wrong import' },
  { id: 'wrong_version', label: 'Wrong version', hint: 'source uses schema v2' },
  { id: 'unavailable', label: 'Unavailable', hint: 'no source answers' },
]

export interface MockOptions {
  batchSize?: number
  /** Delay before each answer, so progress is visible. */
  delayMs?: number
}

const PERSONAS: DemoPersona[] = ['builder', 'researcher', 'idea-hunter', 'curator', 'rabbit-hole', 'explorer']
const BASE_ID = 1_850_000_000_000_000_000n

/** Synthetic, valid ImportRecord v1 records with sequential made-up ids. */
export function syntheticRecords(count: number, seed = 'synthetic'): ImportRecordV1[] {
  const out: ImportRecordV1[] = []
  for (let round = 0; out.length < count; round++) {
    for (const b of generateDemoBookmarks(`${seed}-${round}`, PERSONAS[round % PERSONAS.length])) {
      if (out.length >= count) break
      const id = String(BASE_ID + BigInt(out.length + 1))
      // X handles are at most 15 characters; a few demo authors are longer.
      const handle = b.author.handle.slice(0, 15)
      out.push({
        id,
        url: `https://x.com/${handle}/status/${id}`,
        text: b.text,
        author: { handle, name: b.author.name },
        createdAt: b.createdAt,
        links: b.links,
      })
    }
  }
  return out
}

/** Records that must each be rejected, for one plain reason apiece. */
export const INVALID_RECORDS: unknown[] = [
  { id: 'abc', url: 'https://x.com/a/status/abc' },
  { id: '123', url: 'https://example.com/a/status/123' },
  { id: '124', url: 'https://x.com/a/status/999' },
  { id: '126', url: 'https://x.com/a/status/126', text: 'x'.repeat(25_001) },
  { id: '127', url: 'https://x.com/a/status/127', createdAt: 'yesterday' },
  { id: '128', url: 'https://x.com/a/status/128', createdAt: '1999-01-01T00:00:00Z' },
  { id: '129', url: 'https://x.com/a/status/129', extra: true },
  'not a record',
]

function recordsFor(scenario: MockScenario): unknown[] {
  switch (scenario) {
    case 'large':
      return syntheticRecords(3000)
    case 'over_limit':
      return syntheticRecords(5300)
    case 'duplicates': {
      const base = syntheticRecords(150)
      // Records 11–50 are sent again later, across batch boundaries.
      return [...base.slice(0, 100), ...base.slice(10, 50), ...base.slice(100)]
    }
    case 'invalid': {
      const base: unknown[] = syntheticRecords(100)
      INVALID_RECORDS.forEach((bad, i) => base.splice(5 + i * 12, 0, bad))
      return base
    }
    case 'partial':
      return syntheticRecords(400)
    case 'interrupted':
    case 'malformed':
      return syntheticRecords(500)
    default:
      return syntheticRecords(40)
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Builds a synthetic bridge for one scenario. Each call to `request` answers like a real source would. */
export function createMockBridge(scenario: MockScenario, { batchSize = 50, delayMs = 25 }: MockOptions = {}): ImportBridge & { requests: BridgeRequest[] } {
  const records = recordsFor(scenario)
  const batches: unknown[][] = []
  for (let i = 0; i < records.length; i += batchSize) batches.push(records.slice(i, i + batchSize))
  const importId = `mock-${scenario}`
  // The partial source stops after half its batches.
  const stopAt = scenario === 'partial' ? Math.ceil(batches.length / 2) : batches.length
  const requests: BridgeRequest[] = []

  return {
    requests,
    async request(message) {
      requests.push(message)
      await wait(delayMs)
      if (scenario === 'unavailable') throw new Error('no import source')
      switch (message.type) {
        case 'hello':
          return { schema: scenario === 'wrong_version' ? 'bkmk.import/v2' : IMPORT_SCHEMA, type: 'hello', source: { name: 'BKMK mock source', version: '0.0.0' } }
        case 'start':
          return { schema: IMPORT_SCHEMA, type: 'started', importId, expectedTotal: records.length }
        case 'cancel':
          return { schema: IMPORT_SCHEMA, type: 'cancelled', importId }
        case 'next': {
          const n = message.seq
          if (scenario === 'interrupted' && n > 3) throw new Error('connection lost')
          if (scenario === 'malformed' && n === 3) return { schema: IMPORT_SCHEMA, type: 'batch', importId: 'someone-else', seq: n, records: [] }
          if (n > stopAt) {
            return scenario === 'partial'
              ? { schema: IMPORT_SCHEMA, type: 'end', importId, coverage: 'partial', reason: 'rate_limited' }
              : { schema: IMPORT_SCHEMA, type: 'end', importId, coverage: 'complete' }
          }
          return { schema: IMPORT_SCHEMA, type: 'batch', importId, seq: n, records: batches[n - 1] }
        }
      }
    },
  }
}
