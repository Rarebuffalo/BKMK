import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, body, action }: { eyebrow: string; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div className="min-w-0">
        <div className="eyebrow text-phosphor">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">{title}</h1>
        {body && <p className="mt-2 max-w-2xl text-paper-dim">{body}</p>}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  )
}
