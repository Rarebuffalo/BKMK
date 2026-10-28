import { PageHeader } from '../components/dashboard/PageHeader'
import { BookmarkBrowser } from '../components/library/BookmarkBrowser'
import { fmt } from '../lib/format'
import { useResult } from '../state/session'

export function LibraryPage() {
  const result = useResult()!
  return (
    <>
      <PageHeader eyebrow="LIBRARY" title="All bookmarks" body={`${fmt(result.stats.accessible)} readable posts from @${result.handle}. Search, filter and jump back to the original.`} />
      <BookmarkBrowser result={result} />
    </>
  )
}
