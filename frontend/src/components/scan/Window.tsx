import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '../brand/Pixel'
import { cx } from '../../lib/cx'

/** Retro window chrome used for the connect → scan → reveal sequence. */
export function Window({ title, status, children, className }: { title: ReactNode; status?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('panel-raised overflow-hidden shadow-[8px_8px_0_0_#000]', className)}>
      <div className="flex items-center justify-between gap-3 border-b-2 border-line-strong bg-ink-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-paper-dim">
          <span className="font-pixel text-phosphor">BKMK.exe</span>
          <span className="truncate">— {title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {status}
          <div className="flex gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2.5 border border-paper-faint" />
            ))}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

export function FlowLayout({ children, step }: { children: ReactNode; step?: 1 | 2 | 3 | 4 }) {
  const steps = ['Identify', 'Authorize', 'Scan', 'Reveal']
  return (
    <div className="flex min-h-dvh flex-col dotgrid">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link to="/" aria-label="BKMK.exe home">
          <Wordmark />
        </Link>
        {step && (
          <ol className="flex items-center gap-1 font-mono text-[11px]" aria-label="Progress">
            {steps.map((s, i) => (
              <li key={s} aria-current={i + 1 === step ? 'step' : undefined} className={cx('flex items-center gap-1', i + 1 < step ? 'text-phosphor' : i + 1 === step ? 'text-paper' : 'text-paper-faint')}>
                <span className={cx('grid size-5 place-items-center border', i + 1 <= step ? 'border-current' : 'border-line')}>{i + 1 < step ? '✓' : i + 1}</span>
                <span className="hidden sm:inline">{s}</span>
                {i < steps.length - 1 && <span className="mx-1 text-paper-faint">—</span>}
              </li>
            ))}
          </ol>
        )}
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-20 sm:px-6">{children}</main>
    </div>
  )
}
