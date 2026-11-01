import { BellRing, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ButtonLink, buttonClass } from '../ui/Button'
import { cx } from '../../lib/cx'
import { accessUpdatesUrl, X_IMPORT_STATUS } from '../../lib/xAccess'

/** "Connect with X" while bookmark import is off: says so plainly, and keeps the demo one click away. */
export function XImportStatus({ heading = 'h2', className }: { heading?: 'h1' | 'h2'; className?: string }) {
  const updates = accessUpdatesUrl()
  const Heading = heading
  return (
    <section aria-labelledby="x-import-status" className={cx('rounded-sm border border-line bg-ink-2 p-5', className)}>
      <div className="eyebrow flex items-center gap-2 text-amber">
        <span className="inline-block size-2 bg-amber" />
        {X_IMPORT_STATUS.eyebrow}
      </div>
      <Heading id="x-import-status" className="mt-2 text-xl font-bold text-paper">
        {X_IMPORT_STATUS.title}
      </Heading>
      <p className="mt-2 text-sm text-paper-dim">{X_IMPORT_STATUS.body}</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {updates && (
          <a href={updates} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'md')}>
            <BellRing size={14} />
            Request access updates
          </a>
        )}
        <ButtonLink to="/connect" state={{ handle: 'demo', mode: 'demo' }} variant={updates ? 'secondary' : 'primary'} icon={<Play size={14} />}>
          Try the demo
        </ButtonLink>
      </div>
      <p className="mt-3 font-mono text-[11px] text-paper-faint">
        The demo uses sample data and never contacts X. Already have a bookmark export?{' '}
        <Link to="/import?via=files" className="text-paper-dim underline decoration-dotted underline-offset-4 hover:text-phosphor">
          Import a file
        </Link>
      </p>
    </section>
  )
}
