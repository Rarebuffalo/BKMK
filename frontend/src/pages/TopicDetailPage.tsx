import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/brand/Avatar'
import { TopicIcon } from '../components/dashboard/TopicIcon'
import { BookmarkBrowser } from '../components/library/BookmarkBrowser'
import { CONTENT_TYPES, TOPIC_BY_ID } from '../domain/topics'
import type { TopicId } from '../domain/types'
import { fmt, pct } from '../lib/format'
import { useResult } from '../state/session'

export function TopicDetailPage() {
  const { topicId } = useParams()
  const result = useResult()!
  const topic = TOPIC_BY_ID[topicId as TopicId]
  if (!topic) return <Navigate to="/app/topics" replace />

  // Aggregates come from stats so the page works the same for demo and live data.
  const count = result.stats.topicCounts[topic.id] ?? 0
  const breakdown = result.stats.topicBreakdown?.[topic.id]
  const types = CONTENT_TYPES.map((c) => ({ ...c, n: breakdown?.types[c.id] ?? 0 })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n)
  const authors = (breakdown?.topAuthors ?? []).map(({ author, count: n }) => ({ a: author, n }))
  const rank = result.stats.topTopics.findIndex((t) => t.topic === topic.id)

  return (
    <>
      <Link to="/app/topics" className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs text-paper-dim hover:text-paper">
        <ArrowLeft size={13} /> All topics
      </Link>
      <div className="panel relative mb-6 overflow-hidden p-5 sm:p-6">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: topic.color }} />
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center border-2" style={{ borderColor: topic.color, color: topic.color }}>
              <TopicIcon topic={topic.id} size={22} />
            </span>
            <div>
              <div className="eyebrow" style={{ color: topic.color }}>
                {rank >= 0 ? `TOPIC #${rank + 1}` : 'UNSORTED'}
              </div>
              <h1 className="mt-1 text-3xl font-bold [font-stretch:112%]">{topic.label}</h1>
              <p className="mt-1 max-w-xl text-paper-dim">{topic.description}</p>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-6 font-mono">
            <div>
              <div className="eyebrow text-paper-faint">Saves</div>
              <div className="mt-1 text-3xl font-bold">{fmt(count)}</div>
            </div>
            <div>
              <div className="eyebrow text-paper-faint">Of library</div>
              <div className="mt-1 text-3xl font-bold">{pct(count / (result.stats.accessible || 1))}</div>
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-6 border-t border-line pt-5 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-2 text-paper-faint">Formats</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-paper-dim">
              {types.map((t) => (
                <span key={t.id}>
                  {t.plural} <span className="text-paper">{t.n}</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-2 text-paper-faint">Most-saved authors</div>
            <div className="flex flex-wrap gap-3">
              {authors.map(({ a, n }) => (
                <Link key={a.handle} to={`?author=${a.handle}`} replace className="flex items-center gap-2 font-mono text-xs text-paper-dim hover:text-paper">
                  <Avatar handle={a.handle} size={20} /> @{a.handle} <span className="text-paper-faint">{n}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
        {topic.id !== 'other' && <p className="mt-4 font-mono text-[10px] text-paper-faint">matched on: {topic.keywords.slice(0, 8).join(', ')}…</p>}
      </div>
      <BookmarkBrowser result={result} lockedTopic={topic.id} />
    </>
  )
}
