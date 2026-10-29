import { isApiError } from '../api/client'
import { api, toScanResult, type ApiScan } from '../api/endpoints'
import type { TopicId } from '../domain/types'
import type { ScanErrorCode, ScanEvent, ScanPhase, ScanService } from './types'

// LIVE scan service: starts a real scan on the backend and turns the persisted
// progress events into the same ScanEvents the demo emits. Numbers shown come
// only from the server; there is no simulated progress here.

const POLL_MS = 700
const SLOW_AFTER_MS = 20_000
const MAX_POLL_FAILURES = 5
const PHASES: ScanPhase[] = ['connect', 'retrieve', 'topics', 'classify', 'stats', 'achievements', 'report']

function errorCode(code: string | null | undefined): ScanErrorCode {
  switch (code) {
    case 'auth_expired':
    case 'not_connected':
    case 'not_authenticated':
      return 'auth-expired'
    case 'rate_limited':
      return 'rate-limited'
    case 'scan_cooldown':
      return 'cooldown'
    case 'daily_budget':
      return 'daily-budget'
    case 'network':
      return 'network'
    case 'missing_permissions':
      return 'missing-permissions'
    case 'x_payment_required':
      return 'x-billing'
    case 'x_access_restricted':
      return 'x-access'
    case 'x_request_rejected':
    case 'invalid_request':
      return 'x-rejected'
    default:
      return 'api-error'
  }
}

// Retrying can't fix these: they need time to pass or the app owner to act.
const NOT_RETRYABLE = new Set<ScanErrorCode>(['cooldown', 'daily-budget', 'x-billing', 'x-access'])

export const liveScanService: ScanService = {
  start({ mode }, onEvent) {
    let cancelled = false
    const emit = (e: ScanEvent) => {
      if (!cancelled) onEvent(e)
    }
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const run = async () => {
      let scan: ApiScan
      try {
        emit({ type: 'phase', phase: 'connect' })
        scan = await api.startScan(mode)
      } catch (e) {
        const code = isApiError(e) ? e.code : 'network'
        const message = isApiError(e) ? e.message : 'Couldn’t start the scan.'
        emit({ type: 'error', code: errorCode(code), message, retryable: !NOT_RETRYABLE.has(errorCode(code)) })
        return
      }
      emit({ type: 'log', text: `scan ${scan.id.slice(0, 8)} · ${scan.mode} · limit ${scan.requestedLimit}`, tone: 'muted' })

      const started = Date.now()
      let seen = 0
      let phase = ''
      let failures = 0
      let slowSent = false
      while (!cancelled) {
        for (const ev of scan.events.slice(seen)) {
          if (ev.type === 'bookmarks_received') {
            emit({ type: 'progress', retrieved: Number(ev.total), page: Number(ev.page) })
            emit({ type: 'log', text: `page ${String(ev.page).padStart(2, '0')} → ${ev.total} bookmarks (${ev.new} new)`, tone: 'muted' })
          } else if (ev.type === 'retrieving_page' && ev.page) {
            emit({ type: 'log', text: `requesting page ${String(ev.page).padStart(2, '0')}…`, tone: 'muted' })
          } else if (ev.type === 'achievement_unlocked') {
            emit({ type: 'achievement', id: String(ev.id) })
          }
        }
        seen = scan.events.length
        if (scan.phase !== phase && PHASES.includes(scan.phase as ScanPhase)) {
          phase = scan.phase
          emit({ type: 'phase', phase: phase as ScanPhase })
        }

        if (scan.status === 'completed' || scan.status === 'partial') {
          if (scan.errorMessage) emit({ type: 'log', text: scan.errorMessage, tone: 'warn' })
          try {
            const result = toScanResult(await api.dashboard())
            emit({ type: 'topics', counts: result.stats.topTopics.map((t) => ({ topic: t.topic as TopicId, count: t.count })) })
            emit({ type: 'log', text: `${scan.apiRequests} API requests · ${scan.retrieved} bookmarks read`, tone: 'ok' })
            await sleep(450)
            emit({ type: 'phase', phase: 'report' })
            emit({ type: 'done', result })
          } catch (e) {
            emit({ type: 'error', code: 'api-error', message: isApiError(e) ? e.message : 'Couldn’t load your report.', retryable: true })
          }
          return
        }
        if (scan.status === 'failed') {
          const code = errorCode(scan.errorCode)
          emit({ type: 'error', code, message: scan.errorMessage ?? 'The scan failed.', retryable: !NOT_RETRYABLE.has(code) })
          return
        }
        if (!slowSent && Date.now() - started > SLOW_AFTER_MS) {
          slowSent = true
          emit({ type: 'slow' })
        }

        await sleep(POLL_MS)
        try {
          scan = await api.scan(scan.id)
          failures = 0
        } catch (e) {
          if (isApiError(e) && e.status === 401) {
            emit({ type: 'error', code: 'auth-expired', message: 'Your session ended. Sign in again.', retryable: true })
            return
          }
          if (++failures >= MAX_POLL_FAILURES) {
            emit({ type: 'error', code: 'network', message: 'Lost contact with the server. Your scan may still finish — reload to check.', retryable: true })
            return
          }
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  },
}
