import { ArrowLeft, Ban, Check, KeyRound, RotateCcw, X as XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, startOAuthUrl } from '../api/endpoints'
import { Avatar } from '../components/brand/Avatar'
import { DemoLab, DemoTag, LiveTag } from '../components/brand/Demo'
import { XImportStatus } from '../components/landing/XImportStatus'
import { FlowLayout, Window } from '../components/scan/Window'
import { Button, Spinner } from '../components/ui/Button'
import { ErrorState } from '../components/ui/primitives'
import { validateHandle } from '../lib/handle'
import { cx } from '../lib/cx'
import { authService, identityService, type AccountIdentity, type AuthOutcome } from '../services'
import { useLive } from '../state/live'
import { useSession, type AppMode } from '../state/session'

type Stage = 'lookup' | 'confirm' | 'authorize' | 'authorizing' | 'denied' | 'cancelled'
type NavState = { handle?: string; reauth?: boolean; mode?: AppMode }

/** Live sign-in when the server has X configured and the visitor chose it; otherwise the demo flow. */
export function ConnectPage() {
  const location = useLocation()
  const [params] = useSearchParams()
  const { state } = useSession()
  const fromNav = (location.state as NavState | null) ?? {}
  const returning = params.has('auth')
  const mode: AppMode = returning ? 'live' : (fromNav.mode ?? state.mode)
  return mode === 'live' ? <LiveConnect /> : <DemoConnect />
}

function DemoConnect() {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, dispatch } = useSession()
  const fromNav = (location.state as NavState | null) ?? {}
  const requested = fromNav.handle ?? state.identity?.handle
  const valid = requested ? validateHandle(requested) : { ok: null }
  const handle = valid.ok ? valid.handle : null

  const [stage, setStage] = useState<Stage>(fromNav.reauth && state.identity ? 'authorize' : 'lookup')
  const [identity, setIdentity] = useState<AccountIdentity | null>(fromNav.reauth ? state.identity : null)
  const [simulate, setSimulate] = useState<AuthOutcome>('granted')

  useEffect(() => {
    if (!handle || stage !== 'lookup') return
    let alive = true
    identityService.lookup(handle).then((id) => {
      if (!alive) return
      setIdentity(id)
      setStage('confirm')
    })
    return () => {
      alive = false
    }
  }, [handle, stage])

  if (!handle) return <Navigate to="/" replace />

  async function authorize() {
    if (!identity) return
    setStage('authorizing')
    const outcome = await authService.authorize(identity, state.demo.scenario, simulate)
    if (outcome === 'granted') {
      dispatch({ type: 'mode', mode: 'demo' })
      dispatch({ type: 'identify', identity })
      dispatch({ type: 'authorize' })
      navigate('/scan', { replace: true })
    } else {
      setStage(outcome)
      setSimulate('granted')
    }
  }

  return (
    <FlowLayout step={stage === 'lookup' || stage === 'confirm' ? 1 : 2}>
      <div className="mx-auto w-full max-w-xl">
        <Window title={stage === 'lookup' || stage === 'confirm' ? 'identify account' : 'authorize access'} status={<DemoTag />}>
          <div className="p-5 sm:p-7">
            {stage === 'lookup' && (
              <div className="flex items-center gap-3 py-8 font-mono text-sm text-paper-dim" role="status">
                <Spinner className="text-phosphor" /> resolving @{handle}…
              </div>
            )}

            {stage === 'confirm' && identity && (
              <div className="animate-rise">
                <h1 className="text-2xl font-bold">Is this you?</h1>
                <p className="mt-1 text-sm text-paper-dim">Bookmarks are private, so only the account owner can scan them.</p>
                <AccountCard identity={identity} />
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate('/')}>
                    Change handle
                  </Button>
                  <Button variant="primary" icon={<Check size={14} />} onClick={() => setStage('authorize')}>
                    Yes, that’s me
                  </Button>
                </div>
              </div>
            )}

            {(stage === 'authorize' || stage === 'authorizing') && identity && (
              <div className="animate-rise">
                <h1 className="text-2xl font-bold">{fromNav.reauth ? 'Reconnect to X' : 'Connect X and scan'}</h1>
                <p className="mt-1 text-sm text-paper-dim">
                  {fromNav.reauth ? 'Your authorization expired. Approve access again to continue scanning.' : 'You’ll approve access on X’s own page, then come straight back here.'}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <PermissionList title="BKMK.exe will be able to" tone="ok" items={['Read your bookmarks', 'Read your public profile', 'Stay connected until you disconnect']} />
                  <PermissionList title="It will never" tone="no" items={['See your password', 'Post, like or follow', 'Read your DMs']} />
                </div>

                <fieldset className="mt-5 rounded-sm border border-dashed border-amber/40 p-3">
                  <legend className="px-1 font-pixel text-[10px] text-amber">DEMO · SIMULATE X’S RESPONSE</legend>
                  <div className="flex flex-wrap gap-2">
                    {(['granted', 'denied', 'cancelled'] as AuthOutcome[]).map((o) => (
                      <label key={o} className={cx('flex cursor-pointer items-center gap-2 rounded-xs border px-2.5 py-1.5 font-mono text-xs', simulate === o ? 'border-amber text-amber' : 'border-line text-paper-dim')}>
                        <input type="radio" name="sim" className="sr-only" checked={simulate === o} onChange={() => setSimulate(o)} />
                        {o === 'granted' ? 'Approve' : o === 'denied' ? 'Fail' : 'Cancel'}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => setStage('confirm')} disabled={stage === 'authorizing'}>
                    Back
                  </Button>
                  <Button variant="primary" icon={<KeyRound size={14} />} loading={stage === 'authorizing'} onClick={authorize}>
                    {stage === 'authorizing' ? 'Waiting for X…' : 'Connect X & scan'}
                  </Button>
                </div>
                {stage === 'authorizing' && (
                  <p className="mt-4 font-mono text-xs text-paper-faint" role="status">
                    Demo mode simulates X’s response. Real X import isn’t enabled yet.
                  </p>
                )}
              </div>
            )}

            {stage === 'denied' && (
              <ErrorState
                code="AUTH_FAILED"
                title="X didn’t grant access"
                body="The authorization didn’t complete. This can happen if the app was blocked or X had a hiccup. Nothing was saved."
                action={
                  <>
                    <Button variant="primary" icon={<RotateCcw size={14} />} onClick={() => setStage('authorize')}>Try again</Button>
                    <Button onClick={() => navigate('/')}>Back to start</Button>
                  </>
                }
              />
            )}

            {stage === 'cancelled' && (
              <div className="animate-rise py-2">
                <div className="eyebrow text-paper-faint">AUTHORIZATION CANCELLED</div>
                <h1 className="mt-2 text-2xl font-bold">No problem — nothing was shared.</h1>
                <p className="mt-2 text-sm text-paper-dim">You cancelled on X, so BKMK.exe has no access to your account. You can try again whenever you like.</p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" onClick={() => navigate('/')}>Back to start</Button>
                  <Button variant="primary" icon={<KeyRound size={14} />} onClick={() => setStage('authorize')}>Connect X</Button>
                </div>
              </div>
            )}
          </div>
        </Window>
      </div>
      <DemoLab />
    </FlowLayout>
  )
}

const FAILURE_COPY: Record<string, string> = {
  daily_budget: 'Today’s live scans are used up, so X wasn’t contacted. Try again after midnight UTC, or try the demo.',
  state_mismatch: 'The sign-in link expired or was opened in a different browser. Start again from this page.',
  exchange_failed: 'X didn’t accept the sign-in. Try again in a moment.',
  provider_error: 'X reported an error during sign-in. Nothing was saved.',
  invalid_handle: 'That handle isn’t valid. Check it and try again.',
  x_payment_required: 'X refused the sign-in because BKMK.exe’s X API credit has run out. This is on our side, not your account. You can still try the demo.',
  x_access_restricted: 'X says this app’s API access doesn’t include what sign-in needs. This is on our side, not your account. You can still try the demo.',
  not_invited: 'BKMK.exe is in a private beta and this X account isn’t on the list yet. Access was handed back to X and nothing was saved. You can still try the demo.',
}

function LiveConnect() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { state, dispatch } = useSession()
  const live = useLive()
  const fromNav = (location.state as NavState | null) ?? {}
  const auth = params.get('auth')
  const reason = params.get('reason') ?? ''
  const requested = params.get('requested')
  const typed = fromNav.handle ?? state.identity?.handle ?? null
  const valid = typed ? validateHandle(typed) : { ok: null }
  const handle = valid.ok ? valid.handle : null
  const initial = auth === 'cancelled' ? 'cancelled' : auth === 'failed' ? 'denied' : auth === 'success' && requested ? 'mismatch' : fromNav.reauth ? 'authorize' : 'confirm'
  const [stage, setStage] = useState<'confirm' | 'authorize' | 'redirecting' | 'denied' | 'cancelled' | 'mismatch'>(initial)
  const actual = live.me?.user?.handle

  if (!handle && !auth && !fromNav.reauth) return <Navigate to="/" replace />

  const connect = (h: string | null) => {
    dispatch({ type: 'mode', mode: 'live' })
    setStage('redirecting')
    window.location.assign(startOAuthUrl(h))
  }
  const useDifferentAccount = async () => {
    try {
      await api.logout()
    } catch {
      // Session may already be gone; the local reset below is what matters.
    }
    live.clear()
    setStage('authorize')
  }

  return (
    <FlowLayout step={stage === 'confirm' ? 1 : 2}>
      <div className="mx-auto w-full max-w-xl">
        <Window
          title={stage === 'confirm' ? 'identify account' : reason === 'not_configured' ? 'connect with x' : 'authorize access'}
          status={reason === 'not_configured' ? undefined : <LiveTag />}
        >
          <div className="p-5 sm:p-7">
            {stage === 'confirm' && handle && (
              <div className="animate-rise">
                <h1 className="text-2xl font-bold">Scan @{handle}’s bookmarks?</h1>
                <p className="mt-1 text-sm text-paper-dim">Bookmarks are private, so you’ll sign in to X as this account. X tells us who you are; your handle alone proves nothing.</p>
                <AccountCard identity={{ handle, displayName: handle, isDemo: false }} />
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate('/')}>
                    Change handle
                  </Button>
                  <Button variant="primary" icon={<Check size={14} />} onClick={() => setStage('authorize')}>
                    That’s me
                  </Button>
                </div>
              </div>
            )}

            {(stage === 'authorize' || stage === 'redirecting') && (
              <div className="animate-rise">
                <h1 className="text-2xl font-bold">{fromNav.reauth ? 'Reconnect to X' : 'Connect X and scan'}</h1>
                <p className="mt-1 text-sm text-paper-dim">
                  {fromNav.reauth
                    ? 'Your authorization expired. Approve access again to continue.'
                    : `You’ll approve read-only access on X’s own page, then come straight back here. BKMK.exe reads your ${live.me?.scanLimit ?? 30} most recent bookmarks.`}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <PermissionList title="BKMK.exe will be able to" tone="ok" items={['Read your bookmarks', 'Read your public profile', 'Stay connected until you disconnect']} />
                  <PermissionList title="It will never" tone="no" items={['See your password', 'Post, like or follow', 'Read your DMs']} />
                </div>
                {live.me?.apiMode === 'fixture' && (
                  <p className="mt-4 rounded-sm border border-dashed border-amber/40 p-3 font-mono text-xs text-amber">Test server: X is replaced by recorded fixture responses. No real account is used.</p>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => (handle ? setStage('confirm') : navigate('/'))} disabled={stage === 'redirecting'}>
                    Back
                  </Button>
                  <Button variant="primary" icon={<KeyRound size={14} />} loading={stage === 'redirecting'} onClick={() => connect(handle ?? actual ?? null)}>
                    {stage === 'redirecting' ? 'Opening X…' : 'Connect X & scan'}
                  </Button>
                </div>
              </div>
            )}

            {stage === 'denied' && reason === 'not_configured' && <XImportStatus heading="h1" className="border-0 bg-transparent p-0" />}

            {stage === 'denied' && reason !== 'not_configured' && (
              <ErrorState
                code={`AUTH_${(reason || 'failed').toUpperCase()}`}
                title="Sign-in didn’t complete"
                body={FAILURE_COPY[reason] ?? 'The authorization didn’t complete. Nothing was saved.'}
                action={
                  <>
                    <Button variant="primary" icon={<RotateCcw size={14} />} onClick={() => (handle ? setStage('authorize') : navigate('/'))}>
                      Try again
                    </Button>
                    <Button onClick={() => navigate('/connect', { state: { handle: handle ?? 'demo', mode: 'demo' } })}>Try the demo</Button>
                  </>
                }
              />
            )}

            {stage === 'cancelled' && (
              <div className="animate-rise py-2">
                <div className="eyebrow text-paper-faint">AUTHORIZATION CANCELLED</div>
                <h1 className="mt-2 text-2xl font-bold">No problem — nothing was shared.</h1>
                <p className="mt-2 text-sm text-paper-dim">You cancelled on X, so BKMK.exe has no access to your account. You can try again whenever you like.</p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" onClick={() => navigate('/')}>Back to start</Button>
                  <Button variant="primary" icon={<KeyRound size={14} />} onClick={() => (handle ? setStage('authorize') : navigate('/'))}>Connect X</Button>
                </div>
              </div>
            )}

            {stage === 'mismatch' && (
              <div className="animate-rise py-2">
                <div className="eyebrow text-amber">ACCOUNT CHECK</div>
                <h1 className="mt-2 text-2xl font-bold">You signed in as @{actual ?? '…'}</h1>
                <p className="mt-2 text-sm text-paper-dim">
                  You typed @{requested}. BKMK.exe can only read bookmarks for the account you sign in with, so the scan will use @{actual ?? 'that account'}.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" onClick={useDifferentAccount}>Use a different account</Button>
                  <Button variant="primary" icon={<Check size={14} />} onClick={() => navigate('/scan', { replace: true })} disabled={!actual}>
                    Continue as @{actual ?? '…'}
                  </Button>
                </div>
                <p className="mt-4 text-xs text-paper-faint">To switch accounts, sign out of X in this browser first, then connect again.</p>
              </div>
            )}
          </div>
        </Window>
      </div>
    </FlowLayout>
  )
}

function AccountCard({ identity }: { identity: AccountIdentity }) {
  return (
    <div className="mt-5 flex items-center gap-4 rounded-sm border border-line bg-ink p-4">
      <Avatar handle={identity.handle} size={56} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold capitalize">{identity.displayName}</div>
        <div className="truncate font-mono text-sm text-paper-dim">@{identity.handle}</div>
        {identity.isDemo ? (
          <div className="mt-1.5 text-xs text-amber">Demo identity — not looked up on X. Avatar is generated.</div>
        ) : (
          <div className="mt-1.5 text-xs text-paper-faint">Not looked up yet — X confirms the account when you sign in.</div>
        )}
      </div>
    </div>
  )
}

function PermissionList({ title, items, tone }: { title: string; items: string[]; tone: 'ok' | 'no' }) {
  return (
    <div className="rounded-sm border border-line bg-ink p-4">
      <div className="eyebrow text-paper-faint">{title}</div>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            {tone === 'ok' ? <Check size={15} className="mt-0.5 shrink-0 text-phosphor" /> : i.startsWith('See') ? <Ban size={15} className="mt-0.5 shrink-0 text-paper-faint" /> : <XIcon size={15} className="mt-0.5 shrink-0 text-paper-faint" />}
            <span className={tone === 'ok' ? 'text-paper' : 'text-paper-dim'}>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
