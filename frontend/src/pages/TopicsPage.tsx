import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/dashboard/PageHeader'
import { TopicIcon } from '../components/dashboard/TopicIcon'
import { TOPICS } from '../domain/topics'
import { fmt, pct } from '../lib/format'
import { useResult } from '../state/session'

export function TopicsPage() {
  const result = useResult()!
  const { stats } = result
  const topics = TOPICS.filter((t) => stats.topicCounts[t.id] > 0).sort((a, b) => {
    if (a.id === 'other') return 1
    if (b.id === 'other') return -1
    return stats.topicCounts[b.id] - stats.topicCounts[a.id]
  })
  const max = Math.max(...topics.map((t) => stats.topicCounts[t.id]))

  return (
    <>
      <PageHeader
        eyebrow="EXPLORE TOPICS"
        title={`${stats.topTopics.length} topic clusters`}
        body="Grouped by deterministic keyword and link rules — no AI. Open a cluster to browse everything in it."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {topics.map((t) => {
          const count = stats.topicCounts[t.id]
          const authors = new Set(result.bookmarks.filter((b) => b.accessible && b.topic === t.id).map((b) => b.author.handle)).size
          return (
            <Link
              key={t.id}
              to={`/app/topics/${t.id}`}
              className="panel group relative flex flex-col overflow-hidden p-5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-line-strong"
            >
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center border" style={{ borderColor: t.color, color: t.color, background: `color-mix(in oklab, ${t.color} 10%, transparent)` }}>
                  <TopicIcon topic={t.id} size={18} />
                </span>
                <ArrowUpRight size={16} className="text-paper-faint transition-colors group-hover:text-paper" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{t.label}</h2>
              <p className="mt-1 flex-1 text-sm text-paper-dim">{t.description}</p>
              <div className="mt-5 flex items-baseline justify-between font-mono text-xs">
                <span>
                  <span className="text-2xl font-bold text-paper">{fmt(count)}</span>
                  <span className="ml-1.5 text-paper-faint">saves · {authors} authors</span>
                </span>
                <span className="text-paper-faint">{pct(count / stats.accessible)}</span>
              </div>
              <div className="mt-2 h-1.5 bg-ink-4">
                <div className="h-full" style={{ width: pct(count / max), background: t.color }} />
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
