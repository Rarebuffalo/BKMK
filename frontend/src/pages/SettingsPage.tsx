import { Download, LogOut, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '../components/brand/Avatar'
import { DemoLabControls, DemoTag } from '../components/brand/Demo'
import { PageHeader } from '../components/dashboard/PageHeader'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Modal'
import { Card, CardHeader } from '../components/ui/primitives'
import { relativeTime } from '../lib/format'
import { useAccountActions } from '../state/actions'
import { useLive } from '../state/live'
import { useResult } from '../state/session'

export function SettingsPage() {
  const live = useLive()
  const result = useResult()!
  const actions = useAccountActions()
  const connection = live.me?.connection?.status
  const [confirm, setConfirm] = useState<'disconnect' | 'delete' | null>(null)

  return (
    <>
      <PageHeader eyebrow="SETTINGS & PRIVACY" title="Your account and data" />
      <div className="grid max-w-4xl gap-4">
        <Card className="p-5">
          <CardHeader eyebrow="Connected account" />
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar handle={result.handle} size={44} />
              <div>
                <div className="flex items-center gap-2 font-mono">
                  @{result.handle} {result.isDemo && <DemoTag />}
                </div>
                <div className="text-xs text-paper-faint">
                  {result.isDemo
                    ? 'Demo session · no X token is stored'
                    : connection === 'active'
                      ? 'Connected via X OAuth 2.0 · read-only scopes'
                      : 'X authorization expired — reconnect to scan again'}
                </div>
              </div>
            </div>
            <Button variant="ghost" className="text-danger hover:text-danger" icon={<LogOut size={14} />} onClick={() => setConfirm('disconnect')}>
              Disconnect
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader eyebrow="Scan" />
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div>
                Last scanned {relativeTime(result.scannedAt)} <span className="text-paper-faint">({new Date(result.scannedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })})</span>
              </div>
              <div className="mt-0.5 text-paper-faint">
                {result.coverage === 'complete' ? 'Complete' : 'Partial'} · {result.stats.accessible} readable bookmarks. Rescans only add new posts — badges aren’t awarded twice.
              </div>
            </div>
            <Button icon={<RefreshCw size={14} />} onClick={() => actions.rescan(result.handle)}>
              Rescan now
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader eyebrow="Your data" />
          <div className="mt-4 divide-y divide-line">
            <Row title="Export" body="Download every scanned bookmark with its topic and type as JSON." action={<Button icon={<Download size={14} />} onClick={() => actions.exportData(result)}>Export JSON</Button>} />
            <Row
              title="Delete data"
              body={result.isDemo ? 'Erase the demo session and everything stored in this browser.' : 'Permanently delete your bookmarks, scores and badges from BKMK.exe.'}
              action={<Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirm('delete')}>Delete</Button>}
            />
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader eyebrow="How your data is handled" />
          <ul className="mt-3 space-y-2 text-sm text-paper-dim">
            <li>• Access is granted through X’s official OAuth. We never see or store your password.</li>
            <li>• We only request read access to bookmarks and your profile.</li>
            <li>• Your library is private. Share cards include totals, archetype and badges — never bookmark text, authors or links.</li>
            <li>• Disconnecting revokes our token and deletes stored bookmarks.</li>
            <li>• Classification and scoring are rule-based. No bookmark is sent to an AI model.</li>
          </ul>
          {result.isDemo && <p className="mt-4 rounded-sm border border-amber/30 bg-amber/5 p-3 text-xs text-amber">In this prototype everything lives in your browser’s local storage. There is no server.</p>}
        </Card>

        {result.isDemo && (
          <Card className="border-dashed border-amber/40 p-5">
            <CardHeader eyebrow={<span className="text-amber">Demo lab</span>} title="Preview other scan outcomes" />
            <p className="mt-1 mb-5 text-sm text-paper-dim">Pick a scenario or sample collection, then hit Rescan.</p>
            <DemoLabControls />
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'disconnect'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          actions.disconnect()
        }}
        danger
        title="Disconnect your X account?"
        confirmLabel="Disconnect"
        body="BKMK.exe will lose access to your bookmarks and your scanned library, score and badges will be deleted. You can connect again any time."
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          actions.deleteAll()
        }}
        danger
        title="Delete all data?"
        confirmLabel="Delete everything"
        body="This removes your scanned bookmarks, scores, badges and session. It can’t be undone."
      />
    </>
  )
}

function Row({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-paper-dim">{body}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}
