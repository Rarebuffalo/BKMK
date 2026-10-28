import type { Bookmark, ContentType, TopicId } from '../domain/types'

// Pure filtering/sorting for the library. Kept out of components so the same
// logic can move server-side when collections get large.

export type DateRange = 'any' | '30d' | '6m' | '1y' | 'older'
export type SortKey = 'newest' | 'oldest' | 'author' | 'longest'

export interface LibraryFilters {
  q: string
  topics: TopicId[]
  types: ContentType[]
  author: string
  date: DateRange
  sort: SortKey
  showUnavailable: boolean
}

export const EMPTY_FILTERS: LibraryFilters = { q: '', topics: [], types: [], author: '', date: 'any', sort: 'newest', showUnavailable: false }

const DAY = 86_400_000
const RANGE_DAYS: Record<Exclude<DateRange, 'any' | 'older'>, number> = { '30d': 30, '6m': 182, '1y': 365 }

export function applyFilters(bookmarks: Bookmark[], f: LibraryFilters, now: number): Bookmark[] {
  const q = f.q.trim().toLowerCase()
  const out = bookmarks.filter((b) => {
    if (!b.accessible) return f.showUnavailable && !q
    if (f.topics.length && !f.topics.includes(b.topic)) return false
    if (f.types.length && !f.types.includes(b.contentType)) return false
    if (f.author && b.author.handle !== f.author) return false
    if (f.date !== 'any') {
      const age = (now - new Date(b.createdAt).getTime()) / DAY
      if (f.date === 'older' ? age < 365 : age > RANGE_DAYS[f.date]) return false
    }
    if (q) {
      const hay = `${b.text} ${b.author.handle} ${b.author.name} ${b.links.join(' ')}`.toLowerCase()
      if (!q.split(/\s+/).every((term) => hay.includes(term))) return false
    }
    return true
  })
  const by: Record<SortKey, (a: Bookmark, b: Bookmark) => number> = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
    author: (a, b) => a.author.handle.localeCompare(b.author.handle) || b.createdAt.localeCompare(a.createdAt),
    longest: (a, b) => (b.threadLength ?? 0) - (a.threadLength ?? 0) || b.createdAt.localeCompare(a.createdAt),
  }
  return out.sort(by[f.sort])
}

export function activeFilterCount(f: LibraryFilters) {
  return f.topics.length + f.types.length + (f.author ? 1 : 0) + (f.date !== 'any' ? 1 : 0) + (f.showUnavailable ? 1 : 0)
}
