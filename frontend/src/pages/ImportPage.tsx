import { Archive, FileUp, ListChecks, RotateCcw, ScanLine, TriangleAlert } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ImportTag } from '../components/brand/Demo'
import { PasteCollector } from '../components/import/PasteCollector'
import { FlowLayout, Window } from '../components/scan/Window'
import { Button, Spinner } from '../components/ui/Button'
import { BlockProgress, Tabs, TextInput } from '../components/ui/primitives'
import { toRawBookmarks, type ImportItem, type ImportSummary } from '../import/parse'
import { readImport, type ImportReadResult } from '../import/read'
import { cx } from '../lib/cx'
import { fmt } from '../lib/format'
import { stageImport } from '../services/import'
import { useSession } from '../state/session'

const ACCEPT = '.zip,.js,.json,.csv,.html,.htm,.txt'
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/

type Stage = { kind: 'idle' } | { kind: 'reading'; label: string; fraction: number } | { kind: 'read'; result: ImportReadResult }

type Via = 'paste' | 'files'

export function ImportPage() {
  const navigate = useNavigate()
  const { dispatch } = useSession()
  const [params, setParams] = useSearchParams()
  const via: Via = params.get('via') === 'files' ? 'files' : 'paste'
  const [files, setFiles] = useState<File[]>([])
  const [pasted, setPasted] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [name, setName] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    setFiles((prev) => [...prev, ...Array.from(list)].filter((f, i, all) => all.findIndex((g) => g.name === f.name && g.size === f.size) === i))
    setStage({ kind: 'idle' })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }
  const reset = () => {
    setFiles([])
    setPasted('')
    setStage({ kind: 'idle' })
    if (input.current) input.current.value = ''
  }
  const read = async () => {
    setStage({ kind: 'reading', label: 'starting', fraction: 0 })
    const result = await readImport(files, pasted, (label, fraction) => setStage({ kind: 'reading', label, fraction }))
    if (result.handle && !name) setName(result.handle)
    setStage({ kind: 'read', result })
  }

  const handle = name.trim().replace(/^@/, '')
  const handleOk = handle === '' || HANDLE_RE.test(handle)
  const start = (items: ImportItem[], summary: ImportSummary, fromFile?: { handle?: string; displayName?: string }) => {
    const shown = handle || fromFile?.handle || 'me'
    const displayName = fromFile?.displayName ?? shown
    stageImport({ handle: shown, displayName, raw: toRawBookmarks(items), info: summary })
    // identify first: a new identity resets the session (mode included) to its defaults.
    dispatch({ type: 'identify', identity: { handle: shown, displayName, isDemo: false } })
    dispatch({ type: 'mode', mode: 'import' })
    dispatch({ type: 'authorize' })
    navigate('/scan')
  }

  const nothingChosen = files.length === 0 && !pasted.trim()

  return (
    <FlowLayout>
      <Window title="bookmark dna · free, on this device" status={<ImportTag />}>
        <div className="grid gap-6 p-5 sm:p-7">
          <div>
            <h1 className="display text-3xl sm:text-4xl">Analyse your saves for free</h1>
            <p className="mt-3 max-w-2xl text-paper-dim">
              Copy your X bookmarks page and paste it here. It’s read <strong className="text-paper">in this browser</strong>: no login to BKMK.exe, nothing uploaded,
              and BKMK.exe never contacts X, so there’s nothing to pay for.
            </p>
          </div>

          <Tabs
            label="How to bring your saves"
            value={via}
            onChange={(v) => setParams(v === 'files' ? { via: 'files' } : {}, { replace: true })}
            items={[
              { value: 'paste', label: 'Copy from X · fastest' },
              { value: 'files', label: 'Archive or file' },
            ]}
          />

          {via === 'paste' ? (
            <>
              <PasteCollector onAnalyse={(items, summary) => start(items, summary)} />
              <TextInput
                id="paste-handle"
                label="Name on your card (optional)"
                hint="Your X handle, without @. Only shown on your result and share card."
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={handleOk ? undefined : 'Use letters, numbers and underscores (max 15).'}
                leading="@"
              />
            </>
          ) : (
            <>
              <p className="max-w-2xl text-sm text-paper-dim">
                No time to copy? X’s data archive doesn’t include bookmarks, but it does include your Likes with full text. Or use a bookmark list you already have.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <Option icon={<Archive size={16} />} title="Your X archive → Likes" tone="phosphor">
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>On X: Settings → Your account → <em>Download an archive of your data</em>. X emails you when it’s ready (often a day or more).</li>
                    <li>Drop the whole <code>.zip</code> here, or just <code>data/like.js</code>.</li>
                  </ol>
                  <p className="mt-2 text-paper-faint">Gives full post text. No authors, and links are t.co short links, so link types are mostly unknown.</p>
                </Option>
                <Option icon={<ListChecks size={16} />} title="A bookmark list you already have">
                  <p>A CSV with a <code>url</code> column (Raindrop, Readwise, a spreadsheet), a JSON export (including BKMK.exe’s own), your browser’s bookmarks HTML, or pasted X post links.</p>
                  <p className="mt-2 text-paper-faint">Only X post links are used. A plain list of links has no post text, so topics can’t be read from it.</p>
                </Option>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cx('grid place-items-center gap-3 border border-dashed p-6 text-center transition-colors', dragging ? 'border-phosphor bg-phosphor/5' : 'border-line-strong')}
              >
                <FileUp className="text-paper-faint" size={22} aria-hidden />
                <div className="text-sm text-paper-dim">Drag files here, or</div>
                <input ref={input} id="import-files" type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
                <label htmlFor="import-files" className="cursor-pointer border border-line-strong px-3 py-1.5 font-mono text-xs hover:border-phosphor hover:text-phosphor">
                  Choose files
                </label>
                <div className="font-mono text-[11px] text-paper-faint">.zip · like.js · .csv · .json · .html · .txt</div>
                {files.length > 0 && (
                  <ul className="w-full max-w-md text-left font-mono text-xs text-paper-dim" aria-label="Chosen files">
                    {files.map((f) => (
                      <li key={f.name + f.size} className="flex justify-between gap-3 border-t border-line py-1 first:border-t-0">
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-paper-faint">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="grid gap-1.5">
                <span className="eyebrow">Or paste X post links</span>
                <textarea
                  value={pasted}
                  onChange={(e) => {
                    setPasted(e.target.value)
                    setStage({ kind: 'idle' })
                  }}
                  rows={3}
                  placeholder="https://x.com/someone/status/1234567890…"
                  className="w-full resize-y border border-line bg-ink-2 p-3 font-mono text-xs text-paper placeholder:text-paper-faint focus:border-phosphor focus:outline-none"
                />
              </label>

              {stage.kind === 'reading' && (
                <div role="status" className="grid gap-2 font-mono text-xs text-paper-dim">
                  <div className="flex items-center gap-2">
                    <Spinner className="text-phosphor" /> reading {stage.label}…
                  </div>
                  <BlockProgress value={Math.round(stage.fraction * 100)} max={100} label="Reading progress" />
                </div>
              )}

              {stage.kind === 'read' && <Summary result={stage.result} />}

              {stage.kind === 'read' && stage.result.summary.total > 0 && (
                <TextInput
                  id="import-handle"
                  label="Name on your card"
                  hint={stage.result.handle ? 'From your archive. Only shown on your result and share card.' : 'Your X handle, without @. Only shown on your result and share card.'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={handleOk ? undefined : 'Use letters, numbers and underscores (max 15).'}
                  leading="@"
                />
              )}

              <div className="flex flex-wrap gap-2">
                {stage.kind === 'read' && stage.result.summary.total > 0 ? (
                  <Button variant="primary" icon={<ScanLine size={14} />} disabled={!handleOk} onClick={() => start(stage.result.items, stage.result.summary, stage.result)}>
                    Analyse {fmt(stage.result.summary.total)} {stage.result.summary.kind === 'likes' ? 'likes' : 'posts'}
                  </Button>
                ) : (
                  <Button variant="primary" icon={<FileUp size={14} />} disabled={nothingChosen || stage.kind === 'reading'} onClick={read}>
                    Read {files.length > 1 ? `${files.length} files` : 'import'}
                  </Button>
                )}
                {!nothingChosen && (
                  <Button icon={<RotateCcw size={14} />} onClick={reset}>
                    Start over
                  </Button>
                )}
                <Button variant="ghost" onClick={() => navigate('/')}>Back</Button>
              </div>
          </>
          )}
        </div>
      </Window>
      <p className="mt-5 text-center font-mono text-[11px] text-paper-faint">
        Free · no account · nothing uploaded · BKMK.exe never contacts X. Your analysed library stays in this browser until you delete it in Settings.
      </p>
    </FlowLayout>
  )
}

function Option({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone?: 'phosphor'; children: React.ReactNode }) {
  return (
    <section className={cx('panel p-4 text-sm', tone === 'phosphor' && 'border-phosphor/40')}>
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <span className="text-phosphor">{icon}</span>
        {title}
      </h2>
      <div className="text-paper-dim">{children}</div>
    </section>
  )
}

function Summary({ result }: { result: ImportReadResult }) {
  const s = result.summary
  const noun = s.kind === 'likes' ? 'likes' : 'posts'
  const pct = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0)
  return (
    <div className="grid gap-3" aria-live="polite">
      {result.problems.map((p) => (
        <div key={p.file} role="alert" className="flex gap-2 border border-danger/40 bg-danger/5 p-3 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <div className="font-mono text-xs text-paper">{p.file}</div>
            <div className="text-paper-dim">{p.message}</div>
          </div>
        </div>
      ))}
      {s.total === 0 ? (
        <div role="alert" className="border border-amber/40 bg-amber/5 p-3 text-sm text-amber">
          No X posts found{result.problems.length ? ' in the files that could be read' : ''}. Check you chose the Likes file (data/like.js) or a list that contains x.com/…/status/… links.
          {s.skipped > 0 && ` ${fmt(s.skipped)} entries weren’t X posts.`}
        </div>
      ) : (
        <div className="panel grid gap-2 p-4 font-mono text-xs text-paper-dim">
          <div className="text-sm text-paper">
            Found <span className="text-phosphor">{fmt(s.total)}</span> {noun} {s.kind === 'likes' && <span className="text-paper-faint">(X archives have Likes, not bookmarks)</span>}
          </div>
          <div>
            {fmt(s.duplicates)} duplicates merged · {fmt(s.skipped)} non-post entries skipped
            {s.truncated > 0 && ` · newest ${fmt(s.total)} kept, ${fmt(s.truncated)} older left out`}
          </div>
          <div>
            with post text {pct(s.withText)}% · with author {pct(s.withAuthor)}% · with date {pct(s.withDate)}%
          </div>
          {s.withText === 0 && <div className="text-amber">No post text in this import: topics, archetype and score will be very limited. The X archive’s Likes include text.</div>}
        </div>
      )}
    </div>
  )
}
