import { ACHIEVEMENT_BY_ID } from '../../domain/achievements'
import { ARCHETYPES } from '../../domain/archetypes'
import { PIXEL_ICONS } from '../../domain/pixels'
import type { ArchetypeId, CollectionStats, Rarity } from '../../domain/types'
import { cx } from '../../lib/cx'
import { badgeCells, BADGE_GRID, dnaBars, iconCells, type Cell } from '../../lib/geometry'

export const RARITY_COLOR: Record<Rarity, string> = {
  common: 'var(--paper-dim)',
  uncommon: 'var(--phosphor)',
  rare: 'var(--violet)',
  special: 'var(--amber)',
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  special: 'Special',
}

/** Merge horizontal runs of same-kind cells into one rect each. */
function runs(cells: Cell[]) {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: { x: number; y: number; w: number; kind: Cell['kind'] }[] = []
  for (const c of sorted) {
    const last = out[out.length - 1]
    if (last && last.y === c.y && last.kind === c.kind && last.x + last.w === c.x) last.w++
    else out.push({ x: c.x, y: c.y, w: 1, kind: c.kind })
  }
  return out
}

export function PixelIcon({ name, size = 24, color = 'currentColor', className, title }: { name: string; size?: number; color?: string; className?: string; title?: string }) {
  const icon = PIXEL_ICONS[name] ?? PIXEL_ICONS.disk
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {runs(iconCells(icon)).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={color} opacity={r.kind === 'tint' ? 0.35 : 1} />
      ))}
    </svg>
  )
}

export function AchievementBadge({ id, earned = true, size = 64, className }: { id: string; earned?: boolean; size?: number; className?: string }) {
  const def = ACHIEVEMENT_BY_ID[id]
  const color = earned ? RARITY_COLOR[def.rarity] : 'var(--line-strong)'
  const cells = badgeCells(def.rarity, PIXEL_ICONS[def.icon])
  const fills: Record<Cell['kind'], { fill: string; opacity?: number }> = {
    border: { fill: color },
    ring: { fill: color, opacity: 0.5 },
    fill: { fill: earned ? `color-mix(in oklab, ${color} 14%, var(--ink-2))` : 'var(--ink-3)' },
    icon: { fill: earned ? color : 'var(--line-strong)' },
    tint: { fill: color, opacity: earned ? 0.3 : 0.2 },
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BADGE_GRID} ${BADGE_GRID}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`${def.name} badge, ${earned ? 'earned' : 'locked'}`}
      className={cx('shrink-0', className)}
    >
      {runs(cells).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={fills[r.kind].fill} opacity={fills[r.kind].opacity} />
      ))}
    </svg>
  )
}

export function ArchetypeEmblem({ id, size = 96, className }: { id: ArchetypeId; size?: number; className?: string }) {
  const a = ARCHETYPES[id]
  return (
    <div
      className={cx('relative grid shrink-0 place-items-center border-2', className)}
      style={{ width: size, height: size, borderColor: a.color, background: `color-mix(in oklab, ${a.color} 12%, var(--ink))`, boxShadow: '4px 4px 0 0 #000' }}
    >
      <PixelIcon name={a.icon} size={Math.round(size * 0.58)} color={a.color} />
      <span className="absolute -top-px -left-px size-1.5" style={{ background: 'var(--ink)' }} />
      <span className="absolute -right-px -bottom-px size-1.5" style={{ background: 'var(--ink)' }} />
    </div>
  )
}

export function DnaStrip({ stats, height = 40, className, animate }: { stats: CollectionStats; height?: number; className?: string; animate?: boolean }) {
  const units = 120
  const bars = dnaBars(stats, units)
  return (
    <svg viewBox={`0 0 ${units} 10`} preserveAspectRatio="none" className={cx('block w-full', className)} style={{ height }} role="img" aria-label="Bookmark DNA barcode: topic mix of your collection">
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={0}
          width={b.w}
          height={10}
          fill={b.color}
          shapeRendering="crispEdges"
          style={animate ? { animation: `rise 300ms ${i * 8}ms both` } : undefined}
        />
      ))}
    </svg>
  )
}

export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cx('inline-flex items-baseline gap-0 font-pixel leading-none', size === 'sm' && 'text-sm', size === 'md' && 'text-lg', size === 'lg' && 'text-3xl', className)}>
      <PixelIcon name="bookmark" size={size === 'lg' ? 26 : size === 'md' ? 16 : 13} color="var(--phosphor)" className="mr-1.5 self-center" />
      <span className="font-bold text-paper">BKMK</span>
      <span className="text-phosphor">.exe</span>
    </span>
  )
}
