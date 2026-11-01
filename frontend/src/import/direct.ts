// Turns a received direct import into the same staged import every other import
// produces, so it runs through the existing scan, analysis, reveal and library.

import type { StagedImport } from '../services/import'
import { mergeParsed, toRawBookmarks } from './parse'
import type { ReceiveResult } from './receiver'
import { STOP_REASON_COPY } from './record'

/** Why a partial import is partial, in words, or undefined for a complete one. */
export function partialNoteFor(result: Pick<ReceiveResult, 'coverage' | 'reason' | 'counts'>): string | undefined {
  if (result.coverage === 'complete') return undefined
  const why = result.reason ? STOP_REASON_COPY[result.reason] : 'it didn’t finish'
  return `Partial import: it stopped early because ${why}. ${result.counts.valid.toLocaleString('en')} bookmarks arrived, so your collection may have more than this shows.`
}

export function toStagedImport(result: ReceiveResult, handle: string, displayName = handle): StagedImport {
  // Records are already validated and de-duplicated; mergeParsed adds the shared ordering, cap and summary.
  const { items, summary } = mergeParsed([{ kind: 'bookmarks', format: 'extension', items: result.items, skipped: result.counts.rejected }])
  return {
    handle,
    displayName,
    raw: toRawBookmarks(items),
    info: { ...summary, duplicates: result.counts.duplicates },
    partialNote: partialNoteFor(result),
  }
}
