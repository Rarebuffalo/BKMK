import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { PERSONAS, type DemoPersona } from '../../data/demoProfile'
import { cx } from '../../lib/cx'
import type { DemoScenario } from '../../services'
import { useSession } from '../../state/session'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function DemoTag({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-xs border border-amber/50 px-1.5 py-px font-pixel text-[10px] text-amber', className)} title="Synthetic sample data. Nothing was retrieved from X.">
      DEMO
    </span>
  )
}

export function LiveTag({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-xs border border-phosphor/50 px-1.5 py-px font-pixel text-[10px] text-phosphor', className)} title="Your real X bookmarks">
      LIVE
    </span>
  )
}

export function DemoBanner() {
  return (
    <div className="border-b border-amber/25 bg-amber/[0.07] px-4 py-1.5 text-center font-mono text-[11px] text-amber">
      Prototype · showing synthetic sample bookmarks · nothing here was retrieved from X
    </div>
  )
}

export const SCENARIOS: { id: DemoScenario; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal scan', hint: 'Everything works.' },
  { id: 'slow', label: 'Slow API', hint: 'Shows the slow-scan notice.' },
  { id: 'partial', label: 'Partial scan', hint: 'Rate limit stops retrieval at ~60%.' },
  { id: 'empty', label: 'No bookmarks', hint: 'Account has nothing saved.' },
  { id: 'api-error', label: 'API error', hint: 'X returns a 503 mid-scan.' },
  { id: 'auth-expired', label: 'Auth expired', hint: 'Token expires during the scan.' },
]

export function DemoLabControls() {
  const { state, dispatch } = useSession()
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="eyebrow mb-2 text-paper-dim">Scan scenario</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <label key={s.id} className={cx('flex cursor-pointer gap-2 rounded-sm border p-2.5 text-sm', state.demo.scenario === s.id ? 'border-phosphor bg-phosphor/5' : 'border-line hover:border-line-strong')}>
              <input type="radio" name="scenario" className="mt-1 accent-[var(--phosphor)]" checked={state.demo.scenario === s.id} onChange={() => dispatch({ type: 'demo', scenario: s.id })} />
              <span>
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-paper-faint">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="eyebrow mb-2 block text-paper-dim">Sample collection</span>
        <select
          value={state.demo.persona}
          onChange={(e) => dispatch({ type: 'demo', persona: e.target.value as DemoPersona | 'auto' })}
          className="h-10 w-full rounded-sm border border-line-strong bg-ink px-2 font-mono text-sm"
        >
          <option value="auto">Auto — derived from the handle</option>
          {(Object.keys(PERSONAS) as DemoPersona[]).map((p) => (
            <option key={p} value={p}>
              {PERSONAS[p].label}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block text-xs text-paper-faint">Same handle + collection always produces the same result. Changes apply to the next scan.</span>
      </label>
    </div>
  )
}

/** Floating launcher so reviewers can switch scenarios from any pre-dashboard screen. */
export function DemoLab() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" className="fixed bottom-4 left-4 z-30" icon={<FlaskConical size={14} />} onClick={() => setOpen(true)}>
        Demo lab
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Demo lab" eyebrow="PROTOTYPE CONTROLS" footer={<Button variant="primary" onClick={() => setOpen(false)}>Done</Button>}>
        <p className="mb-5 text-sm text-paper-dim">This prototype has no backend. Use these controls to preview every state the real scan can reach.</p>
        <DemoLabControls />
      </Modal>
    </>
  )
}
