import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { cx } from '../../lib/cx'
import { CARD_H, CARD_W, ensureCardFonts, renderCard, type CardData, type CardOptions } from '../../lib/shareCard'

export interface ShareCardHandle {
  canvas: HTMLCanvasElement | null
}

/** Live preview of the share card. The canvas drawn here is what gets exported. */
export const ShareCardCanvas = forwardRef<ShareCardHandle, { data: CardData; options: CardOptions; className?: string; label?: string; onError?: (e: Error) => void }>(
  function ShareCardCanvas({ data, options, className, label, onError }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
    useImperativeHandle(ref, () => ({ canvas: canvasRef.current }), [])

    useEffect(() => {
      let alive = true
      ensureCardFonts()
        .catch(() => undefined) // Fall back to system fonts rather than fail.
        .then(() => {
          if (!alive || !canvasRef.current) return
          renderCard(canvasRef.current, data, options)
          setState('ready')
        })
        .catch((e: Error) => {
          if (!alive) return
          setState('error')
          onError?.(e)
        })
      return () => {
        alive = false
      }
    }, [data, options, onError])

    return (
      <div className={cx('relative overflow-hidden rounded-sm bg-ink-2', className)} style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}>
        <canvas ref={canvasRef} width={CARD_W} height={CARD_H} role="img" aria-label={label ?? 'Bookmark DNA share card preview'} className={cx('block h-full w-full transition-opacity duration-300', state === 'ready' ? 'opacity-100' : 'opacity-0')} />
        {state === 'loading' && <div className="absolute inset-0 grid place-items-center font-mono text-xs text-paper-faint">rendering card…</div>}
        {state === 'error' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-paper-dim">Couldn’t draw the card in this browser. Your results are safe — try another browser to export the image.</div>
        )}
      </div>
    )
  },
)
