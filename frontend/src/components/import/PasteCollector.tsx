import { ClipboardPaste, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { mergeParsed, type ImportItem, type ImportSummary } from '../../import/parse'
import { parseClipboard } from '../../import/paste'
import { cx } from '../../lib/cx'
import { fmt } from '../../lib/format'
import { Button, buttonClass } from '../ui/Button'
import { BlockProgress } from '../ui/primitives'

// Collected posts survive a reload of this tab, and vanish when the tab closes.
const STORAGE_KEY = 'bkmk.paste.v1'
/** The Curation Score stops scaling for sample size here (see domain/scoring.ts). */
const FULL_SAMPLE = 30
const BOOKMARKS_URL = 'https://x.com/i/bookmarks'
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

function load(): ImportItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ImportItem[]) : []
  } catch {
    return []
  }
}

type Feedback = { tone: 'ok' | 'warn'; text: string } | null

export function PasteCollector({ onAnalyse }: { onAnalyse: (items: ImportItem[], summary: ImportSummary) => void }) {
  const [items, setItems] = useState<ImportItem[]>(load)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [pastes, setPastes] = useState(0)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      if (items.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage blocked or full: collection still works for this page view.
    }
  }, [items])

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const parsed = parseClipboard({ html: e.clipboardData.getData('text/html'), text: e.clipboardData.getData('text/plain') })
    if (parsed.mode === 'none') {
      setFeedback({
        tone: 'warn',
        text: 'No X posts in that paste. On your X bookmarks page, press ' + MOD + '+A then ' + MOD + '+C, and paste here. Copying from the X mobile app doesn’t include post links.',
      })
      return
    }
    const known = new Set(items.map((i) => i.id))
    const merged = mergeParsed([
      { kind: 'bookmarks', format: 'paste', items, skipped: 0 },
      { kind: 'bookmarks', format: 'paste', items: parsed.items, skipped: 0 },
    ]).items
    const added = parsed.items.filter((i) => !known.has(i.id)).length
    setItems(merged)
    setPastes((n) => n + 1)
    setFeedback({
      tone: added ? 'ok' : 'warn',
      text: added
        ? `+${added} new${parsed.items.length - added ? ` · ${parsed.items.length - added} already captured` : ''}.${parsed.mode === 'text' ? ' Links only: your browser pasted plain text, so post text is missing.' : ''} Scroll down on X and copy again to add more.`
        : 'Nothing new in that paste. Scroll further down your bookmarks on X, then copy again.',
    })
  }

  const clear = () => {
    setItems([])
    setPastes(0)
    setFeedback(null)
  }

  const n = items.length
  const withText = items.filter((i) => i.text).length

  return (
    <div className="grid gap-5">
      <ol className="grid gap-3 md:grid-cols-3">
        <Step n={1} title="Open your bookmarks on X">
          <a href={BOOKMARKS_URL} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
            <ExternalLink size={13} /> x.com/i/bookmarks
          </a>
          <p className="mt-2">Signed in as usual. BKMK.exe never sees your X login.</p>
        </Step>
        <Step n={2} title={`Select all, copy`}>
          <p>
            <Kbd>{MOD}</Kbd>+<Kbd>A</Kbd> then <Kbd>{MOD}</Kbd>+<Kbd>C</Kbd>. X only shows a screenful at a time, so scroll down and repeat to add more.
          </p>
        </Step>
        <Step n={3} title="Paste below">
          <p>
            Click the box, then <Kbd>{MOD}</Kbd>+<Kbd>V</Kbd>. Each paste is read in this browser. Nothing is uploaded and X isn’t contacted.
          </p>
        </Step>
      </ol>

      <label htmlFor="paste-target" className="sr-only">
        Paste your copied X bookmarks here
      </label>
      <textarea
        ref={box}
        id="paste-target"
        onPaste={onPaste}
        value=""
        onChange={() => {}}
        placeholder={n ? `Paste the next screen here (${MOD}+V)` : `Paste here (${MOD}+V)`}
        rows={3}
        className={cx(
          'w-full resize-none border-2 border-dashed bg-ink-2 p-6 text-center font-mono text-sm text-paper caret-transparent placeholder:text-paper-dim focus:border-phosphor focus:outline-none',
          n ? 'border-phosphor/50' : 'border-line-strong',
        )}
      />

      {feedback && (
        <p role="status" className={cx('font-mono text-xs', feedback.tone === 'ok' ? 'text-phosphor' : 'text-amber')}>
          {feedback.text}
        </p>
      )}

      <div className="panel grid gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-mono text-sm">
            <span className="font-pixel text-2xl text-phosphor">{fmt(n)}</span> bookmarks captured
            {pastes > 0 && <span className="text-paper-faint"> · {pastes} paste{pastes === 1 ? '' : 's'}</span>}
          </div>
          {n > 0 && (
            <button type="button" onClick={clear} className="flex items-center gap-1 font-mono text-xs text-paper-faint hover:text-danger">
              <Trash2 size={12} /> clear
            </button>
          )}
        </div>
        <BlockProgress value={Math.min(n, FULL_SAMPLE)} max={FULL_SAMPLE} label="Bookmarks captured toward a full score" />
        <p className="text-xs text-paper-faint">
          {n >= FULL_SAMPLE
            ? 'Enough for a full Curation Score. Keep adding for a sharper picture, or analyse now.'
            : `Your score scales up until ${FULL_SAMPLE} bookmarks. You can analyse any time.`}
          {n > 0 && withText < n && ` ${n - withText} without post text.`}
        </p>
        <div>
          <Button
            variant="primary"
            icon={<ClipboardPaste size={14} />}
            disabled={n === 0}
            onClick={() => onAnalyse(items, mergeParsed([{ kind: 'bookmarks', format: 'paste', items, skipped: 0 }]).summary)}
          >
            {n ? `Analyse ${fmt(n)} bookmarks` : 'Paste to begin'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="panel p-4 text-sm text-paper-dim">
      <div className="mb-2 flex items-center gap-2 font-semibold text-paper">
        <span className="font-pixel text-phosphor">0{n}</span>
        {title}
      </div>
      {children}
    </li>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-xs border border-line-strong bg-ink px-1 font-mono text-[11px] text-paper">{children}</kbd>
}
