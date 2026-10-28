import { cx } from '../../lib/cx'
import { hashString } from '../../lib/random'

const PALETTE = ['var(--phosphor)', 'var(--signal)', 'var(--amber)', 'var(--violet)', 'var(--topic-design)', 'var(--topic-devtools)']

/**
 * Original 5×5 mirrored identicon generated from the handle. We never hotlink
 * real profile images in the prototype.
 */
export function Avatar({ handle, size = 36, className }: { handle: string; size?: number; className?: string }) {
  const h = hashString(handle.toLowerCase())
  const color = PALETTE[h % PALETTE.length]
  const cells: [number, number][] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((h >> (y * 3 + x)) & 1) {
        cells.push([x, y])
        if (x < 2) cells.push([4 - x, y])
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -1 7 7"
      shapeRendering="crispEdges"
      aria-hidden
      className={cx('shrink-0 rounded-xs border border-line', className)}
      style={{ background: `color-mix(in oklab, ${color} 10%, var(--ink-2))` }}
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
      ))}
    </svg>
  )
}
