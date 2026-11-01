import { FlaskConical, Play, ScanLine, Square } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReceiveProgress } from '../components/import/ReceiveProgress'
import { FlowLayout, Window } from '../components/scan/Window'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/primitives'
import { toStagedImport } from '../import/direct'
import { createMockBridge, MOCK_SCENARIOS, type MockScenario } from '../import/mockBridge'
import { ImportReceiveError, receiveImport, type ReceiveProgress as Progress, type ReceiveResult } from '../import/receiver'
import { fmt } from '../lib/format'
import { stageImport } from '../services/import'
import { useSession } from '../state/session'

// Development-only page (registered in App.tsx only when import.meta.env.DEV).
// Drives the direct-import receiver with the synthetic mock source, end to end
// through the real scan, analysis, reveal and library. Nothing here contacts X.

type Stage = { kind: 'idle' } | { kind: 'receiving'; progress: Progress } | { kind: 'done'; progress: Progress; result: ReceiveResult } | { kind: 'failed'; error: ImportReceiveError }

const BATCH_SIZES = [10, 50, 250, 500]
const selectClass = 'h-10 w-full rounded-sm border border-line-strong bg-ink px-3 font-mono text-sm text-paper'

export function ImportHarnessPage() {
  const navigate = useNavigate()
  const { dispatch } = useSession()
  const [scenario, setScenario] = useState<MockScenario>('small')
  const [batchSize, setBatchSize] = useState(50)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)

  const run = async () => {
    abort.current = new AbortController()
    const empty: Progress = { received: 0, valid: 0, duplicates: 0, rejected: 0, batches: 0 }
    setStage({ kind: 'receiving', progress: empty })
    try {
      let last = empty
      const result = await receiveImport(createMockBridge(scenario, { batchSize }), {
        signal: abort.current.signal,
        onProgress: (p) => {
          last = p
          setStage({ kind: 'receiving', progress: p })
        },
      })
      setStage({ kind: 'done', progress: last, result })
    } catch (e) {
      setStage({ kind: 'failed', error: e instanceof ImportReceiveError ? e : new ImportReceiveError('unavailable', 'The import failed.') })
    }
  }

  const analyse = (result: ReceiveResult) => {
    const handle = 'synthetic'
    stageImport(toStagedImport(result, handle))
    // identify first: a new identity resets the session (mode included) to its defaults.
    dispatch({ type: 'identify', identity: { handle, displayName: handle, isDemo: false } })
    dispatch({ type: 'mode', mode: 'import' })
    dispatch({ type: 'authorize' })
    navigate('/scan')
  }

  const busy = stage.kind === 'receiving'
  return (
    <FlowLayout>
      <Window title="direct import · dev harness" status={<span className="font-pixel text-[10px] text-amber">SYNTHETIC</span>}>
        <div className="grid gap-6 p-5 sm:p-7">
          <div>
            <h1 className="display text-3xl">Direct import harness</h1>
            <p role="note" className="mt-3 flex gap-2 rounded-sm border border-dashed border-amber/40 p-3 text-sm text-amber">
              <FlaskConical size={16} className="mt-0.5 shrink-0" />
              Development only. A mock source sends synthetic bookmarks through the real receiver and analysis. Nothing here contacts X, and this page isn’t part of
              production builds.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label className="grid gap-1.5 text-sm">
              <span className="eyebrow text-paper-faint">Scenario</span>
              <select className={selectClass} value={scenario} disabled={busy} onChange={(e) => setScenario(e.target.value as MockScenario)}>
                {MOCK_SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {s.hint}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="eyebrow text-paper-faint">Batch size</span>
              <select className={selectClass} value={batchSize} disabled={busy} onChange={(e) => setBatchSize(Number(e.target.value))}>
                {BATCH_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} per batch
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {busy ? (
              <Button icon={<Square size={14} />} onClick={() => abort.current?.abort()}>
                Stop import
              </Button>
            ) : (
              <Button variant="primary" icon={<Play size={14} />} onClick={run}>
                Start import
              </Button>
            )}
          </div>

          {(stage.kind === 'receiving' || stage.kind === 'done') && <ReceiveProgress progress={stage.progress} result={stage.kind === 'done' ? stage.result : undefined} />}

          {stage.kind === 'done' && stage.result.counts.valid > 0 && (
            <div>
              <Button variant="primary" icon={<ScanLine size={14} />} onClick={() => analyse(stage.result)}>
                {stage.result.coverage === 'complete' ? `Analyse ${fmt(stage.result.counts.valid)} bookmarks` : `Analyse partial import (${fmt(stage.result.counts.valid)})`}
              </Button>
            </div>
          )}

          {stage.kind === 'done' && stage.result.counts.valid === 0 && (
            <ErrorState code="IMPORT_EMPTY" title="Nothing usable arrived" body="No valid bookmarks were received, so there’s nothing to analyse." />
          )}

          {stage.kind === 'failed' && <ErrorState code={`IMPORT_${stage.error.code.toUpperCase()}`} title="The import didn’t start" body={stage.error.message} />}
        </div>
      </Window>
    </FlowLayout>
  )
}
