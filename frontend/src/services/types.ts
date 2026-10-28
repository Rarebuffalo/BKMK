import type { DemoPersona } from '../data/demoProfile'
import type { ScanResult, TopicId } from '../domain/types'

// Service contracts. The demo implementations in ./demo.ts satisfy these; the
// production implementations will call the FastAPI backend instead.

export type DemoScenario = 'normal' | 'slow' | 'partial' | 'empty' | 'api-error' | 'auth-expired'

export interface AccountIdentity {
  handle: string
  displayName: string
  /** True when this identity is a local stand-in, not confirmed with X. */
  isDemo: boolean
}

export type AuthOutcome = 'granted' | 'denied' | 'cancelled'

export type ScanPhase = 'connect' | 'retrieve' | 'topics' | 'classify' | 'stats' | 'achievements' | 'report'

export type ScanErrorCode = 'api-error' | 'auth-expired' | 'rate-limited' | 'network' | 'cooldown' | 'daily-budget' | 'missing-permissions'

export type ScanEvent =
  | { type: 'phase'; phase: ScanPhase }
  | { type: 'progress'; retrieved: number; page: number }
  | { type: 'log'; text: string; tone?: 'muted' | 'ok' | 'warn' }
  | { type: 'topics'; counts: { topic: TopicId; count: number }[] }
  | { type: 'achievement'; id: string }
  | { type: 'slow' }
  | { type: 'done'; result: ScanResult }
  | { type: 'error'; code: ScanErrorCode; message: string; retryable: boolean }

export interface ScanRequest {
  identity: AccountIdentity
  persona?: DemoPersona
  scenario: DemoScenario
  /** Live only: 'refresh' fetches new bookmarks; 'full' re-reads the collection. Server decides when omitted. */
  mode?: 'full' | 'refresh'
}

export interface IdentityService {
  lookup(handle: string): Promise<AccountIdentity>
}

export interface AuthService {
  authorize(identity: AccountIdentity, scenario: DemoScenario, simulate?: AuthOutcome): Promise<AuthOutcome>
}

export interface ScanService {
  /** Starts a scan and streams events. Returns a function that cancels it. */
  start(request: ScanRequest, onEvent: (event: ScanEvent) => void): () => void
}
