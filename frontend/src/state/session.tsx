import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import type { DemoPersona } from '../data/demoProfile'
import type { ScanResult } from '../domain/types'
import type { AccountIdentity, DemoScenario } from '../services'
import { useLive } from './live'

// One small, explicit state model for the whole journey:
//   anonymous → identified → authorized → (scanning) → scanned
// UI components read this; services never touch it directly.

/** demo: synthetic sample · import: the user's own file, analysed locally · live: X API via the backend. */
export type AppMode = 'demo' | 'import' | 'live'

export interface SessionState {
  /** Which data the dashboard shows. Demo, import and live data are never mixed. */
  mode: AppMode
  identity: AccountIdentity | null
  authorized: boolean
  result: ScanResult | null
  /** True once the reveal has been watched, so revisits skip the animation. */
  revealSeen: boolean
  demo: { scenario: DemoScenario; persona: DemoPersona | 'auto' }
}

type Action =
  | { type: 'identify'; identity: AccountIdentity }
  | { type: 'authorize' }
  | { type: 'scanned'; result: ScanResult }
  | { type: 'reveal-seen' }
  | { type: 'auth-expired' }
  | { type: 'demo'; scenario?: DemoScenario; persona?: DemoPersona | 'auto' }
  | { type: 'disconnect' }
  | { type: 'reset' }
  | { type: 'mode'; mode: AppMode }

// v2: results gained `recent` and `stats.topicBreakdown`; older saved demos are discarded.
const STORAGE_KEY = 'bkmk.session.v2'

const initial: SessionState = {
  mode: 'demo',
  identity: null,
  authorized: false,
  result: null,
  revealSeen: false,
  demo: { scenario: 'normal', persona: 'auto' },
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'identify':
      // A different handle invalidates everything tied to the previous one.
      if (state.identity?.handle.toLowerCase() === action.identity.handle.toLowerCase()) {
        return { ...state, identity: action.identity }
      }
      return { ...initial, demo: state.demo, identity: action.identity }
    case 'authorize':
      return { ...state, authorized: true }
    case 'scanned':
      return { ...state, result: keepEarned(state.result, action.result), revealSeen: false }
    case 'reveal-seen':
      return { ...state, revealSeen: true }
    case 'auth-expired':
      return { ...state, authorized: false }
    case 'demo':
      return {
        ...state,
        demo: { scenario: action.scenario ?? state.demo.scenario, persona: action.persona ?? state.demo.persona },
      }
    case 'disconnect':
      // Keeps nothing tied to the account. Mirrors the production behaviour of
      // revoking the token and deleting stored bookmarks.
      return { ...initial, demo: state.demo }
    case 'reset':
      return initial
    case 'mode':
      return { ...state, mode: action.mode }
  }
}

/**
 * Badges are never revoked: a later partial scan (or deleted posts) can't take
 * away what an earlier scan under the same rules version earned. Re-earning
 * is a no-op, so rescans never double-award either.
 */
function keepEarned(prev: ScanResult | null, next: ScanResult): ScanResult {
  if (!prev || prev.handle.toLowerCase() !== next.handle.toLowerCase() || prev.achievementsVersion !== next.achievementsVersion) return next
  const before = new Map(prev.achievements.map((a) => [a.id, a]))
  return {
    ...next,
    achievements: next.achievements.map((a) => {
      const old = before.get(a.id)
      return old?.earned && !a.earned ? { ...a, earned: true, current: a.target } : a
    }),
  }
}

function load(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...initial, ...(JSON.parse(raw) as SessionState) } : initial
  } catch {
    return initial
  }
}

const Ctx = createContext<{ state: SessionState; dispatch: (a: Action) => void } | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage full or blocked: the session still works in memory.
    }
  }, [state])
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useSession() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** The result every dashboard page renders: the live report or the demo result, never a mix. */
export function useResult() {
  const { state } = useSession()
  const live = useLive()
  return state.mode === 'live' ? live.report : state.result
}
