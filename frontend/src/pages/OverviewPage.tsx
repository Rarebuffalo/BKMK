import { ArrowRight, Dna, RefreshCw, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeDetailModal } from '../components/achievements/BadgeDetailModal'
import { ArchetypeEmblem, DnaStrip } from '../components/brand/Pixel'
import { PageHeader } from '../components/dashboard/PageHeader'
import { CoverageLine, FeaturedBadges, ScoreCard, TopInterests } from '../components/reveal/ReportParts'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/primitives'
import { ARCHETYPES } from '../domain/archetypes'
import { CONTENT_TYPES, TOPIC_BY_ID } from '../domain/topics'
import { fmt, formatDate, pct } from '../lib/format'
import { useAccountActions } from '../state/actions'
import { useResult } from '../state/session'

// Monochrome ramp for content types so they don't compete with topic colours.
const TYPE_SHADES = ['var(--paper)', 'var(--paper-dim)', 'var(--phosphor)', 'var(--phosphor-dim)', 'var(--signal)', 'var(--paper-faint)', 'var(--line-strong)']

export function OverviewPage() {
  const result = useResult()!
  const actions = useAccountActions()
  const { stats } = result
  const a = ARCHETYPES[result.archetype.primary]
  const [badge, setBadge] = useState<string | null>(null)
  const recent = result.recent ?? result.bookmarks.filter((b) => b.accessible).slice(0, 5)
  const types = CONTENT_TYPES.map((c, i) => ({ ...c, n: stats.contentTypeCounts[c.id], color: TYPE_SHADES[i] })).filter((c) => c.n > 0)

  return (
    <>
      <PageHeader
        eyebrow="ARCHIVE OVERVIEW"
        title={<>@{result.handle}<span className="text-paper-faint">’s archive</span></>}
        action={
          <>
            <Button size="sm" icon={<RefreshCw size={13} />} onClick={() => actions.rescan(result.handle)}>
              Rescan
            </Button>
            <ButtonLink to="/share" size="sm" variant="primary" icon={<Share2 size={13} />}>
              Share my DNA
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Archetype */}
        <Card className="relative overflow-hidden p-5 md:col-span-2 xl:col-span-5">
          <div className="flex items-start gap-4">
            <ArchetypeEmblem id={a.id} size={72} />
            <div className="min-w-0">
              <div className="eyebrow" style={{ color: a.color }}>{a.code}</div>
              <h2 className="display mt-1 text-2xl uppercase" style={{ color: a.color }}>{a.name}</h2>
              <p className="mt-2 text-sm text-paper-dim">{a.description}</p>
            </div>
          </div>
          <DnaStrip stats={stats} height={22} className="mt-5" />
          <Link to="/reveal" className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-paper-dim hover:text-phosphor">
            <Dna size={13} /> View full DNA report <ArrowRight size={12} />
          </Link>
        </Card>

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 xl:col-span-3 xl:grid-cols-1">
          <StatTile label="Bookmarks" value={fmt(stats.accessible)} sub={stats.inaccessible ? `${stats.inaccessible} unavailable skipped` : 'none unavailable'} accent />
          <StatTile label="Topic clusters" value={String(stats.topTopics.length)} sub={`${pct(stats.classified / (stats.accessible || 1))} classified`} />
          <StatTile label="Threads" value={fmt(stats.threadCount)} sub={`${fmt(stats.authorCount)} authors`} className="xl:hidden" />
        </div>

        <ScoreCard score={result.score} className="xl:col-span-4" />

        <TopInterests result={result} limit={8} className="xl:col-span-5" />

        {/* Content types */}
        <Card className="p-5 xl:col-span-3">
          <CardHeader eyebrow="Resource types" />
          <div className="mt-4 flex h-3 overflow-hidden" role="img" aria-label={types.map((t) => `${t.plural} ${t.n}`).join(', ')}>
            {types.map((t) => (
              <span key={t.id} style={{ width: pct(t.n / stats.accessible), background: t.color }} />
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {types.sort((x, y) => y.n - x.n).map((t) => (
              <li key={t.id}>
                <Link to={`/app/library?type=${t.id}`} className="flex items-center justify-between font-mono text-xs text-paper-dim hover:text-paper">
                  <span className="flex items-center gap-2">
                    <span className="size-2" style={{ background: t.color }} />
                    {t.plural}
                  </span>
                  <span>
                    {fmt(t.n)} <span className="text-paper-faint">· {pct(t.n / stats.accessible)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <FeaturedBadges result={result} className="xl:col-span-4" onSelect={setBadge} />

        {/* Recent bookmarks */}
        <Card className="p-5 md:col-span-2 xl:col-span-8">
          <CardHeader eyebrow="Most recent saves" action={<Link to="/app/library" className="font-mono text-xs text-paper-dim hover:text-phosphor">Open library →</Link>} />
          <ul className="mt-3 divide-y divide-line">
            {recent.map((b) => (
              <li key={b.id} className="flex items-start gap-3 py-3">
                <span className="mt-1.5 size-2 shrink-0" style={{ background: TOPIC_BY_ID[b.topic].color }} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">{b.text}</p>
                  <div className="mt-1 font-mono text-[11px] text-paper-faint">
                    {b.author.handle ? `@${b.author.handle}` : b.author.name} · {formatDate(b.createdAt)} · {TOPIC_BY_ID[b.topic].short}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Scan status */}
        <Card className="p-5 xl:col-span-4">
          <CardHeader eyebrow="Last scan" />
          <CoverageLine result={result} className="mt-3" />
          <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
            <div>
              <dt className="text-paper-faint">Oldest post</dt>
              <dd className="mt-0.5">{stats.oldest ? formatDate(stats.oldest) : '—'}</dd>
            </div>
            <div>
              <dt className="text-paper-faint">Newest post</dt>
              <dd className="mt-0.5">{stats.newest ? formatDate(stats.newest) : '—'}</dd>
            </div>
            <div>
              <dt className="text-paper-faint">Rules</dt>
              <dd className="mt-0.5">{result.score.version}</dd>
            </div>
            <div>
              <dt className="text-paper-faint">Badges</dt>
              <dd className="mt-0.5 truncate">{result.achievementsVersion.replace('achievements-', '')}</dd>
            </div>
          </dl>
        </Card>
      </div>
      <BadgeDetailModal progress={result.achievements.find((p) => p.id === badge) ?? null} version={result.achievementsVersion} onClose={() => setBadge(null)} />
    </>
  )
}

function StatTile({ label, value, sub, accent, className }: { label: string; value: string; sub?: string; accent?: boolean; className?: string }) {
  return (
    <Card className={`p-4 sm:p-5 ${className ?? ''}`}>
      <div className="eyebrow text-paper-faint">{label}</div>
      <div className={`display data mt-2 text-2xl sm:text-4xl ${accent ? 'text-phosphor' : 'text-paper'}`}>{value}</div>
      {sub && <div className="mt-1 font-mono text-[11px] text-paper-faint">{sub}</div>}
    </Card>
  )
}
