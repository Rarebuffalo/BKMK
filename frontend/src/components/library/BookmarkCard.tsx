import { Copy, ExternalLink, Link2 } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { CONTENT_TYPE_LABEL, TOPIC_BY_ID } from '../../domain/topics'
import type { Bookmark } from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatDate, hostOf } from '../../lib/format'
import { Avatar } from '../brand/Avatar'
import { Tag, Tooltip } from '../ui/primitives'
import { useToast } from '../ui/Toast'

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="bg-phosphor/25 text-paper">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

export function BookmarkCard({ bookmark: b, query = '', isDemo, onAuthor }: { bookmark: Bookmark; query?: string; isDemo: boolean; onAuthor?: (handle: string) => void }) {
  const toast = useToast()
  const topic = TOPIC_BY_ID[b.topic]
  const link = b.links[0]

  if (!b.accessible) {
    return (
      <article className="panel border-dashed p-4 text-sm text-paper-faint">
        <div className="flex items-center justify-between gap-2 font-mono text-xs">
          <span>@{b.author.handle}</span>
          <span>{formatDate(b.createdAt)}</span>
        </div>
        <p className="mt-2">This post is no longer available — it was deleted or made private after you saved it. It isn’t counted in your score.</p>
      </article>
    )
  }

  return (
    <article className="panel group relative min-w-0 p-4 transition-colors hover:border-line-strong">
      <span className="absolute top-3 bottom-3 left-0 w-[2px]" style={{ background: topic.color }} aria-hidden />
      <header className="flex items-start gap-3">
        <Avatar handle={b.author.handle} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold">{b.author.name}</span>
            <button type="button" onClick={() => onAuthor?.(b.author.handle)} className="font-mono text-xs text-paper-faint hover:text-phosphor" title="Filter by this author">
              @{b.author.handle}
            </button>
          </div>
          <time dateTime={b.createdAt} className="font-mono text-[11px] text-paper-faint">
            {formatDate(b.createdAt)}
          </time>
        </div>
      </header>

      <p className="mt-3 text-[15px] leading-relaxed text-paper">
        <Highlight text={b.text} query={query} />
      </p>

      {link && (
        <div className="mt-3 flex items-center gap-2 rounded-xs border border-line bg-ink px-2.5 py-2 font-mono text-xs text-paper-dim">
          <Link2 size={13} className="shrink-0 text-paper-faint" />
          <span className="truncate">
            <span className="text-paper">{hostOf(link)}</span>
            {link.replace(/^https?:\/\/[^/]+/, '')}
          </span>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link to={`/app/topics/${b.topic}`}>
            <Tag color={topic.color} className="hover:border-line-strong hover:text-paper">{topic.short}</Tag>
          </Link>
          <Tag>
            {CONTENT_TYPE_LABEL[b.contentType]}
            {b.contentTypeCertain === false && <span title="Detected heuristically from the post text">· likely</span>}
            {b.threadLength ? ` · ${b.threadLength} posts` : ''}
          </Tag>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(b.url).then(
                () => toast('Link copied'),
                () => toast('Clipboard blocked', 'warn'),
              )
            }}
            className="grid size-8 place-items-center rounded-sm text-paper-faint hover:bg-ink-3 hover:text-paper"
            aria-label="Copy post link"
          >
            <Copy size={14} />
          </button>
          {isDemo ? (
            <Tooltip label="Sample post — there’s no original on X to open." align="end">
              <span className={cx('flex h-8 cursor-not-allowed items-center gap-1.5 rounded-sm px-2 font-mono text-xs text-paper-faint/60')} aria-disabled>
                Open on X <ExternalLink size={12} />
              </span>
            </Tooltip>
          ) : (
            <a href={b.url} target="_blank" rel="noopener noreferrer" className="flex h-8 items-center gap-1.5 rounded-sm px-2 font-mono text-xs text-paper-dim hover:bg-ink-3 hover:text-phosphor">
              Open on X <ExternalLink size={12} />
            </a>
          )}
        </div>
      </footer>
    </article>
  )
}
