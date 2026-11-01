// The import receiver: BKMK.exe pulls bookmarks from an import source, batch by
// batch, and validates everything it gets back.
//
// Security boundary:
// - BKMK.exe always initiates. It asks; the source only answers that request.
// - There is no window "message" listener, so other pages and frames can't push
//   data in.
// - Answers are only accepted when they match the request: same schema, same
//   import id, the expected batch number.
// - The only bridge in this phase is the synthetic mock (mockBridge.ts). A real
//   one would be an extension reached by its id through chrome.runtime, with the
//   extension's externally_connectable limited to BKMK.exe's exact origin. That
//   is Phase 2 and waits on X's written permission.

import { IMPORT_SCHEMA, LIMITS, messageSize, SENDER_STOP_REASONS, validateRecord, type StopReason } from './record'
import type { ImportItem } from './parse'

export type BridgeRequest =
  | { schema: typeof IMPORT_SCHEMA; type: 'hello' }
  | { schema: typeof IMPORT_SCHEMA; type: 'start' }
  | { schema: typeof IMPORT_SCHEMA; type: 'next'; importId: string; seq: number }
  | { schema: typeof IMPORT_SCHEMA; type: 'cancel'; importId: string }

/** How BKMK.exe reaches an import source. Each request gets exactly one answer, or a rejection. */
export interface ImportBridge {
  request(message: BridgeRequest): Promise<unknown>
}

export interface ImportSource {
  name: string
  version: string
}

export interface ReceiveCounts {
  /** Records the source sent, valid or not. */
  received: number
  /** Valid, new records kept. */
  valid: number
  duplicates: number
  rejected: number
  batches: number
}

export interface ReceiveProgress extends ReceiveCounts {
  source?: ImportSource
  /** What the source said it would send, if it knew. */
  expectedTotal?: number
}

export interface Rejection {
  batch: number
  index: number
  reason: string
}

export interface ReceiveResult {
  items: ImportItem[]
  source: ImportSource
  importId: string
  counts: ReceiveCounts
  coverage: 'complete' | 'partial'
  /** Set whenever coverage is partial. */
  reason?: StopReason
  /** The first few rejected records, for display. */
  rejections: Rejection[]
}

/** The import never got going: no data was received. */
export class ImportReceiveError extends Error {
  readonly code: 'unavailable' | 'unsupported_version' | 'protocol_error' | 'cancelled'
  constructor(code: ImportReceiveError['code'], message: string) {
    super(message)
    this.code = code
  }
}

export interface ReceiveOptions {
  onProgress?: (p: ReceiveProgress) => void
  signal?: AbortSignal
  /** How long one answer may take before the import counts as interrupted. */
  timeoutMs?: number
}

const MAX_SHOWN_REJECTIONS = 50

class ProtocolError extends Error {}
class Interrupted extends Error {}
class Cancelled extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function ask(bridge: ImportBridge, message: BridgeRequest, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) return Promise.reject(new Cancelled())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(() => reject(new Interrupted('timed out'))), timeoutMs)
    const onAbort = () => done(() => reject(new Cancelled()))
    const done = (settle: () => void) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      settle()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    let pending: Promise<unknown>
    try {
      pending = bridge.request(message)
    } catch {
      done(() => reject(new Interrupted('bridge failed')))
      return
    }
    pending.then(
      (answer) => done(() => resolve(answer)),
      () => done(() => reject(new Interrupted('bridge failed'))),
    )
  })
}

/** Checks the envelope every answer shares: an object of acceptable size, for this schema and type. */
function envelope(answer: unknown, type: string): Record<string, unknown> {
  const size = messageSize(answer)
  if (size === null) throw new ProtocolError('unreadable message')
  if (size > LIMITS.messageBytes) throw new ProtocolError('message too large')
  if (!isObject(answer)) throw new ProtocolError('not an object')
  if (answer.schema !== IMPORT_SCHEMA) throw new ProtocolError('wrong schema')
  if (answer.type !== type && !(type === 'batch' && answer.type === 'end')) throw new ProtocolError(`expected ${type}`)
  return answer
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

/**
 * Pulls one import from `bridge`. Resolves with whatever valid records arrived, and
 * says plainly whether the import is complete. Rejects only when nothing could be
 * received at all.
 */
export async function receiveImport(bridge: ImportBridge, opts: ReceiveOptions = {}): Promise<ReceiveResult> {
  const { onProgress, signal, timeoutMs = 15_000 } = opts

  // ── Handshake: nothing received yet, so failures here reject. ──
  let source: ImportSource
  let importId: string
  let expectedTotal: number | undefined
  try {
    const hello = await ask(bridge, { schema: IMPORT_SCHEMA, type: 'hello' }, timeoutMs, signal)
    if (isObject(hello) && hello.type === 'hello' && hello.schema !== IMPORT_SCHEMA) {
      throw new ImportReceiveError('unsupported_version', 'The import source uses a format version BKMK.exe doesn’t support.')
    }
    const h = envelope(hello, 'hello')
    const s = isObject(h.source) ? h.source : {}
    const name = text(s.name, 60)
    const version = text(s.version, 30)
    if (!name || !version) throw new ProtocolError('missing source')
    source = { name, version }

    const started = envelope(await ask(bridge, { schema: IMPORT_SCHEMA, type: 'start' }, timeoutMs, signal), 'started')
    const id = text(started.importId, 64)
    if (!id || !/^[\w-]+$/.test(id)) throw new ProtocolError('missing import id')
    importId = id
    if (started.expectedTotal !== undefined) {
      if (!Number.isSafeInteger(started.expectedTotal) || (started.expectedTotal as number) < 0) throw new ProtocolError('invalid expected total')
      expectedTotal = started.expectedTotal as number
    }
  } catch (e) {
    if (e instanceof ImportReceiveError) throw e
    if (e instanceof Cancelled) throw new ImportReceiveError('cancelled', 'You stopped the import before it started.')
    if (e instanceof ProtocolError) throw new ImportReceiveError('protocol_error', 'The import source answered in a way BKMK.exe couldn’t accept.')
    throw new ImportReceiveError('unavailable', 'BKMK.exe couldn’t reach the import source.')
  }

  // ── Transfer: from here on, a failure ends the import as partial, never as complete. ──
  const byId = new Map<string, ImportItem>()
  const counts: ReceiveCounts = { received: 0, valid: 0, duplicates: 0, rejected: 0, batches: 0 }
  const rejections: Rejection[] = []
  const report = () => onProgress?.({ ...counts, source, expectedTotal })
  report()

  let coverage: 'complete' | 'partial' = 'partial'
  let reason: StopReason | undefined
  try {
    for (let seq = 1; ; seq++) {
      if (seq > LIMITS.batches) throw new ProtocolError('too many batches')
      const answer = envelope(await ask(bridge, { schema: IMPORT_SCHEMA, type: 'next', importId, seq }, timeoutMs, signal), 'batch')
      if (answer.importId !== importId) throw new ProtocolError('wrong import id')

      if (answer.type === 'end') {
        if (answer.coverage === 'complete' && answer.reason === undefined) {
          coverage = 'complete'
        } else if (answer.coverage === 'partial' && SENDER_STOP_REASONS.includes(answer.reason as StopReason)) {
          reason = answer.reason as StopReason
        } else {
          throw new ProtocolError('invalid end')
        }
        break
      }

      if (answer.seq !== seq) throw new ProtocolError('batch out of order')
      if (!Array.isArray(answer.records)) throw new ProtocolError('records missing')
      if (answer.records.length > LIMITS.batchRecords) throw new ProtocolError('batch too large')
      counts.batches++
      answer.records.forEach((raw, index) => {
        counts.received++
        const r = validateRecord(raw)
        if (!r.ok) {
          counts.rejected++
          if (rejections.length < MAX_SHOWN_REJECTIONS) rejections.push({ batch: seq, index, reason: r.reason })
        } else if (byId.has(r.item.id)) {
          counts.duplicates++
        } else if (byId.size < LIMITS.items) {
          byId.set(r.item.id, r.item)
          counts.valid++
        }
      })
      report()
      if (byId.size >= LIMITS.items) {
        reason = 'item_limit'
        break
      }
    }
  } catch (e) {
    reason = e instanceof Cancelled ? 'cancelled' : e instanceof ProtocolError ? 'protocol_error' : 'interrupted'
  }
  if (reason) coverage = 'partial'
  // Tell the source to stop when BKMK.exe ended the import itself. Best effort only.
  if (reason === 'cancelled' || reason === 'item_limit' || reason === 'protocol_error') {
    ask(bridge, { schema: IMPORT_SCHEMA, type: 'cancel', importId }, 2000).catch(() => undefined)
  }
  report()
  return { items: [...byId.values()], source, importId, counts: { ...counts }, coverage, reason, rejections }
}
