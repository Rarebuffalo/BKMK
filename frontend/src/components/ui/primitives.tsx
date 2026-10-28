import { AlertTriangle, Inbox } from 'lucide-react'
import { useId, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../lib/cx'

// Small presentational primitives. Each is used in several places.

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('panel', className)} {...rest} />
}

export function CardHeader({ eyebrow, title, action, className }: { eyebrow?: ReactNode; title?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow text-paper-faint">{eyebrow}</div>}
        {title && <h3 className="mt-1 text-[15px] font-semibold text-paper">{title}</h3>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('eyebrow text-paper-faint', className)}>{children}</div>
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: ReactNode
  error?: ReactNode
  leading?: ReactNode
}

export function TextInput({ label, hint, error, leading, className, id, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="eyebrow mb-2 block text-paper-dim">
          {label}
        </label>
      )}
      <div
        className={cx(
          'flex h-10 items-center gap-2 rounded-sm border bg-ink px-3 transition-colors focus-within:border-phosphor',
          error ? 'border-danger' : 'border-line-strong',
        )}
      >
        {leading && <span className="text-paper-faint">{leading}</span>}
        <input
          id={inputId}
          aria-invalid={!!error || undefined}
          className="h-full w-full min-w-0 bg-transparent font-mono text-sm text-paper outline-none placeholder:text-paper-faint/70"
          {...rest}
        />
      </div>
      {(error || hint) && <p className={cx('mt-1.5 text-xs', error ? 'text-danger' : 'text-paper-faint')}>{error ?? hint}</p>}
    </div>
  )
}

export function Chip({
  active,
  color,
  children,
  className,
  ...rest
}: { active?: boolean; color?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        'inline-flex h-8 items-center gap-2 rounded-sm border px-2.5 font-mono text-xs transition-colors',
        active ? 'border-paper bg-paper text-ink' : 'border-line bg-ink-2 text-paper-dim hover:border-line-strong hover:text-paper',
        className,
      )}
      {...rest}
    >
      {color && <span className="size-2 shrink-0" style={{ background: color }} />}
      {children}
    </button>
  )
}

export function Tag({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-xs border border-line px-1.5 py-0.5 font-mono text-[11px] text-paper-dim', className)}>
      {color && <span className="size-1.5" style={{ background: color }} />}
      {children}
    </span>
  )
}

/** Segmented block progress bar: reads like an old progress meter. */
export function BlockProgress({ value, max, segments = 20, color = 'var(--phosphor)', label, className }: { value: number; max: number; segments?: number; color?: string; label?: string; className?: string }) {
  const ratio = max ? Math.min(1, value / max) : 0
  const filled = Math.round(ratio * segments)
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className={cx('flex gap-[2px]', className)}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className="h-2 flex-1 transition-colors duration-200" style={{ background: i < filled ? color : 'var(--ink-4)' }} />
      ))}
    </div>
  )
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center border border-dashed border-line-strong text-paper-faint">{icon ?? <Inbox size={20} />}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-paper-dim">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, body, action, code }: { title: string; body?: ReactNode; action?: ReactNode; code?: string }) {
  return (
    <div role="alert" className="panel border-danger/50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={18} />
        <div className="min-w-0">
          {code && <div className="eyebrow mb-1 text-danger">ERR // {code}</div>}
          <h3 className="font-semibold">{title}</h3>
          {body && <div className="mt-1 text-sm text-paper-dim">{body}</div>}
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </div>
  )
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-56 -translate-x-1/2 rounded-xs border border-line-strong bg-ink-3 px-2 py-1 text-xs text-paper opacity-0 shadow-[var(--shadow-hard-sm)] transition-opacity group-focus-within/tt:opacity-100 group-hover/tt:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

export function Tabs<T extends string>({ value, onChange, items, className, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string; label: string }) {
  return (
    <div role="tablist" aria-label={label} className={cx('inline-flex rounded-sm border border-line bg-ink p-0.5', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'h-8 rounded-xs px-3 font-mono text-xs transition-colors',
            value === it.value ? 'bg-ink-4 text-paper' : 'text-paper-faint hover:text-paper',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
