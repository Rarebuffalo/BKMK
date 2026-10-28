import { ArrowLeft, Check, Copy, Download, ExternalLink } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DemoTag } from '../components/brand/Demo'
import { Wordmark } from '../components/brand/Pixel'
import { ShareCardCanvas, type ShareCardHandle } from '../components/share/ShareCardCanvas'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import { ARCHETYPES } from '../domain/archetypes'
import { cx } from '../lib/cx'
import { PRODUCT_URL } from '../lib/format'
import { CARD_VARIANTS, cardDataFrom, exportPng, type CardVariant } from '../lib/shareCard'
import { useResult } from '../state/session'

// X counts every URL as 23 characters regardless of length.
const X_LIMIT = 280
const URL_WEIGHT = 23

export function SharePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const result = useResult()!
  const archetype = ARCHETYPES[result.archetype.primary]
  const variant = (CARD_VARIANTS.find((v) => v.id === params.get('variant'))?.id ?? 'terminal') as CardVariant
  const [showScore, setShowScore] = useState(true)
  const [caption, setCaption] = useState(() => defaultCaption(archetype.name, result.score.total, result.stats.accessible))
  const [renderFailed, setRenderFailed] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const cardRef = useRef<ShareCardHandle>(null)

  const data = useMemo(() => cardDataFrom(result), [result])
  const options = useMemo(() => ({ variant, showScore }), [variant, showScore])
  const shareUrl = `${PRODUCT_URL}/?ref=dna`
  const length = caption.length + 1 + URL_WEIGHT
  const onError = useCallback(() => setRenderFailed(true), [])

  async function download() {
    const canvas = cardRef.current?.canvas
    if (!canvas) return
    try {
      await exportPng(canvas, `bkmk-dna-${result.handle}-${variant}.png`)
      setDownloaded(true)
      toast('Card downloaded')
    } catch {
      setRenderFailed(true)
      toast('Couldn’t export the image', 'warn')
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${caption} ${shareUrl}`)
      toast('Caption copied')
    } catch {
      toast('Clipboard blocked — select the text and copy manually', 'warn')
    }
  }

  function openComposer() {
    const url = `https://x.com/intent/post?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(shareUrl)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-dvh pb-16">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link to="/" aria-label="BKMK.exe home">
          <Wordmark />
        </Link>
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow text-phosphor">SHARE MY DNA</div>
            <h1 className="mt-2 text-3xl font-bold [font-stretch:110%]">Make it yours, then post it.</h1>
          </div>
          {result.isDemo && (
            <span className="flex items-center gap-2 text-xs text-amber">
              <DemoTag /> Card is stamped “sample data” in demo mode
            </span>
          )}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* Preview */}
          <div>
            <div role="radiogroup" aria-label="Card style" className="mb-4 grid grid-cols-3 gap-2">
              {CARD_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  role="radio"
                  aria-checked={variant === v.id}
                  onClick={() => setParams({ variant: v.id }, { replace: true })}
                  className={cx('rounded-sm border p-2.5 text-left transition-colors', variant === v.id ? 'border-phosphor bg-phosphor/5' : 'border-line hover:border-line-strong')}
                >
                  <div className={cx('text-sm font-semibold', variant === v.id && 'text-phosphor')}>{v.label}</div>
                  <div className="hidden text-xs text-paper-faint sm:block">{v.blurb}</div>
                </button>
              ))}
            </div>
            <div className="panel-raised p-2 shadow-[8px_8px_0_0_#000]">
              <ShareCardCanvas ref={cardRef} data={data} options={options} onError={onError} label={`${CARD_VARIANTS.find((v) => v.id === variant)!.label} share card`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-paper-faint">
              <span>1200 × 675 PNG · generated from your scan · no bookmark contents included</span>
              <label className="flex cursor-pointer items-center gap-2 text-paper-dim">
                <input type="checkbox" checked={showScore} onChange={(e) => setShowScore(e.target.checked)} className="accent-[var(--phosphor)]" />
                Show Curation Score
              </label>
            </div>
            {renderFailed && (
              <p className="mt-3 rounded-sm border border-amber/40 bg-amber/5 p-3 text-sm text-amber">
                Image export isn’t working in this browser. You can still copy the caption and post it — or try Chrome, Safari or Firefox for the image.
              </p>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <Step n={1} title="Download the card" done={downloaded}>
              <Button variant={downloaded ? 'secondary' : 'primary'} className="w-full" icon={downloaded ? <Check size={14} /> : <Download size={14} />} onClick={download} disabled={renderFailed}>
                {downloaded ? 'Download again' : 'Download PNG'}
              </Button>
            </Step>

            <Step n={2} title="Edit your caption">
              <label htmlFor="caption" className="sr-only">Post caption</label>
              <textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-sm border border-line-strong bg-ink p-3 text-sm text-paper outline-none focus:border-phosphor"
              />
              <div className="mt-1.5 flex items-center justify-between font-mono text-[11px]">
                <span className="truncate text-paper-faint">+ {shareUrl}</span>
                <span className={length > X_LIMIT ? 'text-danger' : 'text-paper-faint'}>
                  {length}/{X_LIMIT}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon={<Copy size={13} />} onClick={copy}>Copy caption</Button>
                <Button size="sm" variant="ghost" onClick={() => setCaption(defaultCaption(archetype.name, result.score.total, result.stats.accessible))}>
                  Reset
                </Button>
              </div>
            </Step>

            <Step n={3} title="Post on X">
              <Button variant={downloaded ? 'primary' : 'secondary'} className="w-full" icon={<ExternalLink size={14} />} onClick={openComposer} disabled={length > X_LIMIT}>
                Open X composer
              </Button>
              <p className="mt-2 text-xs text-paper-faint">X’s composer can’t receive images from other sites — attach the PNG you downloaded. The link goes to the BKMK.exe home page, never your library.</p>
            </Step>

            <Button variant="ghost" className="w-full" onClick={() => navigate('/app')}>
              Skip — take me to my dashboard
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function defaultCaption(archetype: string, score: number, saved: number) {
  return `Scanned my X bookmarks: I'm ${archetype}. ${saved.toLocaleString('en-US')} saves decoded, Curation Score ${score}/100. What does yours say?`
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className={cx('grid size-6 place-items-center border font-mono text-xs', done ? 'border-phosphor bg-phosphor text-phosphor-ink' : 'border-line-strong text-paper-dim')}>{done ? '✓' : n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}
