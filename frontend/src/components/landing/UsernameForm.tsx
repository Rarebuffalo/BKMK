import { ArrowRight, Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { validateHandle } from '../../lib/handle'
import { cx } from '../../lib/cx'
import type { AppMode } from '../../state/session'
import { Button } from '../ui/Button'

export function UsernameForm({ id, onChange, autoFocus, compact, mode = 'demo' }: { id: string; onChange?: (handle: string) => void; autoFocus?: boolean; compact?: boolean; mode?: AppMode }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const v = validateHandle(value)
  const showError = v.ok === false && touched
  const emptyError = touched && v.ok === null

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!v.ok) return
    setSubmitting(true)
    navigate('/connect', { state: { handle: v.handle, mode } })
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <label htmlFor={id} className="eyebrow mb-2 flex items-center justify-between text-paper-dim">
        <span>Your X username</span>
        <span className="hidden text-paper-faint sm:inline">PRESS ENTER ↵</span>
      </label>
      <div
        className={cx(
          'group flex flex-col gap-2 rounded-md border-2 bg-ink p-2 shadow-[var(--shadow-hard)] transition-colors sm:flex-row sm:items-stretch',
          showError || emptyError ? 'border-danger' : v.ok ? 'border-phosphor' : 'border-line-strong focus-within:border-paper-dim',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 px-2">
          <span className={cx('font-mono text-xl font-semibold sm:text-2xl', v.ok ? 'text-phosphor' : 'text-paper-faint')}>@</span>
          <input
            id={id}
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => {
              setValue(e.target.value)
              const next = validateHandle(e.target.value)
              onChange?.(next.ok ? next.handle : '')
            }}
            onBlur={() => value && setTouched(true)}
            placeholder="yourhandle"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={60}
            aria-invalid={showError || emptyError || undefined}
            aria-describedby={`${id}-msg`}
            className={cx('h-12 w-full min-w-0 bg-transparent font-mono font-medium text-paper outline-none placeholder:text-paper-faint/50', compact ? 'text-lg' : 'text-xl sm:text-2xl')}
          />
          {v.ok && <Check size={18} className="shrink-0 text-phosphor" aria-hidden />}
        </div>
        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full sm:w-auto" icon={submitting ? undefined : <ArrowRight size={16} />}>
          Scan my Bookmark DNA
        </Button>
      </div>
      <p id={`${id}-msg`} className={cx('mt-2.5 min-h-5 text-sm', showError || emptyError ? 'text-danger' : 'text-paper-faint')} aria-live="polite">
        {showError && v.ok === false
          ? v.reason
          : emptyError
            ? 'Enter your X handle to start.'
            : v.ok
              ? <span className="text-phosphor">Looks good. Next you’ll confirm the account and approve access on X.</span>
              : 'Paste a handle or profile link. You approve access on X — we never see your password.'}
      </p>
    </form>
  )
}
