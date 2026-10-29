import { ChevronRight, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, featuredAchievements, progressLabel } from '../../domain/achievements'
import { ARCHETYPES } from '../../domain/archetypes'
import { CLASSIFIER_VERSION } from '../../domain/classifier'
import { TOPIC_BY_ID } from '../../domain/topics'
import type { ArchetypeResult, CurationScore, ScanResult } from '../../domain/types'
import { cx } from '../../lib/cx'
import { fmt, pct, relativeTime } from '../../lib/format'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { BlockProgress, Card, CardHeader } from '../ui/primitives'
import { AchievementBadge, RARITY_COLOR, RARITY_LABEL } from '../brand/Pixel'

/** Characters resolve left-to-right from noise — the archetype "decrypt". */
export function ScrambleText({ text, run = true, className }: { text: string; run?: boolean; className?: string }) {
  const animate = run && !matchMedia('(prefers-reduced-motion: reduce)').matches
  const [out, setOut] = useState('')
  useEffect(() => {
    if (!animate) return
    const glyphs = '#%&*+=?@ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
    let frame = 0
    const id = setInterval(() => {
      frame++
      const solved = Math.floor(frame / 2)
      setOut(
        [...text]
          .map((ch, i) => (i < solved || ch === ' ' ? ch : glyphs[(i * 7 + frame * 3) % glyphs.length]))
          .join(''),
      )
      if (solved >= text.length) clearInterval(id)
    }, 34)
    return () => clearInterval(id)
  }, [text, animate])
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{(animate ? out : text) || '\u00a0'}</span>
    </span>
  )
}

export function ScoreCard({ score, className }: { score: CurationScore; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className={cx('p-5', className)}>
      <CardHeader
        eyebrow="Curation score"
        action={
          <Button size="sm" variant="ghost" icon={<Info size={13} />} onClick={() => setOpen(true)} className="-mt-1 -mr-2">
            How it’s scored
          </Button>
        }
      />
      <div className="mt-2 flex items-baseline gap-1">
        <span className="display data text-6xl text-phosphor">{score.total}</span>
        <span className="font-mono text-lg text-paper-faint">/100</span>
      </div>
      <div className="mt-4 space-y-3">
        {score.dimensions.map((d) => (
          <div key={d.id}>
            <div className="mb-1 flex justify-between font-mono text-xs">
              <span className="text-paper-dim">{d.label}</span>
              <span className="text-paper">{d.value}/25</span>
            </div>
            <BlockProgress value={d.value} max={25} segments={25} label={d.label} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-paper-faint">Describes your collection, not you. {score.version}.</p>
      <Modal open={open} onClose={() => setOpen(false)} title="How the Curation Score works" eyebrow={`METHODOLOGY · ${score.version}`}>
        <p className="text-sm text-paper-dim">
          Four equally weighted dimensions, each 0–25. The score uses proportions, so a bigger pile doesn’t automatically score higher, and posts that were deleted or made private are left out rather than counted against you.
        </p>
        <div className="mt-5 space-y-4">
          {score.dimensions.map((d) => (
            <div key={d.id} className="rounded-sm border border-line p-3">
              <div className="flex justify-between font-semibold">
                <span>{d.label}</span>
                <span className="data text-phosphor">{d.value}/25</span>
              </div>
              <p className="mt-1 text-sm text-paper-dim">{d.explanation}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-paper-faint">
          Rules are versioned ({score.version}, {CLASSIFIER_VERSION}) and will be tuned on real collections before launch. We don’t publish percentiles until there’s representative data to back them.
        </p>
      </Modal>
    </Card>
  )
}

export function TopInterests({ result, limit = 6, className }: { result: ScanResult; limit?: number; className?: string }) {
  const top = result.stats.topTopics.slice(0, limit)
  return (
    <Card className={cx('p-5', className)}>
      <CardHeader eyebrow="Top interests" action={<span className="font-mono text-xs text-paper-faint">{result.stats.topTopics.length} clusters</span>} />
      <ul className="mt-4 space-y-3">
        {top.map((t, i) => (
          <li key={t.topic}>
            <Link to={`/app/topics/${t.topic}`} className="group block">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-4 font-mono text-xs text-paper-faint">{i + 1}</span>
                  <span className="group-hover:text-phosphor">{TOPIC_BY_ID[t.topic].label}</span>
                </span>
                <span className="data text-xs text-paper-dim">
                  {fmt(t.count)} · {pct(t.share)}
                </span>
              </div>
              <div className="ml-6 h-1.5 bg-ink-4">
                <div className="h-full transition-[width] duration-700" style={{ width: pct(t.share / (top[0]?.share || 1)), background: TOPIC_BY_ID[t.topic].color }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function FeaturedBadges({ result, className, onSelect }: { result: ScanResult; className?: string; onSelect?: (id: string) => void }) {
  const featured = featuredAchievements(result.achievements)
  const earned = result.achievements.filter((a) => a.earned).length
  // "Almost there": the locked badge closest to unlocking — gives a next step.
  const next = result.achievements
    .filter((a) => !a.earned)
    .sort((a, b) => b.current / b.target - a.current / a.target)[0]
  return (
    <Card className={cx('p-5', className)}>
      <CardHeader eyebrow="Achievements" action={<span className="font-mono text-xs text-paper-faint">{earned}/{ACHIEVEMENTS.length} unlocked</span>} />
      <div className="mt-4 grid grid-cols-3 gap-3">
        {featured.map((p, i) => {
          const def = ACHIEVEMENT_BY_ID[p.id]
          return (
            <button key={p.id} type="button" onClick={() => onSelect?.(p.id)} className="group flex flex-col items-center gap-2 rounded-sm p-1 text-center" style={{ animationDelay: `${i * 120}ms` }}>
              <AchievementBadge id={p.id} size={64} className="transition-transform group-hover:-translate-y-0.5" />
              <span className="font-pixel text-[10px] leading-tight text-paper">{def.name}</span>
              <span className="font-mono text-[10px]" style={{ color: RARITY_COLOR[def.rarity] }}>{RARITY_LABEL[def.rarity]}</span>
            </button>
          )
        })}
      </div>
      {next && (
        <div className="mt-4 rounded-sm border border-dashed border-line-strong p-3">
          <div className="flex items-center gap-3">
            <AchievementBadge id={next.id} earned={false} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-xs">
                <span className="font-medium">Almost: {ACHIEVEMENT_BY_ID[next.id].name}</span>
                <span className="data text-paper-faint">{progressLabel(next)}</span>
              </div>
              <BlockProgress value={next.current} max={next.target} segments={16} className="mt-1.5" color="var(--paper-dim)" label={`${ACHIEVEMENT_BY_ID[next.id].name} progress`} />
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export function ArchetypeWhy({ archetype }: { archetype: ArchetypeResult }) {
  const entries = Object.entries(archetype.signals).sort((a, b) => b[1] - a[1])
  return (
    <details className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-xs text-paper-dim hover:text-paper">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" /> Why this archetype?
      </summary>
      <div className="mt-3 space-y-2">
        {entries.map(([id, v]) => {
          const a = ARCHETYPES[id as keyof typeof ARCHETYPES]
          return (
            <div key={id} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 font-mono text-[11px]">
              <span className={id === archetype.primary ? 'text-paper' : 'text-paper-faint'}>{a.name.replace('The ', '')}</span>
              <span className="h-1.5 bg-ink-4">
                <span className="block h-full" style={{ width: pct(v), background: a.color }} />
              </span>
              <span className="text-right text-paper-faint">{Math.round(v * 100)}</span>
            </div>
          )
        })}
        <p className="pt-1 text-[11px] text-paper-faint">
          Rule for {ARCHETYPES[archetype.primary].name}: {ARCHETYPES[archetype.primary].rule} Signals below 35 fall back to The Collector. {archetype.version}.
        </p>
      </div>
    </details>
  )
}

export function CoverageLine({ result, className }: { result: ScanResult; className?: string }) {
  const s = result.stats
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-paper-faint">
        <span className={cx('flex items-center gap-1.5', result.coverage === 'complete' ? 'text-phosphor' : 'text-amber')}>
          <span className="size-1.5 bg-current" />
          {result.source === 'import'
            ? result.coverage === 'complete'
              ? 'Import analysed'
              : 'Import · newest only'
            : result.coverage === 'complete'
              ? 'Scan complete'
              : 'Partial scan'}
        </span>
        <span>{fmt(s.accessible)} readable</span>
        {s.inaccessible > 0 && <span>{fmt(s.inaccessible)} deleted/protected skipped</span>}
        <span>
          {result.source === 'import' ? 'analysed' : 'scanned'} {relativeTime(result.scannedAt)}
        </span>
      </div>
      {result.coverageNote && (
        <div className="flex gap-2 rounded-sm border border-amber/40 bg-amber/5 p-2.5 text-xs text-amber">
          <TriangleAlert size={14} className="mt-px shrink-0" />
          {result.coverageNote}
        </div>
      )}
    </div>
  )
}
