// ImportRecord v1: the contract an approved retrieval mechanism (a future browser
// extension, say) uses to hand bookmarks to BKMK.exe. Everything arriving here is
// untrusted: each record is checked field by field and turned into the same
// ImportItem the file importers produce, so the existing pipeline does the rest.

import { canonicalUrl, MAX_ITEMS, type ImportItem } from './parse'

export const IMPORT_SCHEMA = 'bkmk.import/v1'

/** One bookmarked post, as the sender delivers it. Only `id` and `url` are required. */
export interface ImportRecordV1 {
  /** X post id: 1–20 digits. */
  id: string
  /** The post's permalink on x.com or twitter.com; its id must match `id`. */
  url: string
  text?: string
  author?: { handle?: string; name?: string }
  /** When the post was created (ISO 8601). X doesn't expose when it was bookmarked. */
  createdAt?: string
  /** Real link destinations in the post (http/https). */
  links?: string[]
}

/** Why an import ended before the whole collection arrived. */
export type StopReason =
  // Reported by the sender.
  | 'rate_limited'
  | 'verification_required'
  | 'source_error'
  | 'user_cancelled'
  // Decided by BKMK.exe.
  | 'interrupted'
  | 'protocol_error'
  | 'item_limit'
  | 'cancelled'

export const SENDER_STOP_REASONS: readonly StopReason[] = ['rate_limited', 'verification_required', 'source_error', 'user_cancelled']

export const STOP_REASON_COPY: Record<StopReason, string> = {
  rate_limited: 'the source was rate-limited and stopped instead of retrying',
  verification_required: 'the source asked for verification, so the import stopped',
  source_error: 'the source reported an error',
  user_cancelled: 'the import was cancelled at the source',
  interrupted: 'the connection to the import source was lost',
  protocol_error: 'the import source sent data BKMK.exe couldn’t accept',
  item_limit: `the ${MAX_ITEMS.toLocaleString('en')}-bookmark import limit was reached`,
  cancelled: 'you stopped the import',
}

export const LIMITS = {
  items: MAX_ITEMS,
  batchRecords: 500,
  /** Serialized size of one message. 500 records at the text limit would exceed it, so huge batches are refused. */
  messageBytes: 2 * 1024 * 1024,
  /** X's long posts top out at 25,000 characters. */
  text: 25_000,
  name: 100,
  links: 25,
  url: 2048,
  /** A runaway sender can't keep BKMK.exe polling forever. */
  batches: 1000,
} as const

const ID_RE = /^[1-9]\d{0,19}$/
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/
const PERMALINK_RE = /^\/(?:([A-Za-z0-9_]{1,15})|i(?:\/web)?)\/status\/(\d{1,20})\/?$/
const X_HOSTS = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
const RECORD_KEYS = new Set(['id', 'url', 'text', 'author', 'createdAt', 'links'])
const AUTHOR_KEYS = new Set(['handle', 'name'])
const EARLIEST_POST = Date.UTC(2006, 2, 21)
// C0 controls other than tab, newline and carriage return, plus DEL: never meaningful in post text.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export type RecordResult = { ok: true; item: ImportItem } | { ok: false; reason: string }

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype

function cleanText(value: string, max: number): string | null {
  const text = value.replace(CONTROL_RE, '').trim()
  return text.length > max ? null : text
}

function linkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > LIMITS.url) return null
  try {
    const u = new URL(value)
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null
    return u.href
  } catch {
    return null
  }
}

/** Validates one record. Unknown fields are refused rather than ignored, so a sender can't smuggle data in. */
export function validateRecord(raw: unknown): RecordResult {
  if (!isPlainObject(raw)) return { ok: false, reason: 'not an object' }
  const extra = Object.keys(raw).find((k) => !RECORD_KEYS.has(k))
  if (extra) return { ok: false, reason: `unexpected field "${extra.slice(0, 40)}"` }

  const { id, url, text, author, createdAt, links } = raw
  if (typeof id !== 'string' || !ID_RE.test(id)) return { ok: false, reason: 'missing or invalid id' }

  if (typeof url !== 'string' || url.length > LIMITS.url) return { ok: false, reason: 'missing or invalid url' }
  let permalink: RegExpExecArray | null = null
  try {
    const u = new URL(url)
    if (u.protocol === 'https:' && X_HOSTS.has(u.hostname) && !u.username && !u.password) permalink = PERMALINK_RE.exec(u.pathname)
  } catch {
    // falls through to the error below
  }
  if (!permalink) return { ok: false, reason: 'url is not an X post permalink' }
  if (permalink[2] !== id) return { ok: false, reason: 'url doesn’t match id' }

  const item: ImportItem = { id, url: '', links: [] }

  if (text !== undefined) {
    if (typeof text !== 'string') return { ok: false, reason: 'text must be a string' }
    const clean = cleanText(text, LIMITS.text)
    if (clean === null) return { ok: false, reason: 'text is too long' }
    if (clean) item.text = clean
  }

  if (author !== undefined) {
    if (!isPlainObject(author)) return { ok: false, reason: 'author must be an object' }
    const extraAuthor = Object.keys(author).find((k) => !AUTHOR_KEYS.has(k))
    if (extraAuthor) return { ok: false, reason: `unexpected author field "${extraAuthor.slice(0, 40)}"` }
    if (author.handle !== undefined) {
      if (typeof author.handle !== 'string') return { ok: false, reason: 'invalid author handle' }
      const h = author.handle.replace(/^@/, '')
      if (!HANDLE_RE.test(h)) return { ok: false, reason: 'invalid author handle' }
      item.handle = h
    }
    if (author.name !== undefined) {
      if (typeof author.name !== 'string') return { ok: false, reason: 'invalid author name' }
      const name = cleanText(author.name, LIMITS.name)
      if (name === null) return { ok: false, reason: 'author name is too long' }
      if (name) item.authorName = name
    }
  }
  // The permalink's handle is a fallback author; a stated handle wins.
  if (!item.handle && permalink[1]) item.handle = permalink[1]
  item.url = canonicalUrl(id, item.handle)

  if (createdAt !== undefined) {
    if (typeof createdAt !== 'string' || !ISO_RE.test(createdAt)) return { ok: false, reason: 'invalid createdAt' }
    const t = Date.parse(createdAt)
    if (Number.isNaN(t) || t < EARLIEST_POST || t > Date.now() + 24 * 3600 * 1000) return { ok: false, reason: 'createdAt is out of range' }
    item.createdAt = new Date(t).toISOString()
  }

  if (links !== undefined) {
    if (!Array.isArray(links)) return { ok: false, reason: 'links must be a list' }
    if (links.length > LIMITS.links) return { ok: false, reason: 'too many links' }
    const out: string[] = []
    for (const l of links) {
      const href = linkUrl(l)
      if (!href) return { ok: false, reason: 'invalid link url' }
      if (!out.includes(href)) out.push(href)
    }
    item.links = out
  }

  return { ok: true, item }
}

/** Serialized size of a message, or null when it can't be serialized (cycles, BigInt). */
export function messageSize(value: unknown): number | null {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? null : new TextEncoder().encode(json).length
  } catch {
    return null
  }
}
