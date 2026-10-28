import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CONTENT_TYPES, TOPIC_BY_ID, TOPICS } from '../../domain/topics'
import type { ContentType, ScanResult, TopicId } from '../../domain/types'
import { cx } from '../../lib/cx'
import { isApiError } from '../../api/client'
import { activeFilterCount, EMPTY_FILTERS, type DateRange, type LibraryFilters, type SortKey } from '../../lib/filters'
import { demoLibrary, liveLibrary, type LibraryPage } from '../../lib/librarySource'
import { fmt } from '../../lib/format'
import { Button } from '../ui/Button'
import { Chip, EmptyState, ErrorState } from '../ui/primitives'
import { BookmarkCard } from './BookmarkCard'

const PAGE = 30

/** Filter state lives in the URL so views are linkable and survive back/forward. */
function useFilters(lockedTopic?: TopicId): [LibraryFilters, (patch: Partial<LibraryFilters>) => void, () => void] {
  const [params, setParams] = useSearchParams()
  const filters: LibraryFilters = {
    q: params.get('q') ?? '',
    topics: lockedTopic ? [lockedTopic] : ((params.get('topic')?.split(',').filter((t) => t in TOPIC_BY_ID) ?? []) as TopicId[]),
    types: (params.get('type')?.split(',').filter(Boolean) ?? []) as ContentType[],
    author: params.get('author') ?? '',
    date: (params.get('date') as DateRange) ?? 'any',
    sort: (params.get('sort') as SortKey) ?? 'newest',
    showUnavailable: params.get('unavailable') === '1',
  }
  const update = (patch: Partial<LibraryFilters>) => {
    const next = { ...filters, ...patch }
    const p = new URLSearchParams()
    if (next.q) p.set('q', next.q)
    if (!lockedTopic && next.topics.length) p.set('topic', next.topics.join(','))
    if (next.types.length) p.set('type', next.types.join(','))
    if (next.author) p.set('author', next.author)
    if (next.date !== 'any') p.set('date', next.date)
    if (next.sort !== 'newest') p.set('sort', next.sort)
    if (next.showUnavailable) p.set('unavailable', '1')
    setParams(p, { replace: true })
  }
  const clear = () => update({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort, topics: lockedTopic ? [lockedTopic] : [] })
  return [filters, update, clear]
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])

export function BookmarkBrowser({ result, lockedTopic }: { result: ScanResult; lockedTopic?: TopicId }) {
  const [filters, update, clear] = useFilters(lockedTopic)
  const [showFilters, setShowFilters] = useState(false)
  const [now] = useState(() => Date.now())
  const searchRef = useRef<HTMLInputElement>(null)
  const source = useMemo(() => (result.isDemo ? demoLibrary(result, now) : liveLibrary), [result, now])

  const [page, setPage] = useState<LibraryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const key = JSON.stringify(filters)

  // First page whenever filters change. Live search is debounced and cancellable.
  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(
      () => {
        setLoading(true)
        source
          .query(JSON.parse(key) as LibraryFilters, 0, PAGE, ctrl.signal)
          .then((p) => {
            setPage(p)
            setError(null)
          })
          .catch((e: Error) => {
            if (e.name !== 'AbortError') setError(isApiError(e) ? e.message : 'Couldn’t load bookmarks.')
          })
          .finally(() => !ctrl.signal.aborted && setLoading(false))
      },
      source.remote ? 250 : 0,
    )
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [source, key, reload])

  const loadMore = () => {
    if (!page) return
    setLoading(true)
    source
      .query(filters, page.items.length, PAGE)
      .then((p) => setPage({ ...p, items: [...page.items, ...p.items] }))
      .catch((e: Error) => setError(isApiError(e) ? e.message : 'Couldn’t load more bookmarks.'))
      .finally(() => setLoading(false))
  }

  const items = page?.items ?? []
  const total = page?.total ?? 0
  const authors = page?.facets.authors ?? []
  const typeCounts = page?.facets.types ?? {}
  const unavailable = page?.facets.unavailable ?? 0
  const active = activeFilterCount(filters) - (lockedTopic ? 1 : 0)

  // "/" focuses search, like most developer tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectCls = 'h-9 rounded-sm border border-line-strong bg-ink px-2 font-mono text-xs text-paper outline-none focus:border-phosphor'

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-sm border-2 border-line-strong bg-ink px-3 transition-colors focus-within:border-phosphor">
          <Search size={16} className="shrink-0 text-paper-faint" />
          <label htmlFor="library-search" className="sr-only">Search bookmarks</label>
          <input
            id="library-search"
            ref={searchRef}
            type="search"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder={lockedTopic ? `Search ${TOPIC_BY_ID[lockedTopic].short}…` : 'Search text, authors, links…'}
            className="h-full w-full min-w-0 bg-transparent font-mono text-sm outline-none placeholder:text-paper-faint/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.q ? (
            <button type="button" onClick={() => update({ q: '' })} aria-label="Clear search" className="text-paper-faint hover:text-paper">
              <X size={14} />
            </button>
          ) : (
            <kbd className="hidden rounded-xs border border-line px-1.5 font-mono text-[10px] text-paper-faint sm:inline">/</kbd>
          )}
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="sort">Sort</label>
          <select id="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as SortKey })} className={cx(selectCls, 'h-11 flex-1 sm:flex-none')}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="author">Author A–Z</option>
            <option value="longest">Longest threads</option>
          </select>
          <Button variant={showFilters || active ? 'secondary' : 'ghost'} className="h-11 border-line-strong" icon={<SlidersHorizontal size={14} />} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            Filters{active ? ` (${active})` : ''}
          </Button>
        </div>
      </div>

      {!lockedTopic && (
        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {TOPICS.filter((t) => result.stats.topicCounts[t.id] > 0).map((t) => (
            <Chip key={t.id} color={t.color} active={filters.topics.includes(t.id)} onClick={() => update({ topics: toggle(filters.topics, t.id) })} className="shrink-0">
              {t.short}
              <span className="text-[10px] opacity-60">{result.stats.topicCounts[t.id]}</span>
            </Chip>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="panel mt-3 grid animate-rise gap-4 p-4 md:grid-cols-[2fr_1fr_1fr]">
          <fieldset>
            <legend className="eyebrow mb-2 text-paper-faint">Content type</legend>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.filter((c) => typeCounts[c.id]).map((c) => (
                <Chip key={c.id} active={filters.types.includes(c.id)} onClick={() => update({ types: toggle(filters.types, c.id) })}>
                  {c.plural}
                  <span className="text-[10px] opacity-60">{typeCounts[c.id]}</span>
                </Chip>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="eyebrow mb-2 block text-paper-faint">Author</span>
            <select value={filters.author} onChange={(e) => update({ author: e.target.value })} className={cx(selectCls, 'w-full')}>
              <option value="">Anyone</option>
              {authors.map((a) => (
                <option key={a.handle} value={a.handle}>
                  @{a.handle} ({a.count})
                </option>
              ))}
            </select>
          </label>
          <div>
            <label className="block">
              <span className="eyebrow mb-2 block text-paper-faint">Posted</span>
              <select value={filters.date} onChange={(e) => update({ date: e.target.value as DateRange })} className={cx(selectCls, 'w-full')}>
                <option value="any">Any time</option>
                <option value="30d">Past 30 days</option>
                <option value="6m">Past 6 months</option>
                <option value="1y">Past year</option>
                <option value="older">Over a year ago</option>
              </select>
            </label>
            {unavailable > 0 && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-paper-dim">
                <input type="checkbox" checked={filters.showUnavailable} onChange={(e) => update({ showUnavailable: e.target.checked })} className="accent-[var(--phosphor)]" />
                Show {unavailable} unavailable
              </label>
            )}
          </div>
          <p className="font-mono text-[10px] text-paper-faint md:col-span-3">X doesn’t share when you bookmarked a post, so dates are when it was posted.</p>
        </div>
      )}

      <div className="mt-5 mb-3 flex items-center justify-between font-mono text-xs text-paper-faint" aria-live="polite">
        <span>
          {page ? `${fmt(total)} ${total === 1 ? 'bookmark' : 'bookmarks'}` : 'loading…'}
          {loading && page && <span className="ml-2 animate-blink">▌</span>}
          {filters.author && (
            <button type="button" onClick={() => update({ author: '' })} className="ml-2 inline-flex items-center gap-1 rounded-xs border border-line px-1.5 text-paper-dim hover:text-paper">
              @{filters.author} <X size={10} />
            </button>
          )}
        </span>
        {(active > 0 || filters.q) && (
          <button type="button" onClick={() => (filters.q ? update({ ...EMPTY_FILTERS, sort: filters.sort, topics: lockedTopic ? [lockedTopic] : [] }) : clear())} className="text-paper-dim underline decoration-dotted underline-offset-4 hover:text-paper">
            Clear all
          </button>
        )}
      </div>

      {error ? (
        <ErrorState code="LIBRARY" title="Couldn’t load your bookmarks" body={error} action={<Button onClick={() => setReload((r) => r + 1)}>Try again</Button>} />
      ) : !page ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="panel h-36 animate-pulse bg-ink-2" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={filters.q ? `Nothing matches “${filters.q}”` : 'No bookmarks match these filters'}
            body="Try fewer filters or a shorter search. Search looks at post text, author names and links."
            action={<Button onClick={() => update({ ...EMPTY_FILTERS, topics: lockedTopic ? [lockedTopic] : [] })}>Clear search & filters</Button>}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {items.map((b) => (
              <BookmarkCard key={b.id} bookmark={b} query={filters.q} isDemo={result.isDemo} onAuthor={(h) => update({ author: h })} />
            ))}
          </div>
          {total > items.length && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <Button onClick={loadMore} loading={loading}>Load {Math.min(PAGE, total - items.length)} more</Button>
              <span className="font-mono text-[11px] text-paper-faint">
                showing {items.length} of {fmt(total)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
