import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '../../lib/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

// Primary buttons are "keycaps": hard offset shadow that collapses on press.
const base =
  'inline-flex items-center justify-center gap-2 font-mono font-semibold uppercase tracking-wide whitespace-nowrap select-none rounded-sm transition-[transform,box-shadow,background-color,border-color,color] duration-100 ease-out disabled:opacity-45 disabled:pointer-events-none'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-phosphor text-phosphor-ink border border-black shadow-[var(--shadow-hard)] hover:bg-[#9cff83] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#000]',
  secondary:
    'bg-ink-3 text-paper border border-line-strong shadow-[var(--shadow-hard-sm)] hover:border-paper-faint hover:bg-ink-4 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
  ghost: 'text-paper-dim hover:text-paper hover:bg-ink-3 border border-transparent',
  danger:
    'bg-danger text-black border border-black shadow-[var(--shadow-hard-sm)] hover:brightness-110 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[11px]',
  md: 'h-10 px-4 text-xs',
  lg: 'h-13 px-6 text-sm',
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cx(base, variants[variant], sizes[size], className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
})

export function ButtonLink({ variant, size, icon, className, children, ...rest }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

/** Block-character spinner: cycles through quarter blocks. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx('inline-grid size-3 grid-cols-2 gap-px', className)}>
      {[0, 1, 3, 2].map((i) => (
        <span
          key={i}
          className="bg-current"
          style={{ animation: `blink 0.8s steps(1) ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  )
}
