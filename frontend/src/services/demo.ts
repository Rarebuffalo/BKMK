import { generateDemoBookmarks, personaForHandle } from '../data/demoProfile'
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from '../domain/achievements'
import { analyze } from '../domain/analyze'
import { TOPIC_BY_ID } from '../domain/topics'
import type { AuthService, IdentityService, ScanEvent, ScanService } from './types'

// DEMO IMPLEMENTATIONS. Timing is simulated and data is synthetic. Nothing here
// contacts X. Swap these for API-backed services in services/index.ts.

const PAGE_SIZE = 100
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const demoIdentityService: IdentityService = {
  async lookup(handle) {
    await wait(650)
    return { handle, displayName: handle.replace(/_/g, ' '), isDemo: true }
  },
}

export const demoAuthService: AuthService = {
  async authorize(_identity, _scenario, simulate = 'granted') {
    await wait(1100)
    return simulate
  },
}

export const demoScanService: ScanService = {
  start({ identity, persona, scenario }, onEvent) {
    let cancelled = false
    const emit = (e: ScanEvent) => {
      if (!cancelled) onEvent(e)
    }
    const slow = scenario === 'slow'
    const tick = (ms: number) => wait(slow ? ms * 3.2 : ms)

    const run = async () => {
      const chosen = persona ?? personaForHandle(identity.handle)
      const all = scenario === 'empty' ? [] : generateDemoBookmarks(identity.handle, chosen)

      emit({ type: 'phase', phase: 'connect' })
      emit({ type: 'log', text: `handshake @${identity.handle} … demo session`, tone: 'muted' })
      await tick(700)
      if (cancelled) return
      if (slow) setTimeout(() => emit({ type: 'slow' }), 4000)

      emit({ type: 'phase', phase: 'retrieve' })
      const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
      const stopAfter = scenario === 'partial' ? Math.max(1, Math.ceil(pages * 0.6)) : pages
      let retrieved = 0
      for (let page = 1; page <= stopAfter; page++) {
        await tick(520)
        if (cancelled) return
        if (scenario === 'auth-expired' && page === 2) {
          emit({ type: 'error', code: 'auth-expired', message: 'Your X authorization expired mid-scan.', retryable: true })
          return
        }
        if (scenario === 'api-error' && page === 3) {
          emit({ type: 'error', code: 'api-error', message: 'X returned an unexpected error (HTTP 503).', retryable: true })
          return
        }
        retrieved = Math.min(all.length, page * PAGE_SIZE)
        emit({ type: 'progress', retrieved, page })
        emit({ type: 'log', text: `page ${String(page).padStart(2, '0')} → ${retrieved} bookmarks`, tone: 'muted' })
      }
      const raw = all.slice(0, retrieved)
      const partial = retrieved < all.length
      if (partial) emit({ type: 'log', text: `rate limit reached after ${stopAfter} pages`, tone: 'warn' })

      const result = analyze({
        handle: identity.handle,
        displayName: identity.displayName,
        isDemo: true,
        raw,
        coverage: partial ? 'partial' : 'complete',
        coverageNote: partial
          ? `Scan paused at ${retrieved} bookmarks when the X rate limit was reached. Results reflect what was retrieved; resume later to complete it.`
          : undefined,
        scannedAt: new Date().toISOString(),
      })

      emit({ type: 'phase', phase: 'topics' })
      emit({ type: 'topics', counts: result.stats.topTopics.map(({ topic, count }) => ({ topic, count })) })
      for (const t of result.stats.topTopics.slice(0, 5)) {
        await tick(260)
        emit({ type: 'log', text: `cluster ${TOPIC_BY_ID[t.topic].short.toLowerCase()} · ${t.count}`, tone: 'ok' })
      }
      emit({ type: 'phase', phase: 'classify' })
      await tick(500)
      const ct = result.stats.contentTypeCounts
      emit({ type: 'log', text: `threads ${ct.thread} · repos ${ct.repo} · articles ${ct.article} · papers ${ct.paper}`, tone: 'muted' })
      emit({ type: 'phase', phase: 'stats' })
      await tick(600)
      emit({ type: 'log', text: `${result.stats.authorCount} authors · ${result.stats.inaccessible} unavailable posts skipped`, tone: 'muted' })
      emit({ type: 'phase', phase: 'achievements' })
      for (const a of ACHIEVEMENTS) {
        const p = result.achievements.find((x) => x.id === a.id)
        if (!p?.earned) continue
        await tick(380)
        if (cancelled) return
        emit({ type: 'achievement', id: a.id })
        emit({ type: 'log', text: `unlocked ${ACHIEVEMENT_BY_ID[a.id].name.toLowerCase()}`, tone: 'ok' })
      }
      emit({ type: 'phase', phase: 'report' })
      await tick(700)
      emit({ type: 'done', result })
    }

    run()
    return () => {
      cancelled = true
    }
  },
}
