import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Button } from './Button'

// Built on native <dialog>: focus trapping, Escape and inert background come free.
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  eyebrow?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] bg-transparent p-0 text-paper backdrop:bg-black/70 backdrop:backdrop-blur-[2px] open:animate-rise',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-xl',
        size === 'lg' && 'max-w-3xl',
      )}
    >
      {open && (
        <div className="panel-raised">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              {eyebrow && <div className="eyebrow mb-1 text-paper-faint">{eyebrow}</div>}
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="-mr-2 px-2">
              <X size={16} />
            </Button>
          </div>
          <div className="max-h-[70dvh] overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow={danger ? 'CONFIRM // IRREVERSIBLE' : 'CONFIRM'}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-paper-dim">{body}</div>
    </Modal>
  )
}
