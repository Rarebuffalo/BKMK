import { FastForward, Library, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BadgeDetailModal } from '../components/achievements/BadgeDetailModal'
import { Avatar } from '../components/brand/Avatar'
import { DemoTag } from '../components/brand/Demo'
import { ArchetypeEmblem, DnaStrip, Wordmark } from '../components/brand/Pixel'
import { ArchetypeWhy, CoverageLine, FeaturedBadges, ScoreCard, ScrambleText, TopInterests } from '../components/reveal/ReportParts'
import { Button } from '../components/ui/Button'
import { ARCHETYPES } from '../domain/archetypes'
import { TOPIC_BY_ID } from '../domain/topics'
import { cx } from '../lib/cx'
import { fmt } from '../lib/format'
import { useSession } from '../state/session'

/** Delays (ms) for each reveal beat. Skipping collapses them all to zero. */
const BEATS = [0, 500, 1100, 1900, 2500]

export function RevealPage() {
  const navigate = useNavigate()
  const { state, dispatch } = useSession()
  const result = state.result!
  const [instant, setInstant] = useState(state.revealSeen)
  const [badge, setBadge] = useState<string | null>(null)
  const a = ARCHETYPES[result.archetype.primary]
  const secondary = result.archetype.secondary ? ARCHETYPES[result.archetype.secondary] : null

  useEffect(() => {
    const t = setTimeout(() => dispatch({ type: 'reveal-seen' }), BEATS[BEATS.length - 1] + 600)
    return () => clearTimeout(t)
  }, [dispatch])

  const beat = (i: number) => (instant ? undefined : { animationDelay: `${BEATS[i]}ms` })
  const rise = instant ? '' : 'animate-rise'

  return (
    <div className="min-h-dvh pb-28">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link to="/" aria-label="BKMK.exe home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          {!instant && (
            <Button size="sm" variant="ghost" icon={<FastForward size={13} />} onClick={() => setInstant(true)}>
              Skip
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => navigate('/app')}>
            Dashboard
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Beat 0–2: identity + archetype */}
        <section className="panel-raised relative overflow-hidden shadow-[8px_8px_0_0_#000]">
          <div className="absolute inset-0 -z-0 dotgrid opacity-40" aria-hidden />
          <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_auto]">
            <div>
              <div className={cx('flex flex-wrap items-center gap-3', rise)} style={beat(0)}>
                <Avatar handle={result.handle} size={36} />
                <div className="font-mono text-sm">
                  <div className="text-paper">@{result.handle}</div>
                  <div className="text-xs text-paper-faint">Bookmark DNA · report {result.scannedAt.slice(0, 10)}</div>
                </div>
                {result.isDemo && <DemoTag />}
              </div>

              <div className={cx('mt-8 flex flex-col items-start gap-5 sm:flex-row sm:gap-7', instant ? '' : 'animate-pop')} style={beat(2)}>
                <ArchetypeEmblem id={a.id} size={64} className="sm:hidden" />
                <ArchetypeEmblem id={a.id} size={104} className="hidden sm:grid" />
                <div className="min-w-0">
                  <div className="eyebrow" style={{ color: a.color }}>
                    You are // {a.code}
                  </div>
                  <h1 className="display mt-2 text-[clamp(2.4rem,7vw,4.8rem)] uppercase" style={{ color: a.color }}>
                    <ScrambleText text={a.name} run={!instant} />
                  </h1>
                  <p className="mt-3 max-w-xl text-lg text-paper">{a.description}</p>
                  {secondary && (
                    <p className="mt-2 text-sm text-paper-dim">
                      With a streak of <span style={{ color: secondary.color }}>{secondary.name}</span>.
                    </p>
                  )}
                  <p className="mt-3 font-mono text-sm text-paper-faint italic">“{a.tagline}”</p>
                  <ArchetypeWhy archetype={result.archetype} />
                </div>
              </div>
            </div>

            <div className={cx('grid grid-cols-3 gap-4 self-start border-line lg:grid-cols-1 lg:border-l lg:pl-8', rise)} style={beat(1)}>
              <Stat label="Bookmarks decoded" value={fmt(result.stats.accessible)} accent />
              <Stat label="Topic clusters" value={String(result.stats.topTopics.length)} />
              <Stat label="Threads saved" value={fmt(result.stats.threadCount)} />
            </div>
          </div>

          <div className={cx('relative border-t border-line bg-ink/60 px-5 py-4 sm:px-8', rise)} style={beat(1)}>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow text-paper-faint">Your DNA barcode</span>
              <span className="hidden font-mono text-[11px] text-paper-faint sm:inline">unique to this collection’s topic mix</span>
            </div>
            <DnaStrip stats={result.stats} height={44} animate={!instant} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {result.stats.topTopics.slice(0, 8).map((t) => (
                <span key={t.topic} className="flex items-center gap-1.5 font-mono text-[11px] text-paper-dim">
                  <span className="size-2" style={{ background: TOPIC_BY_ID[t.topic].color }} />
                  {TOPIC_BY_ID[t.topic].short}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Beat 3: score, interests, badges */}
        <section className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div className={rise} style={beat(3)}>
            <ScoreCard score={result.score} className="h-full" />
          </div>
          <div className={rise} style={beat(3)}>
            <TopInterests result={result} limit={5} className="h-full" />
          </div>
          <div className={cx('md:col-span-2 lg:col-span-1', rise)} style={beat(3)}>
            <FeaturedBadges result={result} className="h-full" onSelect={setBadge} />
          </div>
        </section>

        <CoverageLine result={result} className={cx('mt-5', rise)} />
      </main>

      {/* Beat 4: actions — sticky so they're never buried */}
      <div className={cx('fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/90 backdrop-blur', rise)} style={beat(4)}>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="hidden font-mono text-xs text-paper-faint md:inline">Sharing is optional. Your library stays private.</span>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" size="lg" className="px-3 sm:px-6" icon={<Library size={16} />} onClick={() => navigate('/app/library')}>
              <span className="sm:hidden">Explore</span>
              <span className="hidden sm:inline">Explore my bookmarks</span>
            </Button>
            <Button variant="primary" size="lg" className="px-3 sm:px-6" icon={<Share2 size={16} />} onClick={() => navigate('/share')}>
              Share my DNA
            </Button>
          </div>
        </div>
      </div>

      <BadgeDetailModal progress={result.achievements.find((p) => p.id === badge) ?? null} version={result.achievementsVersion} onClose={() => setBadge(null)} />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="eyebrow text-paper-faint">{label}</div>
      <div className={cx('display data mt-1 text-3xl sm:text-4xl', accent ? 'text-phosphor' : 'text-paper')}>{value}</div>
    </div>
  )
}
