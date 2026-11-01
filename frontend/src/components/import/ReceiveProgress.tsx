import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { ReceiveProgress as Progress, ReceiveResult } from '../../import/receiver'
import { STOP_REASON_COPY } from '../../import/record'
import { cx } from '../../lib/cx'
import { fmt } from '../../lib/format'
import { BlockProgress } from '../ui/primitives'

/** Live counts for a direct import, and an honest verdict once it ends. */
export function ReceiveProgress({ progress, result }: { progress: Progress; result?: ReceiveResult }) {
  const total = progress.expectedTotal
  const rows: [string, number, string?][] = [
    ['Received', progress.received],
    ['Valid', progress.valid, 'text-phosphor'],
    ['Duplicates skipped', progress.duplicates],
    ['Invalid rejected', progress.rejected, progress.rejected ? 'text-amber' : undefined],
  ]
  return (
    <div className="grid gap-4" aria-live="polite">
      <BlockProgress value={total ? Math.min(progress.received, total) : progress.received} max={total || Math.max(progress.received, 1)} label="Import progress" />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="rounded-sm border border-line bg-ink p-3">
            <dt className="eyebrow text-paper-faint">{label}</dt>
            <dd className={cx('mt-1 font-mono text-xl', tone ?? 'text-paper')}>{fmt(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="font-mono text-xs text-paper-faint">
        {progress.batches} batch{progress.batches === 1 ? '' : 'es'}
        {total !== undefined && ` · source reported ${fmt(total)}`}
        {progress.source && ` · ${progress.source.name} ${progress.source.version}`}
      </p>
      {result &&
        (result.coverage === 'complete' ? (
          <p role="status" className="flex items-center gap-2 text-sm text-phosphor">
            <CircleCheck size={16} /> Complete import: the source sent everything it had.
          </p>
        ) : (
          <p role="status" className="flex gap-2 rounded-sm border border-amber/40 bg-amber/5 p-3 text-sm text-amber">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong>Partial import.</strong> It stopped early because {result.reason ? STOP_REASON_COPY[result.reason] : 'it didn’t finish'}. Your collection may have more than
              the {fmt(result.counts.valid)} bookmarks that arrived.
            </span>
          </p>
        ))}
      {result && result.rejections.length > 0 && (
        <details className="text-xs text-paper-dim">
          <summary className="cursor-pointer font-mono">Why {fmt(result.counts.rejected)} records were rejected</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {result.rejections.map((r) => (
              <li key={`${r.batch}-${r.index}`}>
                batch {r.batch} · record {r.index + 1}: {r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
