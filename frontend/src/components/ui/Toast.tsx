import { Check, Info, TriangleAlert } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'

type Tone = 'ok' | 'info' | 'warn'
interface ToastItem {
  id: number
  text: string
  tone: Tone
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs.slice(-2), { id, text, tone }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'flex animate-rise items-center gap-2 rounded-sm border bg-ink-3 px-3 py-2 font-mono text-xs shadow-[var(--shadow-hard)]',
              t.tone === 'ok' && 'border-phosphor-dim text-phosphor',
              t.tone === 'info' && 'border-line-strong text-paper',
              t.tone === 'warn' && 'border-amber/60 text-amber',
            )}
          >
            {t.tone === 'ok' ? <Check size={14} /> : t.tone === 'warn' ? <TriangleAlert size={14} /> : <Info size={14} />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
