import { ACHIEVEMENT_BY_ID } from '../domain/achievements'
import { analyze } from '../domain/analyze'
import { classify } from '../domain/classifier'
import type { ImportInfo, RawBookmark, TopicId } from '../domain/types'
import type { ScanEvent, ScanService } from './types'

// IMPORT "scan": analyses a file the user chose, entirely in this browser. No
// network request is made, so it can't cost anything. Progress numbers are the
// real count of posts processed; only the pacing is slowed so it's watchable.

export interface StagedImport {
  handle: string
  displayName: string
  raw: RawBookmark[]
  info: ImportInfo
  /** Set when the import itself stopped early, so the result is never presented as complete. */
  partialNote?: string
}

let staged: StagedImport | null = null

/** Hands a parsed import to the scan page. Kept in memory only, never sent anywhere. */
export function stageImport(next: StagedImport) {
  staged = next
}

export function hasStagedImport() {
  return staged !== null
}

const CHUNK = 100
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function coverageNoteFor(info: ImportInfo): string {
  const what =
    info.kind === 'likes'
      ? 'Likes from your X archive (X’s archive doesn’t include bookmarks)'
      : info.formats.includes('extension')
        ? 'bookmarks received by direct import'
        : 'an imported bookmark list'
  const gaps = [
    info.withText < info.total && `${info.total - info.withText} without post text (topics can’t be read from those)`,
    info.withAuthor < info.total && `${info.total - info.withAuthor} without author`,
  ].filter(Boolean)
  const cap = info.truncated ? ` Only the newest ${info.total} were analysed; ${info.truncated} older ones were left out.` : ''
  return `Analysed from ${what}, on this device.${gaps.length ? ` ${gaps.join('; ')}.` : ''}${cap}`
}

export const importScanService: ScanService = {
  start(_request, onEvent) {
    let cancelled = false
    const emit = (e: ScanEvent) => {
      if (!cancelled) onEvent(e)
    }
    const run = async () => {
      const job = staged
      if (!job) {
        emit({ type: 'error', code: 'import-missing', message: 'There’s no import loaded. Choose your file again.', retryable: false })
        return
      }
      if (!job.raw.length) {
        emit({ type: 'error', code: 'import-empty', message: 'The import didn’t contain any X posts to analyse.', retryable: false })
        return
      }
      const pace = Math.max(25, Math.min(220, 2600 / Math.ceil(job.raw.length / CHUNK)))
      emit({ type: 'phase', phase: 'connect' })
      emit({ type: 'log', text: `reading ${job.info.kind === 'likes' ? 'archive likes' : 'imported list'} · on this device, no network`, tone: 'muted' })
      await wait(400)
      emit({ type: 'phase', phase: 'retrieve' })
      const counts = new Map<TopicId, number>()
      for (let i = 0; i < job.raw.length; i += CHUNK) {
        if (cancelled) return
        const page = job.raw.slice(i, i + CHUNK)
        for (const b of page) {
          const t = classify(b).topic
          counts.set(t, (counts.get(t) ?? 0) + 1)
        }
        const done = Math.min(job.raw.length, i + CHUNK)
        emit({ type: 'progress', retrieved: done, page: i / CHUNK + 1 })
        emit({ type: 'topics', counts: [...counts].map(([topic, count]) => ({ topic, count })) })
        emit({ type: 'log', text: `chunk ${i / CHUNK + 1} · ${done} posts read`, tone: 'muted' })
        await wait(pace)
      }
      for (const phase of ['topics', 'classify', 'stats'] as const) {
        emit({ type: 'phase', phase })
        await wait(250)
      }
      const result = analyze({
        handle: job.handle,
        displayName: job.displayName,
        isDemo: false,
        source: 'import',
        importInfo: job.info,
        raw: job.raw,
        coverage: job.partialNote || job.info.truncated ? 'partial' : 'complete',
        coverageNote: job.partialNote ? `${job.partialNote} ${coverageNoteFor(job.info)}` : coverageNoteFor(job.info),
        scannedAt: new Date().toISOString(),
      })
      emit({ type: 'phase', phase: 'achievements' })
      for (const a of result.achievements.filter((x) => x.earned)) {
        if (cancelled) return
        emit({ type: 'achievement', id: a.id })
        emit({ type: 'log', text: `unlocked · ${ACHIEVEMENT_BY_ID[a.id]?.name ?? a.id}`, tone: 'ok' })
        await wait(180)
      }
      emit({ type: 'phase', phase: 'report' })
      emit({ type: 'done', result })
    }
    run()
    return () => {
      cancelled = true
    }
  },
}
