// "Copy from X, paste here": turns what a user copied from their own X bookmarks
// page into posts. BKMK.exe never contacts X. The user selects and copies what is
// already on their screen; we only read the clipboard they paste into this page.
//
// x.com's markup differs between logged-in and logged-out views and changes over
// time, so this keys off stable, user-visible structure (post permalinks, author
// links, <time>) rather than one exact DOM shape, and falls back gracefully.

import { canonicalUrl, type ImportItem } from './parse'

export interface PasteResult {
  items: ImportItem[]
  /** How the clipboard was read: rich HTML (ids, links) or plain text only. */
  mode: 'html' | 'text' | 'none'
}

const PERMALINK = /^(?:https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com)?\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})\/?(?:[?#].*)?$/i
const RESERVED = new Set(['i', 'home', 'search', 'explore', 'settings', 'intent', 'share', 'compose', 'messages', 'notifications'])

function permalink(a: Element): { handle: string; id: string } | null {
  const m = PERMALINK.exec(a.getAttribute('href') ?? '')
  if (!m || RESERVED.has(m[1].toLowerCase())) return null
  return { handle: m[1], id: m[2] }
}

/** Visible link text like "github.com/a/b…" is the real destination behind a t.co link. */
function destination(a: Element): string | null {
  const href = a.getAttribute('href') ?? ''
  const shown = (a.textContent ?? '').trim().replace(/…$/, '')
  let host = ''
  try {
    host = new URL(href, 'https://x.com').hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  if (host === 't.co') {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(shown.replace(/^https?:\/\//, ''))) return null
    return shown.startsWith('http') ? shown : `https://${shown}`
  }
  if (host === 'x.com' || host === 'twitter.com' || href.startsWith('/')) return null
  return href
}

/** The outermost post containers in the copied fragment. Quoted posts nested inside are not separate saves. */
function postContainers(root: ParentNode): Element[] {
  const articles = [...root.querySelectorAll('article')].filter((a) => !a.parentElement?.closest('article'))
  if (articles.length) return articles
  // Rich text without <article>: one container per distinct permalink's nearest block.
  const seen = new Set<string>()
  const out: Element[] = []
  for (const a of root.querySelectorAll('a[href]')) {
    const p = permalink(a)
    if (!p || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(a.closest('div, li, section, p') ?? a)
  }
  return out
}

function fromContainer(el: Element): ImportItem | null {
  const anchors = [...el.querySelectorAll('a[href]')]
  // A post's own permalink wraps its timestamp; quoted posts sit inside a nested link/region.
  const own =
    anchors.find((a) => permalink(a) && a.querySelector('time')) ??
    anchors.find((a) => permalink(a) && !a.closest('[role="link"]') && /\d/.test(a.textContent ?? '')) ??
    anchors.find((a) => permalink(a))
  const p = own ? permalink(own) : null
  if (!p) return null

  const quoted = (n: Element) => n !== el && !!n.closest('[role="link"], article article')
  const textEl =
    [...el.querySelectorAll('[data-testid="tweetText"], div[lang]')].find((n) => !quoted(n)) ??
    [...el.querySelectorAll('div[dir="auto"]')].find((n) => !quoted(n) && !n.closest('a') && (n.textContent ?? '').trim().length > 0)
  const text = textEl?.textContent?.replace(/\s+\n/g, '\n').trim() || undefined

  const nameLink = anchors.find((a) => {
    const href = a.getAttribute('href') ?? ''
    const t = (a.textContent ?? '').trim()
    return (href === `/${p.handle}` || href.endsWith(`x.com/${p.handle}`)) && t && !t.startsWith('@')
  })
  const time = own?.querySelector('time')?.getAttribute('datetime') ?? ''
  const links = [
    ...new Set([...(textEl?.querySelectorAll('a[href]') ?? []), ...el.querySelectorAll('[data-testid="card.wrapper"] a[href]')].map(destination).filter((d): d is string => !!d)),
  ]
  return {
    id: p.id,
    url: canonicalUrl(p.id, p.handle),
    text,
    handle: p.handle,
    authorName: nameLink?.textContent?.trim() || undefined,
    links,
    // Prefer the page's own timestamp; the Snowflake id is the fallback.
    ...(time && !Number.isNaN(Date.parse(time)) ? { createdAt: new Date(time).toISOString() } : {}),
  }
}

/** Parses rich clipboard HTML copied from x.com. */
export function parsePastedHtml(html: string): ImportItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const items: ImportItem[] = []
  const seen = new Set<string>()
  for (const c of postContainers(doc.body)) {
    const item = fromContainer(c)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      items.push(item)
    }
  }
  return items
}

/** Plain-text paste (no HTML on the clipboard): only post links can be identified reliably. */
export function parsePastedText(text: string): ImportItem[] {
  const items: ImportItem[] = []
  const seen = new Set<string>()
  for (const raw of text.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? []) {
    const m = PERMALINK.exec(raw)
    if (!m || seen.has(m[2]) || RESERVED.has(m[1].toLowerCase())) continue
    seen.add(m[2])
    items.push({ id: m[2], url: canonicalUrl(m[2], m[1]), handle: m[1], links: [] })
  }
  return items
}

/** Reads a paste event's clipboard: HTML when the browser provides it, otherwise text. */
export function parseClipboard(data: { html: string; text: string }): PasteResult {
  if (data.html.trim()) {
    const items = parsePastedHtml(data.html)
    if (items.length) return { items, mode: 'html' }
  }
  const items = parsePastedText(data.text)
  return { items, mode: items.length ? 'text' : 'none' }
}

