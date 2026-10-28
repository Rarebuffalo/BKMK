import { Award, Dna, FolderTree, LayoutGrid, Library, LogOut, Menu, RefreshCw, Settings, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ACHIEVEMENTS } from '../../domain/achievements'
import { ARCHETYPES } from '../../domain/archetypes'
import { cx } from '../../lib/cx'
import { relativeTime } from '../../lib/format'
import { useSession } from '../../state/session'
import { Avatar } from '../brand/Avatar'
import { DemoBanner, DemoTag } from '../brand/Demo'
import { Wordmark } from '../brand/Pixel'
import { Button } from '../ui/Button'
import { ConfirmDialog, Modal } from '../ui/Modal'

const NAV = [
  { to: '/app', label: 'Overview', short: 'Home', icon: LayoutGrid, end: true },
  { to: '/app/topics', label: 'Explore topics', short: 'Topics', icon: FolderTree },
  { to: '/app/library', label: 'All bookmarks', short: 'Library', icon: Library },
  { to: '/app/achievements', label: 'Achievements', short: 'Badges', icon: Award },
]

export function AppShell() {
  const { state, dispatch } = useSession()
  const navigate = useNavigate()
  const result = state.result!
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const earned = result.achievements.filter((a) => a.earned).length

  const rescan = () => navigate(state.authorized ? '/scan' : '/connect', { state: { handle: result.handle, reauth: !state.authorized } })
  const disconnect = () => {
    dispatch({ type: 'disconnect' })
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-dvh">
      {result.isDemo && <DemoBanner />}
      <div className="mx-auto flex max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-5 lg:flex">
          <Link to="/" aria-label="BKMK.exe home" className="px-2">
            <Wordmark />
          </Link>
          <AccountBox />
          <nav className="mt-6 flex flex-col gap-0.5" aria-label="Dashboard">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'group flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm transition-colors',
                    isActive ? 'bg-ink-3 text-paper shadow-[inset_2px_0_0_var(--phosphor)]' : 'text-paper-dim hover:bg-ink-2 hover:text-paper',
                  )
                }
              >
                <n.icon size={16} />
                {n.label}
                {n.to === '/app/achievements' && <span className="ml-auto font-mono text-[11px] text-paper-faint">{earned}/{ACHIEVEMENTS.length}</span>}
              </NavLink>
            ))}
            <NavLink to="/reveal" className="flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm text-paper-dim hover:bg-ink-2 hover:text-paper">
              <Dna size={16} /> DNA report
            </NavLink>
          </nav>
          <div className="mt-auto space-y-2">
            <Button variant="primary" className="w-full" icon={<Share2 size={14} />} onClick={() => navigate('/share')}>
              Share my DNA
            </Button>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" icon={<RefreshCw size={13} />} onClick={rescan}>
                Rescan
              </Button>
              <NavLink to="/app/settings" aria-label="Settings" className={({ isActive }) => cx('grid h-8 w-10 place-items-center rounded-sm border', isActive ? 'border-paper text-paper' : 'border-line-strong text-paper-dim hover:text-paper')}>
                <Settings size={14} />
              </NavLink>
            </div>
            <p className="px-1 font-mono text-[10px] text-paper-faint">Last scan {relativeTime(result.scannedAt)}</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur lg:hidden">
            <Link to="/" aria-label="BKMK.exe home">
              <Wordmark size="sm" />
            </Link>
            <button type="button" onClick={() => setMenuOpen(true)} className="flex items-center gap-2 rounded-sm border border-line px-2 py-1" aria-label="Account menu">
              <Avatar handle={result.handle} size={22} className="border-0" />
              <Menu size={16} className="text-paper-dim" />
            </button>
          </header>

          <main className="px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-ink/95 backdrop-blur lg:hidden" aria-label="Dashboard">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2.5 font-mono text-[10px]', isActive ? 'text-phosphor' : 'text-paper-faint')}>
            <n.icon size={18} />
            {n.short}
          </NavLink>
        ))}
        <NavLink to="/share" className="flex flex-col items-center gap-1 py-2.5 font-mono text-[10px] text-paper-faint">
          <Share2 size={18} />
          Share
        </NavLink>
      </nav>

      {/* Mobile account sheet */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={`@${result.handle}`} eyebrow="ACCOUNT" size="sm">
        <div className="space-y-2" onClick={(e) => (e.target as HTMLElement).closest('a,button') && setMenuOpen(false)}>
          <p className="font-mono text-xs text-paper-faint">Last scan {relativeTime(result.scannedAt)} · {result.coverage}</p>
          <Button className="w-full justify-start" icon={<Dna size={14} />} onClick={() => navigate('/reveal')}>DNA report</Button>
          <Button className="w-full justify-start" icon={<RefreshCw size={14} />} onClick={rescan}>Rescan bookmarks</Button>
          <Button className="w-full justify-start" icon={<Settings size={14} />} onClick={() => navigate('/app/settings')}>Settings & privacy</Button>
          <Button variant="ghost" className="w-full justify-start text-danger" icon={<LogOut size={14} />} onClick={() => setConfirmDisconnect(true)}>Disconnect</Button>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={disconnect}
        danger
        title="Disconnect your X account?"
        confirmLabel="Disconnect"
        body="This revokes BKMK.exe’s access and deletes your scanned bookmarks, scores and badges. You can scan again any time."
      />
    </div>
  )
}

function AccountBox() {
  const result = useSession().state.result!
  const a = ARCHETYPES[result.archetype.primary]
  return (
    <div className="mt-6 rounded-sm border border-line bg-ink-2 p-3">
      <div className="flex items-center gap-3">
        <Avatar handle={result.handle} size={36} />
        <div className="min-w-0">
          <div className="truncate font-mono text-sm">@{result.handle}</div>
          <div className="truncate text-xs" style={{ color: a.color }}>{a.name}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-paper-faint">
        <span className="flex items-center gap-1.5">
          <span className={cx('size-1.5', result.coverage === 'complete' ? 'bg-phosphor' : 'bg-amber')} />
          {result.isDemo ? 'Demo session' : 'Connected'}
        </span>
        {result.isDemo && <DemoTag />}
      </div>
    </div>
  )
}
