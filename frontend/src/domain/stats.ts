import { CONTENT_TYPES, TOPICS } from './topics'
import type { Bookmark, CollectionStats, ContentType, TopicId } from './types'

export function computeStats(bookmarks: Bookmark[], retrieved = bookmarks.length): CollectionStats {
  const accessible = bookmarks.filter((b) => b.accessible)
  const topicCounts = Object.fromEntries(TOPICS.map((t) => [t.id, 0])) as Record<TopicId, number>
  const contentTypeCounts = Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, 0])) as Record<ContentType, number>
  const authors = new Map<string, { author: Bookmark['author']; count: number }>()
  const perTopic = new Map<TopicId, { authors: Map<string, { author: Bookmark['author']; count: number }>; types: Partial<Record<ContentType, number>> }>()
  let repoCount = 0

  for (const b of accessible) {
    topicCounts[b.topic]++
    contentTypeCounts[b.contentType]++
    if (b.contentType === 'repo') repoCount++
    if (!b.author.handle) {
      // Unknown author (e.g. archive Likes): count the post, not a fake author.
      const t = perTopic.get(b.topic) ?? { authors: new Map(), types: {} as Partial<Record<ContentType, number>> }
      t.types[b.contentType] = (t.types[b.contentType] ?? 0) + 1
      perTopic.set(b.topic, t)
      continue
    }
    const entry = authors.get(b.author.handle) ?? { author: b.author, count: 0 }
    entry.count++
    authors.set(b.author.handle, entry)
    const t = perTopic.get(b.topic) ?? { authors: new Map(), types: {} as Partial<Record<ContentType, number>> }
    const ta = t.authors.get(b.author.handle) ?? { author: b.author, count: 0 }
    ta.count++
    t.authors.set(b.author.handle, ta)
    t.types[b.contentType] = (t.types[b.contentType] ?? 0) + 1
    perTopic.set(b.topic, t)
  }
  const rank = (m: Map<string, { author: Bookmark['author']; count: number }>, n: number) =>
    [...m.values()].sort((a, b) => b.count - a.count || a.author.handle.localeCompare(b.author.handle)).slice(0, n)

  const classified = accessible.length - topicCounts.other
  const topTopics = TOPICS.filter((t) => t.id !== 'other' && topicCounts[t.id] > 0)
    .map((t) => ({ topic: t.id, count: topicCounts[t.id], share: classified ? topicCounts[t.id] / classified : 0 }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))

  const dates = accessible.map((b) => b.createdAt).filter(Boolean).sort()

  return {
    retrieved,
    accessible: accessible.length,
    inaccessible: bookmarks.length - accessible.length,
    classified,
    topicCounts,
    topTopics,
    contentTypeCounts,
    threadCount: contentTypeCounts.thread,
    repoShare: accessible.length ? repoCount / accessible.length : 0,
    authorCount: authors.size,
    topAuthors: rank(authors, 8),
    topicBreakdown: Object.fromEntries([...perTopic].map(([id, t]) => [id, { authors: t.authors.size, types: t.types, topAuthors: rank(t.authors, 4) }])),
    oldest: dates[0],
    newest: dates[dates.length - 1],
  }
}

/** exp(Shannon entropy): the "effective number" of categories in a distribution. */
export function effectiveCount(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0)
  if (!total) return 0
  let h = 0
  for (const c of counts) {
    if (c > 0) {
      const p = c / total
      h -= p * Math.log(p)
    }
  }
  return Math.exp(h)
}
