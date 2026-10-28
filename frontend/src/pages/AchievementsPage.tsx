import { Lock } from 'lucide-react'
import { useState } from 'react'
import { BadgeDetailModal } from '../components/achievements/BadgeDetailModal'
import { AchievementBadge, RARITY_COLOR, RARITY_LABEL } from '../components/brand/Pixel'
import { PageHeader } from '../components/dashboard/PageHeader'
import { ButtonLink } from '../components/ui/Button'
import { BlockProgress } from '../components/ui/primitives'
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, progressLabel, RARITY_ORDER } from '../domain/achievements'
import { cx } from '../lib/cx'
import { useResult } from '../state/session'

export function AchievementsPage() {
  const result = useResult()!
  const [selected, setSelected] = useState<string | null>(null)
  const earned = result.achievements.filter((a) => a.earned).length

  return (
    <>
      <PageHeader
        eyebrow="ACHIEVEMENT CABINET"
        title={
          <>
            {earned} <span className="text-paper-faint">of {ACHIEVEMENTS.length} unlocked</span>
          </>
        }
        body="Every badge comes from a rule you can read, evaluated against your scan. Rescanning the same bookmarks never earns a badge twice."
        action={earned > 0 && <ButtonLink to="/share?variant=badges" variant="primary" size="sm">Share my badges</ButtonLink>}
      />

      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-paper-dim">
        {RARITY_ORDER.filter((r) => r !== 'special').reverse().map((r) => (
          <span key={r} className="flex items-center gap-2">
            <span className="size-2.5 border-2" style={{ borderColor: RARITY_COLOR[r] }} />
            {RARITY_LABEL[r]}
          </span>
        ))}
        <span className="text-paper-faint">Rarity is a visual tier, not a measured share of users.</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {result.achievements.map((p) => {
          const def = ACHIEVEMENT_BY_ID[p.id]
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={cx(
                'panel group flex flex-col items-center p-4 text-center transition-[border-color,transform] hover:-translate-y-0.5 sm:p-5',
                p.earned ? 'hover:border-line-strong' : 'border-dashed opacity-90 hover:opacity-100',
              )}
            >
              <div className="relative">
                <AchievementBadge id={p.id} earned={p.earned} size={84} />
                {!p.earned && (
                  <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center border border-line-strong bg-ink-3 text-paper-faint">
                    <Lock size={12} />
                  </span>
                )}
              </div>
              <h2 className={cx('mt-4 font-pixel text-xs', p.earned ? 'text-paper' : 'text-paper-dim')}>{def.name}</h2>
              <div className="mt-1 font-mono text-[10px]" style={{ color: p.earned ? RARITY_COLOR[def.rarity] : 'var(--paper-faint)' }}>
                {RARITY_LABEL[def.rarity]} · {p.earned ? 'Unlocked' : 'Locked'}
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-paper-faint">{def.condition}</p>
              <div className="mt-auto w-full pt-4">
                <BlockProgress value={p.current} max={p.target} segments={12} color={p.earned ? RARITY_COLOR[def.rarity] : 'var(--paper-dim)'} label={`${def.name} progress`} />
                <div className="mt-1.5 font-mono text-[10px] text-paper-faint">
                  {progressLabel(p)}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <BadgeDetailModal progress={result.achievements.find((p) => p.id === selected) ?? null} version={result.achievementsVersion} onClose={() => setSelected(null)} />
    </>
  )
}
