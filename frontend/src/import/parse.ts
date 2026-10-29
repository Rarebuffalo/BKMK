// Parsers for files a user already has, turned into posts BKMK.exe can analyse.
// Everything here runs in the browser: the file never leaves the device and no
// X API call is made. Each parser keeps only what the source actually contains.

import type { ImportInfo, RawBookmark } from '../domain/types'

/** What the imported items are. X's archive has Likes, not bookmarks. */
export type ImportKind = 'likes' | 'bookmarks'

export type ImportFormat = 'x-archive' | 'json' | 'csv' | 'html' | 'text' | 'paste'

export interface ImportItem {
  id: string
  url: string
  /** Post text when the source has it. */
  text?: string
  /** Author handle when the source has it (archive Likes don't). */
  handle?: string
  authorName?: string
  /** Real destinations only: t.co short links aren't resolvable offline. */
  links: string[]
  /** When the source shows the post's own timestamp (pasted pages); otherwise derived from the id. */
  createdAt?: string
}

export interface ParsedFile {
  kind: ImportKind
  format: ImportFormat
  items: ImportItem[]
  /** Entries that weren't X posts or couldn't be read. */
  skipped: number
}

export class ImportError extends Error {}

const STATUS_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:([A-Za-z0-9_]{1,15})|i\/web|i)\/status(?:es)?\/(\d{1,20})/i
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g
const RESERVED = new Set(['i', 'home', 'search', 'explore', 'settings', 'intent', 'share'])

/** Parses an X post URL. Returns null for anything that isn't one. */
export function parsePostUrl(url: string): { id: string; handle?: string } | null {
  const m = STATUS_RE.exec(url.trim())
  if (!m) return null
  const handle = m[1] && !RESERVED.has(m[1].toLowerCase()) ? m[1] : undefined
  return { id: m[2], handle }
}

export function canonicalUrl(id: string, handle?: string) {
  return `https://x.com/${handle ?? 'i/web'}/status/${id}`
}

/** Link targets worth classifying: not X itself and not unresolvable t.co short links. */
export function contentLinks(text: string): string[] {
  const out: string[] = []
  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(/[.,;:!?]+$/, '')
    let host = ''
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (host === 't.co' || host === 'x.com' || host === 'twitter.com' || host === 'pic.x.com' || host === 'pic.twitter.com') continue
    if (!out.includes(url)) out.push(url)
  }
  return out
}

/** X post IDs are Snowflakes: the post's creation time is encoded in them (from Nov 2010). */
export function snowflakeDate(id: string): string {
  try {
    const n = BigInt(id)
    if (n < 29_700_859_247n) return '' // pre-Snowflake id: no date to recover
    return new Date(Number(n >> 22n) + 1288834974657).toISOString()
  } catch {
    return ''
  }
}

// ── X archive (data/like.js, like-part1.js…, bookmark.js if X ever adds it) ──

const YTD_RE = /^\s*window\.YTD\.([A-Za-z_]+)\.part\d+\s*=\s*/

export function isArchiveScript(text: string) {
  return YTD_RE.test(text)
}

export function parseArchiveScript(text: string): ParsedFile {
  const m = YTD_RE.exec(text)
  if (!m) throw new ImportError('This isn’t an X archive data file (expected window.YTD…).')
  const name = m[1].toLowerCase()
  if (name !== 'like' && name !== 'bookmark') {
    throw new ImportError(`This archive file holds “${m[1]}”, not Likes. Pick data/like.js from your archive.`)
  }
  let entries: unknown
  try {
    entries = JSON.parse(text.slice(m[0].length).trim().replace(/;\s*$/, ''))
  } catch {
    throw new ImportError('The archive file is damaged or incomplete — it couldn’t be read as JSON.')
  }
  if (!Array.isArray(entries)) throw new ImportError('The archive file has an unexpected shape.')
  const items: ImportItem[] = []
  let skipped = 0
  for (const entry of entries) {
    const rec = (entry as Record<string, unknown> | null)?.[name] as Record<string, unknown> | undefined
    const id = typeof rec?.tweetId === 'string' ? rec.tweetId : null
    if (!id || !/^\d{1,20}$/.test(id)) {
      skipped++
      continue
    }
    const fromUrl = typeof rec?.expandedUrl === 'string' ? parsePostUrl(rec.expandedUrl) : null
    const text = typeof rec?.fullText === 'string' ? rec.fullText : undefined
    items.push({ id, url: canonicalUrl(id, fromUrl?.handle), text, handle: fromUrl?.handle, links: text ? contentLinks(text) : [] })
  }
  return { kind: name === 'like' ? 'likes' : 'bookmarks', format: 'x-archive', items, skipped }
}

// ── JSON: BKMK.exe exports, X API-shaped dumps, or a plain array of records ──

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = o[k] ?? o[k.toLowerCase()]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function fromRecord(o: Record<string, unknown>, users?: Map<string, { username?: string; name?: string }>): ImportItem | null {
  const author = (o.author && typeof o.author === 'object' ? o.author : {}) as Record<string, unknown>
  const url = pick(o, ['url', 'URL', 'link', 'Link', 'tweet_url', 'tweetUrl', 'expandedUrl'])
  const parsed = url ? parsePostUrl(url) : null
  const rawId = pick(o, ['tweetId', 'tweet_id', 'xPostId', 'x_post_id']) ?? (typeof o.id === 'string' && /^\d{1,20}$/.test(o.id) ? o.id : undefined)
  const id = parsed?.id ?? rawId
  if (!id || !/^\d{1,20}$/.test(id)) return null
  const user = typeof o.author_id === 'string' ? users?.get(o.author_id) : undefined
  const handle = parsed?.handle ?? pick(author, ['handle', 'username']) ?? user?.username ?? pick(o, ['author_handle', 'username', 'screen_name'])
  const text = pick(o, ['text', 'fullText', 'full_text', 'Text', 'note', 'excerpt', 'Title', 'title'])
  const extra = Array.isArray(o.links) ? o.links.filter((l): l is string => typeof l === 'string') : []
  return {
    id,
    url: canonicalUrl(id, handle),
    text,
    handle,
    authorName: pick(author, ['name']) ?? user?.name ?? pick(o, ['author_name']),
    links: [...new Set([...extra.filter((l) => contentLinks(l).length > 0), ...(text ? contentLinks(text) : [])])],
  }
}

export function parseJson(text: string): ParsedFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ImportError('This file isn’t valid JSON.')
  }
  let records: unknown[] = []
  let users: Map<string, { username?: string; name?: string }> | undefined
  if (Array.isArray(data)) records = data
  else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.bookmarks)) records = o.bookmarks // BKMK.exe export
    else if (Array.isArray(o.data)) {
      records = o.data // X API-shaped dump
      const inc = (o.includes as { users?: { id: string; username?: string; name?: string }[] } | undefined)?.users
      if (Array.isArray(inc)) users = new Map(inc.map((u) => [u.id, u]))
    } else if (Array.isArray(o.items)) records = o.items
  }
  if (!records.length && !Array.isArray(data)) throw new ImportError('No list of posts found in this JSON file.')
  const items: ImportItem[] = []
  let skipped = 0
  for (const r of records) {
    const item = r && typeof r === 'object' ? fromRecord(r as Record<string, unknown>, users) : typeof r === 'string' ? fromUrlOnly(r) : null
    if (item) items.push(item)
    else skipped++
  }
  return { kind: 'bookmarks', format: 'json', items, skipped }
}

function fromUrlOnly(url: string): ImportItem | null {
  const p = parsePostUrl(url)
  return p ? { id: p.id, url: canonicalUrl(p.id, p.handle), handle: p.handle, links: [] } : null
}

// ── CSV (Raindrop, Readwise Reader, spreadsheets): needs a URL column ──

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (quoted) throw new ImportError('The CSV has an unclosed quote — the file may be cut off.')
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

export function parseCsv(text: string): ParsedFile {
  const rows = parseCsvRows(text.replace(/^﻿/, ''))
  if (rows.length < 2) throw new ImportError('The CSV needs a header row and at least one post.')
  const header = rows[0].map((h) => h.trim())
  const urlCol = header.findIndex((h) => /^(url|link|tweet[ _]?url|expandedurl)$/i.test(h))
  if (urlCol < 0) throw new ImportError('The CSV has no “url” or “link” column, so posts can’t be identified.')
  const items: ImportItem[] = []
  let skipped = 0
  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(header.map((h, i) => [h, row[i] ?? '']))
    const item = fromRecord(record)
    if (item) items.push(item)
    else skipped++
  }
  return { kind: 'bookmarks', format: 'csv', items, skipped }
}

// ── Browser bookmarks export (Netscape HTML) and plain lists of links ──

export function parseHtml(text: string): ParsedFile {
  const items: ImportItem[] = []
  let skipped = 0
  for (const m of text.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi)) {
    const p = parsePostUrl(m[1].replace(/&amp;/g, '&'))
    if (!p) {
      skipped++
      continue
    }
    items.push({ id: p.id, url: canonicalUrl(p.id, p.handle), handle: p.handle, links: [] })
  }
  if (!items.length && !skipped) throw new ImportError('No links found in this HTML file.')
  return { kind: 'bookmarks', format: 'html', items, skipped }
}

export function parseText(text: string): ParsedFile {
  const items: ImportItem[] = []
  let skipped = 0
  for (const url of text.match(URL_RE) ?? []) {
    const item = fromUrlOnly(url)
    if (item) items.push(item)
    else skipped++
  }
  return { kind: 'bookmarks', format: 'text', items, skipped }
}

/** Picks a parser from the file name and content. */
export function parseFileText(name: string, text: string): ParsedFile {
  const lower = name.toLowerCase()
  const body = text.replace(/^﻿/, '')
  if (isArchiveScript(body)) return parseArchiveScript(body)
  if (lower.endsWith('.js')) throw new ImportError('This .js file isn’t from an X archive. Pick data/like.js.')
  if (lower.endsWith('.json') || /^\s*[[{]/.test(body)) return parseJson(body)
  if (lower.endsWith('.csv')) return parseCsv(body)
  if (lower.endsWith('.html') || lower.endsWith('.htm') || /<a\s/i.test(body)) return parseHtml(body)
  return parseText(body)
}

// ── Merge, de-duplicate and turn into analysable posts ──

export type ImportSummary = ImportInfo

export const MAX_ITEMS = 5000

/** Merges parsed files: same post id = one post, keeping whichever copy has more detail. */
export function mergeParsed(files: ParsedFile[]): { items: ImportItem[]; summary: ImportSummary } {
  const byId = new Map<string, ImportItem>()
  let duplicates = 0
  for (const f of files) {
    for (const item of f.items) {
      const prev = byId.get(item.id)
      if (!prev) {
        byId.set(item.id, item)
        continue
      }
      duplicates++
      byId.set(item.id, {
        ...prev,
        text: prev.text ?? item.text,
        handle: prev.handle ?? item.handle,
        authorName: prev.authorName ?? item.authorName,
        url: prev.handle ? prev.url : item.url,
        links: prev.links.length ? prev.links : item.links,
        createdAt: prev.createdAt ?? item.createdAt,
      })
    }
  }
  // Newest first by Snowflake id; huge imports keep the most recent MAX_ITEMS.
  const all = [...byId.values()].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0))
  const items = all.slice(0, MAX_ITEMS)
  const kinds = new Set(files.map((f) => f.kind))
  return {
    items,
    summary: {
      kind: kinds.size === 1 && kinds.has('likes') ? 'likes' : 'bookmarks',
      formats: [...new Set(files.map((f) => f.format))],
      files: files.length,
      total: items.length,
      duplicates,
      skipped: files.reduce((n, f) => n + f.skipped, 0),
      withText: items.filter((i) => i.text).length,
      withAuthor: items.filter((i) => i.handle).length,
      withDate: items.filter((i) => i.createdAt || snowflakeDate(i.id)).length,
      truncated: all.length - items.length,
    },
  }
}

export function toRawBookmarks(items: ImportItem[]): RawBookmark[] {
  return items.map((i) => ({
    id: i.id,
    author: { handle: i.handle ?? '', name: i.authorName ?? (i.handle ? `@${i.handle}` : 'Author not in import') },
    text: i.text ?? '',
    createdAt: i.createdAt ?? snowflakeDate(i.id),
    url: i.url,
    links: i.links,
    accessible: true,
  }))
}
