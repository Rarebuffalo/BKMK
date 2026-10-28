import { ArrowLeft, Ban, Check, KeyRound, RotateCcw, X as XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/brand/Avatar'
import { DemoLab, DemoTag } from '../components/brand/Demo'
import { FlowLayout, Window } from '../components/scan/Window'
import { Button, Spinner } from '../components/ui/Button'
import { ErrorState } from '../components/ui/primitives'
import { validateHandle } from '../lib/handle'
import { cx } from '../lib/cx'
import { authService, identityService, type AccountIdentity, type AuthOutcome } from '../services'
import { useSession } from '../state/session'

type Stage = 'lookup' | 'confirm' | 'authorize' | 'authorizing' | 'denied' | 'cancelled'

export function ConnectPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, dispatch } = useSession()
  const fromNav = (location.state as { handle?: string; reauth?: boolean } | null) ?? {}
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
                    In production this step opens X’s authorization page. Demo mode simulates the response.
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

function AccountCard({ identity }: { identity: AccountIdentity }) {
  return (
    <div className="mt-5 flex items-center gap-4 rounded-sm border border-line bg-ink p-4">
      <Avatar handle={identity.handle} size={56} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold capitalize">{identity.displayName}</div>
        <div className="truncate font-mono text-sm text-paper-dim">@{identity.handle}</div>
        {identity.isDemo && <div className="mt-1.5 text-xs text-amber">Demo identity — not looked up on X. Avatar is generated.</div>}
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
