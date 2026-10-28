import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isApiError, setCsrfToken, setUnauthorizedHandler } from '../api/client'
import { api, toScanResult, type Me } from '../api/endpoints'
import type { ScanResult } from '../domain/types'

// Live (real X account) state. Kept entirely separate from the demo store:
// nothing here is written to localStorage, and demo data never lands here.

export type LiveStatus = 'checking' | 'unavailable' | 'anonymous' | 'authenticated'
export type ReportState = 'idle' | 'loading' | 'ready' | 'none' | 'error'

interface LiveContext {
  status: LiveStatus
  me: Me | null
  report: ScanResult | null
  reportState: ReportState
  refresh: () => Promise<Me | null>
  loadReport: () => Promise<ScanResult | null>
  setReport: (r: ScanResult) => void
  clear: () => void
}

const Ctx = createContext<LiveContext | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LiveStatus>('checking')
  const [me, setMe] = useState<Me | null>(null)
  const [report, setReportState] = useState<ScanResult | null>(null)
  const [reportState, setRS] = useState<ReportState>('idle')
  const inflight = useRef<Promise<ScanResult | null> | null>(null)

  const clear = useCallback(() => {
    setCsrfToken(null)
    setMe((m) => (m ? { ...m, authenticated: false, user: null, connection: null, csrfToken: null } : m))
    setStatus((s) => (s === 'unavailable' ? s : 'anonymous'))
    setReportState(null)
    setRS('idle')
  }, [])

  const loadReport = useCallback(() => {
    inflight.current ??= (async () => {
      setRS('loading')
      try {
        const r = toScanResult(await api.dashboard())
        setReportState(r)
        setRS('ready')
        return r
      } catch (e) {
        setRS(isApiError(e, 'no_scan') ? 'none' : 'error')
        return null
      } finally {
        inflight.current = null
      }
    })()
    return inflight.current
  }, [])

  const refresh = useCallback(async () => {
    try {
      const m = await api.me()
      setMe(m)
      setCsrfToken(m.csrfToken)
      setStatus(m.authenticated ? 'authenticated' : 'anonymous')
      return m
    } catch {
      // No backend (static demo hosting) or it's down: live features are unavailable.
      setStatus('unavailable')
      return null
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(clear)
    // Syncs with the server session on load; state updates happen after the fetch resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    refresh().then((m) => {
      if (m?.authenticated) loadReport()
    })
    return () => setUnauthorizedHandler(null)
  }, [refresh, loadReport, clear])

  const setReport = useCallback((r: ScanResult) => {
    setReportState(r)
    setRS('ready')
  }, [])

  const value = useMemo(
    () => ({ status, me, report, reportState, refresh, loadReport, setReport, clear }),
    [status, me, report, reportState, refresh, loadReport, setReport, clear],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLive() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLive must be used inside LiveProvider')
  return ctx
}
