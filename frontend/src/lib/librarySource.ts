import { api, toBookmark } from '../api/endpoints'
import type { Bookmark, ContentType, ScanResult, TopicId } from '../domain/types'
import { applyFilters, type LibraryFilters } from './filters'

// Where the library gets its rows. Demo filters the in-memory sample; live
// asks the server, so large collections are never downloaded just to search.

export interface LibraryFacets {
  types: Partial<Record<ContentType, number>>
  topics: Partial<Record<TopicId, number>>
  authors: { handle: string; count: number }[]
  unavailable: number
}

export interface LibraryPage {
  items: Bookmark[]
  total: number
  facets: LibraryFacets
}

export interface LibrarySource {
  /** Live sources debounce typing; demo answers instantly. */
  remote: boolean
  query(filters: LibraryFilters, offset: number, limit: number, signal?: AbortSignal): Promise<LibraryPage>
}

export function demoLibrary(result: ScanResult, now: number): LibrarySource {
  return {
    remote: false,
    async query(f, offset, limit) {
      const scope = f.topics.length === 1 ? result.bookmarks.filter((b) => b.topic === f.topics[0]) : result.bookmarks
      const matched = applyFilters(scope, f, now)
      const types: Partial<Record<ContentType, number>> = {}
      const authors = new Map<string, number>()
      for (const b of scope) {
        if (!b.accessible) continue
        types[b.contentType] = (types[b.contentType] ?? 0) + 1
        authors.set(b.author.handle, (authors.get(b.author.handle) ?? 0) + 1)
      }
      return {
        items: matched.slice(offset, offset + limit),
        total: matched.length,
        facets: {
          types,
          topics: result.stats.topicCounts,
          authors: [...authors].map(([handle, count]) => ({ handle, count })).sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle)),
          unavailable: scope.filter((b) => !b.accessible).length,
        },
      }
    },
  }
}

export const liveLibrary: LibrarySource = {
  remote: true,
  async query(f, offset, limit, signal) {
    const page = await api.bookmarks(
      { q: f.q, topic: f.topics, type: f.types, author: f.author, date: f.date, sort: f.sort, offset, limit },
      signal,
    )
    return { items: page.items.map(toBookmark), total: page.total, facets: { ...page.facets, unavailable: 0 } }
  },
}
