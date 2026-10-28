import { ArrowRight, Clock, KeyRound, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DemoLab, DemoTag } from '../components/brand/Demo'
import { AchievementBadge, RARITY_COLOR } from '../components/brand/Pixel'
import { FlowLayout, Window } from '../components/scan/Window'
import { Button } from '../components/ui/Button'
import { BlockProgress, EmptyState, ErrorState } from '../components/ui/primitives'
import { ACHIEVEMENT_BY_ID } from '../domain/achievements'
import { TOPIC_BY_ID } from '../domain/topics'
import type { ScanResult, TopicId } from '../domain/types'
import { cx } from '../lib/cx'
import { fmt } from '../lib/format'
import { scanService, type ScanErrorCode, type ScanPhase } from '../services'
import { useSession } from '../state/session'

const PHASES: { id: ScanPhase; label: string }[] = [
  { id: 'connect', label: 'Connecting to account' },
  { id: 'retrieve', label: 'Retrieving bookmarks' },
  { id: 'topics', label: 'Detecting topics' },
  { id: 'classify', label: 'Classifying resources' },
  { id: 'stats', label: 'Calculating collection stats' },
  { id: 'achievements', label: 'Checking achievements' },
  { id: 'report', label: 'Preparing DNA report' },
]

/** The archive grid: 160 cells × 5 = 800, the most X's bookmarks API returns. */
const CELLS = 160
const PER_CELL = 5

interface ScanView {
  phase: ScanPhase
  retrieved: number
  page: number
  logs: { id: number; text: string; tone?: 'muted' | 'ok' | 'warn' }[]
  topics: { topic: TopicId; count: number }[]
  unlocked: string[]
  slow: boolean
  error: { code: ScanErrorCode; message: string; retryable: boolean } | null
  result: ScanResult | null
}

const blank: ScanView = { phase: 'connect', retrieved: 0, page: 0, logs: [], topics: [], unlocked: [], slow: false, error: null, result: null }

export function ScanPage() {
  const navigate = useNavigate()
  const { state, dispatch } = useSession()
  const [run, setRun] = useState(0)
  const [view, setView] = useState<ScanView>(blank)
  const logId = useRef(0)
  const retry = () => {
    setView(blank)
    setRun((r) => r + 1)
  }

  useEffect(() => {
    if (!state.identity || !state.authorized) return
    const cancel = scanService.start(
      { identity: state.identity, scenario: state.demo.scenario, persona: state.demo.persona === 'auto' ? undefined : state.demo.persona },
      (e) => {
        setView((v) => {
          switch (e.type) {
            case 'phase':
              return { ...v, phase: e.phase }
            case 'progress':
              return { ...v, retrieved: e.retrieved, page: e.page }
            case 'log':
              return { ...v, logs: [...v.logs.slice(-7), { id: ++logId.current, text: e.text, tone: e.tone }] }
            case 'topics':
              return { ...v, topics: e.counts }
            case 'achievement':
              return { ...v, unlocked: [...v.unlocked, e.id] }
            case 'slow':
              return { ...v, slow: true }
            case 'error':
              return { ...v, error: e }
            case 'done':
              return { ...v, result: e.result }
          }
        })
        // An empty scan shows its own state but doesn't overwrite a previous library.
        if (e.type === 'done' && e.result.stats.retrieved > 0) dispatch({ type: 'scanned', result: e.result })
        if (e.type === 'error') {
          if (e.code === 'auth-expired') dispatch({ type: 'auth-expired' })
          // Demo only: let the recovery path succeed on the next attempt.
          dispatch({ type: 'demo', scenario: 'normal' })
        }
      },
    )
    return cancel
    // Re-run only on explicit retry; identity/scenario changes go through /connect.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  // Satisfying hand-off: brief pause on "report ready", then reveal.
  useEffect(() => {
    if (!view.result || view.result.stats.retrieved === 0) return
    const t = setTimeout(() => navigate('/reveal', { replace: true }), 1500)
    return () => clearTimeout(t)
  }, [view.result, navigate])

  const cellColors = useMemo(() => colourCells(view), [view])

  if (!state.identity) return <Navigate to="/" replace />
  if (!state.authorized && !view.error) return <Navigate to="/connect" replace state={{ handle: state.identity.handle }} />

  const phaseIndex = PHASES.findIndex((p) => p.id === view.phase)
  const done = !!view.result
  const empty = done && view.result!.stats.retrieved === 0

  return (
    <FlowLayout step={done && !empty ? 4 : 3}>
      <Window title={`scanning @${state.identity.handle}`} status={<DemoTag />}>
        {view.error ? (
          <div className="p-5 sm:p-8">
            <ScanError code={view.error.code} message={view.error.message} retrieved={view.retrieved} onRetry={retry} handle={state.identity.handle} />
          </div>
        ) : empty ? (
          <EmptyState
            title="No bookmarks found"
            body="This account doesn’t have any bookmarks we can read yet. Save a few posts on X, then run the scan again."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<RotateCcw size={14} />} onClick={retry}>Scan again</Button>
                <Button onClick={() => navigate('/')}>Back to start</Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-0 lg:grid-cols-[1.25fr_1fr]">
            {/* Archive grid */}
            <div className="relative border-b border-line p-5 sm:p-7 lg:border-r lg:border-b-0">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="eyebrow text-paper-faint">Bookmarks retrieved</div>
                  <div className="data mt-1 text-5xl font-bold text-paper sm:text-6xl" aria-live="polite">
                    {fmt(view.retrieved).padStart(3, '0')}
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-paper-faint">
                  <div>page {String(view.page).padStart(2, '0')}</div>
                  <div>1 cell = {PER_CELL} saves</div>
                  <div title="X's bookmarks API returns your 800 most recent bookmarks.">X shares up to {CELLS * PER_CELL}</div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-20 gap-[3px]" aria-hidden>
                {cellColors.map((c, i) => (
                  <span
                    key={i}
                    className="aspect-square transition-[background-color,transform] duration-300"
                    style={{ background: c ?? 'var(--ink-4)', transitionDelay: view.topics.length ? `${(i % 20) * 12 + Math.floor(i / 20) * 20}ms` : '0ms', transform: c ? 'scale(1)' : 'scale(0.82)' }}
                  />
                ))}
              </div>
              <div className="mt-4 flex min-h-6 flex-wrap gap-x-4 gap-y-1">
                {view.topics.slice(0, 6).map((t) => (
                  <span key={t.topic} className="flex animate-rise items-center gap-1.5 font-mono text-[11px] text-paper-dim">
                    <span className="size-2" style={{ background: TOPIC_BY_ID[t.topic].color }} />
                    {TOPIC_BY_ID[t.topic].short}
                  </span>
                ))}
              </div>
              {done && (
                <div className="absolute inset-0 grid animate-flicker place-items-center bg-ink/85 p-6 text-center">
                  <div>
                    <div className="eyebrow text-phosphor">SCAN COMPLETE</div>
                    <div className="display mt-3 text-4xl">Report ready.</div>
                    <Button variant="primary" className="mt-6" icon={<ArrowRight size={14} />} onClick={() => navigate('/reveal', { replace: true })}>
                      Reveal my DNA
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Phase list + log */}
            <div className="flex flex-col p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-paper-faint">Step {Math.min(phaseIndex + 1, PHASES.length)} / {PHASES.length}</span>
                <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => navigate('/')} disabled={done}>
                  Stop
                </Button>
              </div>
              <BlockProgress value={done ? PHASES.length : phaseIndex} max={PHASES.length} segments={28} className="mt-3" label="Scan progress" />
              <ol className="mt-5 space-y-2">
                {PHASES.map((p, i) => {
                  const status = done || i < phaseIndex ? 'done' : i === phaseIndex ? 'active' : 'todo'
                  return (
                    <li key={p.id} className={cx('flex items-center gap-3 font-mono text-[13px]', status === 'todo' ? 'text-paper-faint/60' : status === 'active' ? 'text-paper' : 'text-paper-dim')}>
                      <span className={cx('w-6 shrink-0 font-semibold', status === 'done' && 'text-phosphor')}>
                        {status === 'done' ? '[✓]' : status === 'active' ? <span className="animate-blink">[▸]</span> : '[ ]'}
                      </span>
                      {p.label}
                    </li>
                  )
                })}
              </ol>

              {view.slow && !done && (
                <div className="mt-5 flex gap-2 rounded-sm border border-amber/40 bg-amber/5 p-3 text-xs text-amber" role="status">
                  <Clock size={14} className="mt-0.5 shrink-0" />
                  <span>Slower than usual. X limits how fast bookmarks can be read — keep this tab open and we’ll keep going.</span>
                </div>
              )}

              <div className="mt-5 min-h-36 flex-1 rounded-sm border border-line bg-ink p-3 font-mono text-[11px] leading-5" aria-live="off">
                {view.logs.map((l) => (
                  <div key={l.id} className={cx('animate-rise truncate', l.tone === 'ok' ? 'text-phosphor' : l.tone === 'warn' ? 'text-amber' : 'text-paper-faint')}>
                    <span className="text-paper-faint/60">› </span>
                    {l.text}
                  </div>
                ))}
                {!done && <span className="animate-blink text-phosphor">▌</span>}
              </div>

              {view.unlocked.length > 0 && (
                <div className="mt-4">
                  <div className="eyebrow text-paper-faint">Unlocked</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {view.unlocked.map((id) => (
                      <span key={id} className="flex animate-pop items-center gap-2 rounded-xs border border-line bg-ink-3 py-1 pr-2.5 pl-1">
                        <AchievementBadge id={id} size={24} />
                        <span className="font-pixel text-[10px]" style={{ color: RARITY_COLOR[ACHIEVEMENT_BY_ID[id].rarity] }}>
                          {ACHIEVEMENT_BY_ID[id].name}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Window>
      <p className="mt-5 text-center font-mono text-[11px] text-paper-faint">Demo scan · simulated timing and synthetic bookmarks. Production progress will come from real API pages.</p>
      <DemoLab />
    </FlowLayout>
  )
}

/** Lit cells are phosphor while retrieving, then take on topic colours in proportion. */
function colourCells(view: ScanView): (string | null)[] {
  const lit = Math.min(CELLS, Math.ceil(view.retrieved / PER_CELL))
  const out: (string | null)[] = Array.from({ length: CELLS }, (_, i) => (i < lit ? 'var(--phosphor)' : null))
  if (!view.topics.length) return out
  const total = view.topics.reduce((s, t) => s + t.count, 0) || 1
  let i = 0
  for (const t of view.topics) {
    const n = Math.round((t.count / total) * lit)
    for (let k = 0; k < n && i < lit; k++) out[i++] = TOPIC_BY_ID[t.topic].color
  }
  while (i < lit) out[i++] = 'var(--topic-other)'
  return out
}

function ScanError({ code, message, retrieved, onRetry, handle }: { code: ScanErrorCode; message: string; retrieved: number; onRetry: () => void; handle: string }) {
  const navigate = useNavigate()
  if (code === 'auth-expired') {
    return (
      <ErrorState
        code="AUTH_EXPIRED"
        title="Your X connection expired"
        body={<>{message} We retrieved {fmt(retrieved)} bookmarks before it stopped. Reconnect to finish the scan — nothing will be counted twice.</>}
        action={<Button variant="primary" icon={<KeyRound size={14} />} onClick={() => navigate('/connect', { state: { handle, reauth: true } })}>Reconnect X</Button>}
      />
    )
  }
  return (
    <ErrorState
      code={code === 'api-error' ? 'X_API_503' : code.toUpperCase()}
      title="The scan hit a problem"
      body={<>{message} We got {fmt(retrieved)} bookmarks before it stopped. This is usually temporary.</>}
      action={
        <>
          <Button variant="primary" icon={<RotateCcw size={14} />} onClick={onRetry}>Retry scan</Button>
          <Button onClick={() => navigate('/')}>Back to start</Button>
        </>
      }
    />
  )
}
