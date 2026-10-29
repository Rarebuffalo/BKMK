import { strToU8 as rawStrToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { analyze } from '../domain/analyze'
import { importScanService, stageImport } from '../services/import'
import type { ScanEvent } from '../services/types'
import {
  contentLinks,
  ImportError,
  MAX_ITEMS,
  mergeParsed,
  parseArchiveScript,
  parseCsv,
  parseFileText,
  parseHtml,
  parseJson,
  parsePostUrl,
  parseText,
  snowflakeDate,
  toRawBookmarks,
} from './parse'
import { readImport } from './read'

// jsdom's TextEncoder returns another realm's Uint8Array, which zipSync mistakes for a folder.
const strToU8 = (s: string) => new Uint8Array(rawStrToU8(s))

const like = (id: string, text?: string, url = `https://twitter.com/i/web/status/${id}`) => ({ like: { tweetId: id, ...(text ? { fullText: text } : {}), expandedUrl: url } })
const likeJs = (entries: unknown[]) => `window.YTD.like.part0 = ${JSON.stringify(entries, null, 2)}`

// A real Snowflake id: 2023-ish.
const ID_A = '1650000000000000000'
const ID_B = '1700000000000000000'

describe('X post URLs', () => {
  it('accepts x.com, twitter.com, mobile and i/web forms and rejects others', () => {
    expect(parsePostUrl('https://x.com/ada/status/123')).toEqual({ id: '123', handle: 'ada' })
    expect(parsePostUrl('https://mobile.twitter.com/ada/status/123?s=20')).toEqual({ id: '123', handle: 'ada' })
    expect(parsePostUrl('https://twitter.com/i/web/status/123')).toEqual({ id: '123', handle: undefined })
    expect(parsePostUrl('https://github.com/ada/status/123')).toBeNull()
    expect(parsePostUrl('https://x.com/ada')).toBeNull()
  })

  it('keeps real link targets but not t.co short links or X itself', () => {
    expect(contentLinks('see https://t.co/abc and https://github.com/a/b, also https://x.com/i/status/1')).toEqual(['https://github.com/a/b'])
  })

  it('derives creation dates from Snowflake ids and refuses to invent older ones', () => {
    expect(snowflakeDate(ID_A).startsWith('2023-')).toBe(true)
    expect(snowflakeDate('20')).toBe('')
    expect(snowflakeDate('not-a-number')).toBe('')
  })
})

describe('X archive Likes', () => {
  it('reads like.js entries, keeping text and noting what’s missing', () => {
    const parsed = parseArchiveScript(likeJs([like(ID_A, 'Great Postgres indexing thread https://t.co/x https://github.com/pg/pg'), like(ID_B), { like: {} }]))
    expect(parsed.kind).toBe('likes')
    expect(parsed.items).toHaveLength(2)
    expect(parsed.skipped).toBe(1)
    expect(parsed.items[0]).toMatchObject({ id: ID_A, url: `https://x.com/i/web/status/${ID_A}`, links: ['https://github.com/pg/pg'] })
    expect(parsed.items[0].handle).toBeUndefined()
    expect(parsed.items[1].text).toBeUndefined()
  })

  it('rejects other archive files and damaged JSON with useful messages', () => {
    expect(() => parseArchiveScript('window.YTD.tweets.part0 = []')).toThrow(/not Likes/)
    expect(() => parseArchiveScript('window.YTD.like.part0 = [{"like": ')).toThrow(/damaged/)
    expect(() => parseFileText('script.js', 'console.log(1)')).toThrow(ImportError)
  })
})

describe('bookmark lists', () => {
  it('reads CSV with quoted fields and a url column', () => {
    const csv = `title,url,note\n"Thread, on ""AI agents""",https://x.com/ada/status/${ID_A},LLM eval notes\nnot a post,https://example.com,x\n`
    const parsed = parseCsv(csv)
    expect(parsed.items).toEqual([expect.objectContaining({ id: ID_A, handle: 'ada', text: 'LLM eval notes' })])
    expect(parsed.skipped).toBe(1)
  })

  it('explains CSVs it can’t use', () => {
    expect(() => parseCsv('title,notes\na,b\n')).toThrow(/url/)
    expect(() => parseCsv('url\n')).toThrow(/header row and at least one/)
    expect(() => parseCsv('url,title\n"https://x.com/a/status/1,unterminated\n')).toThrow(/unclosed quote/)
  })

  it('reads BKMK.exe exports, X API-shaped JSON and arrays of links', () => {
    const own = parseJson(JSON.stringify({ bookmarks: [{ id: ID_A, author: { handle: 'ada', name: 'Ada' }, text: 'rust tips', url: `https://x.com/ada/status/${ID_A}`, links: ['https://github.com/a/b'] }] }))
    expect(own.items[0]).toMatchObject({ id: ID_A, handle: 'ada', authorName: 'Ada', links: ['https://github.com/a/b'] })
    const api = parseJson(JSON.stringify({ data: [{ id: ID_B, text: 'hi', author_id: '9' }], includes: { users: [{ id: '9', username: 'grace', name: 'Grace' }] } }))
    expect(api.items[0]).toMatchObject({ id: ID_B, handle: 'grace', authorName: 'Grace', text: 'hi' })
    expect(parseJson(JSON.stringify([`https://x.com/a/status/${ID_A}`, 'nope'])).skipped).toBe(1)
    expect(() => parseJson('{oops')).toThrow(/valid JSON/)
    expect(() => parseJson('{"something": 1}')).toThrow(/No list of posts/)
  })

  it('reads browser bookmark HTML and pasted links, ignoring non-posts', () => {
    const html = `<DL><DT><A HREF="https://x.com/ada/status/${ID_A}">Ada on X</A><DT><A HREF="https://news.ycombinator.com">HN</A></DL>`
    expect(parseHtml(html)).toMatchObject({ items: [{ id: ID_A, handle: 'ada' }], skipped: 1 })
    expect(parseText(`look https://x.com/a/status/1 and https://example.com`)).toMatchObject({ items: [{ id: '1' }], skipped: 1 })
  })
})

describe('merging', () => {
  it('de-duplicates by post id, keeping the most detailed copy', () => {
    const a = parseText(`https://x.com/i/web/status/${ID_A}`)
    const b = parseArchiveScript(likeJs([like(ID_A, 'full text here'), like(ID_B, 'other')]))
    const { items, summary } = mergeParsed([a, b, parseText(`https://x.com/ada/status/${ID_A}`)])
    expect(items).toHaveLength(2)
    expect(summary).toMatchObject({ total: 2, duplicates: 2, withText: 2, withAuthor: 1, kind: 'bookmarks' })
    expect(items.find((i) => i.id === ID_A)).toMatchObject({ text: 'full text here', handle: 'ada' })
    // newest (largest id) first
    expect(items[0].id).toBe(ID_B)
  })

  it('caps very large imports to the newest posts and says so', () => {
    const many = Array.from({ length: MAX_ITEMS + 3 }, (_, i) => like(String(1_600_000_000_000_000_000n + BigInt(i)), 't'))
    const { items, summary } = mergeParsed([parseArchiveScript(likeJs(many))])
    expect(items).toHaveLength(MAX_ITEMS)
    expect(summary.truncated).toBe(3)
    expect(summary.kind).toBe('likes')
  })

  it('gives unknown authors an honest label, not a fake handle', () => {
    const [raw] = toRawBookmarks(parseArchiveScript(likeJs([like(ID_A, 'x')])).items)
    expect(raw.author).toEqual({ handle: '', name: 'Author not in import' })
    const result = analyze({ handle: 'me', displayName: 'me', isDemo: false, source: 'import', raw: [raw], coverage: 'complete', scannedAt: new Date().toISOString() })
    expect(result.stats.authorCount).toBe(0)
    expect(result.stats.accessible).toBe(1)
  })
})

describe('readImport', () => {
  const file = (name: string, body: string | Uint8Array) => new File([body as BlobPart], name)

  it('streams a zipped X archive, reading only Likes and the account handle', async () => {
    const zip = zipSync({
      'data/like.js': strToU8(likeJs([like(ID_A, 'react hooks deep dive')])),
      'data/like-part1.js': strToU8(likeJs([like(ID_B, 'kubernetes on a budget')]).replace('part0', 'part1')),
      'data/account.js': strToU8('window.YTD.account.part0 = [{"account":{"username":"ada_builds","accountDisplayName":"Ada"}}]'),
      'data/tweets.js': strToU8('window.YTD.tweets.part0 = []'),
      'data/tweets_media/big.jpg': new Uint8Array(1000),
    })
    const r = await readImport([file('twitter-2026.zip', zip)])
    expect(r.problems).toEqual([])
    expect(r.handle).toBe('ada_builds')
    expect(r.summary).toMatchObject({ kind: 'likes', total: 2, withText: 2 })
  })

  it('reports a zip with no Likes, and keeps going with the other files', async () => {
    const zip = zipSync({ 'data/tweets.js': strToU8('window.YTD.tweets.part0 = []') })
    const r = await readImport([file('archive.zip', zip), file('bad.json', '{nope'), file('list.txt', `https://x.com/a/status/${ID_A}`)])
    expect(r.problems.map((p) => p.file)).toEqual(['archive.zip', 'bad.json'])
    expect(r.problems[0].message).toMatch(/data\/like\.js/)
    expect(r.summary.total).toBe(1)
  })

  it('rejects a corrupt zip without crashing', async () => {
    const r = await readImport([file('broken.zip', new Uint8Array([80, 75, 3, 4, 1, 2, 3]))])
    expect(r.summary.total).toBe(0)
    expect(r.problems).toHaveLength(1)
  })

  it('returns an empty summary for an import with nothing usable', async () => {
    const r = await readImport([file('empty.txt', 'no links here')])
    expect(r.summary.total).toBe(0)
    expect(r.problems).toEqual([])
  })
})

describe('import scan service', () => {
  const run = () =>
    new Promise<ScanEvent[]>((resolve) => {
      const events: ScanEvent[] = []
      importScanService.start({ identity: { handle: 'me', displayName: 'me', isDemo: false }, scenario: 'normal' }, (e) => {
        events.push(e)
        if (e.type === 'done' || e.type === 'error') resolve(events)
      })
    })

  it('analyses locally with real counts and never touches the network', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { items, summary } = mergeParsed([parseArchiveScript(likeJs([like(ID_A, 'LLM agents and RAG evals'), like(ID_B, 'Figma design systems')]))])
    stageImport({ handle: 'me', displayName: 'Me', raw: toRawBookmarks(items), info: summary })
    const pending = run()
    await vi.runAllTimersAsync()
    const events = await pending
    vi.useRealTimers()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(events).toContainEqual({ type: 'progress', retrieved: 2, page: 1 })
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.result).toMatchObject({ isDemo: false, source: 'import', handle: 'me' })
      expect(done.result.importInfo?.kind).toBe('likes')
      expect(done.result.coverageNote).toMatch(/X’s archive doesn’t include bookmarks/)
    }
  })

  it('reports an empty import instead of an empty reveal', async () => {
    stageImport({ handle: 'me', displayName: 'Me', raw: [], info: mergeParsed([]).summary })
    expect((await run()).at(-1)).toMatchObject({ type: 'error', code: 'import-empty', retryable: false })
  })
})
