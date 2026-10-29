import { describe, expect, it } from 'vitest'
import { mergeParsed, toRawBookmarks } from './parse'
import { parseClipboard, parsePastedHtml, parsePastedText } from './paste'

// Synthetic markup modelled on x.com's two known shapes. No real post content.

/** Logged-in timeline shape: data-testid hooks, <time> inside the permalink, t.co links showing their destination. */
const loggedInPost = (id: string, handle: string, name: string, body: string, extra = '') => `
<div data-testid="cellInnerDiv"><article data-testid="tweet" role="article">
  <div data-testid="User-Name">
    <a href="/${handle}" role="link"><span>${name}</span></a>
    <a href="/${handle}" role="link"><span>@${handle}</span></a>
    <a href="/${handle}/status/${id}" role="link"><time datetime="2026-09-14T08:30:00.000Z">Sep 14</time></a>
  </div>
  <div data-testid="tweetText" lang="en" dir="auto">${body}</div>
  ${extra}
  <div role="group"><button data-testid="reply"><span>12</span></button><button data-testid="bookmark"><span>3</span></button></div>
</article></div>`

/** Logged-out shape (as seen on a public post page): no testids, date text inside the permalink. */
const loggedOutPost = (id: string, handle: string, name: string, body: string) => `
<article><div><a href="/${handle}">${name}</a><a href="/${handle}">@${handle}</a></div>
  <div dir="auto">${body}</div>
  <div><a href="/${handle}/status/${id}">2:20 PM · Mar 3, 2024</a></div>
  <div role="group"><a href="/compose/post?in_reply_to=${id}">18K</a></div>
</article>`

describe('pasted X bookmarks (rich HTML)', () => {
  it('reads id, author, timestamp, text and real link destinations from the logged-in layout', () => {
    const html = `<nav><a href="/home">Home</a><a href="/i/bookmarks">Bookmarks</a></nav>
      ${loggedInPost('1850000000000000001', 'ada', 'Ada L', 'Evals for LLM agents <a href="https://t.co/AbC">github.com/ada/evals…</a> <a href="/hashtag/ai">#ai</a>')}
      ${loggedInPost('1850000000000000002', 'grace', 'Grace H', 'Compilers are fun', '<div data-testid="card.wrapper"><a href="https://t.co/Zz9">arxiv.org/abs/2401.00001</a></div>')}`
    const items = parsePastedHtml(html)
    expect(items).toEqual([
      {
        id: '1850000000000000001',
        url: 'https://x.com/ada/status/1850000000000000001',
        handle: 'ada',
        authorName: 'Ada L',
        text: 'Evals for LLM agents github.com/ada/evals… #ai',
        links: ['https://github.com/ada/evals'],
        createdAt: '2026-09-14T08:30:00.000Z',
      },
      expect.objectContaining({ id: '1850000000000000002', handle: 'grace', links: ['https://arxiv.org/abs/2401.00001'] }),
    ])
  })

  it('treats a quoted post as part of the bookmark, not a second bookmark', () => {
    const quote = `<div role="link"><article data-testid="tweet">${'<a href="/bob/status/1700000000000000009"><time datetime="2025-01-01T00:00:00Z">Jan 1</time></a>'}<div data-testid="tweetText" lang="en">the quoted take</div></article></div>`
    const items = parsePastedHtml(loggedInPost('1850000000000000003', 'ada', 'Ada', 'Hot take on this', quote))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: '1850000000000000003', text: 'Hot take on this' })
  })

  it('reads the logged-out layout without testids or <time>', () => {
    const items = parsePastedHtml(loggedOutPost('1650000000000000004', 'jack', 'jack', 'just setting up'))
    expect(items).toEqual([expect.objectContaining({ id: '1650000000000000004', handle: 'jack', authorName: 'jack', text: 'just setting up' })])
    expect(items[0].createdAt).toBeUndefined() // falls back to the Snowflake date later
    expect(toRawBookmarks(items)[0].createdAt.startsWith('2023-')).toBe(true)
  })

  it('accepts absolute permalinks (browsers often absolutise copied links)', () => {
    const html = loggedInPost('1850000000000000005', 'ada', 'Ada', 'x').replace('href="/ada/status/', 'href="https://x.com/ada/status/')
    expect(parsePastedHtml(html)[0].id).toBe('1850000000000000005')
  })

  it('ignores pastes with no posts in them', () => {
    expect(parsePastedHtml('<p>hello <a href="https://example.com">site</a> <a href="/i/status/1">x</a></p>')).toEqual([])
    expect(parseClipboard({ html: '<p>nothing</p>', text: 'nothing' })).toEqual({ items: [], mode: 'none' })
  })

  it('merges repeated pastes of overlapping screens without duplicates', () => {
    const first = parsePastedHtml(loggedInPost('1850000000000000001', 'ada', 'Ada', 'one') + loggedInPost('1850000000000000002', 'ada', 'Ada', 'two'))
    const second = parsePastedHtml(loggedInPost('1850000000000000002', 'ada', 'Ada', 'two') + loggedInPost('1850000000000000003', 'ada', 'Ada', 'three'))
    const { items, summary } = mergeParsed([
      { kind: 'bookmarks', format: 'paste', items: first, skipped: 0 },
      { kind: 'bookmarks', format: 'paste', items: second, skipped: 0 },
    ])
    expect(items.map((i) => i.id)).toEqual(['1850000000000000003', '1850000000000000002', '1850000000000000001'])
    expect(summary).toMatchObject({ total: 3, duplicates: 1, withText: 3, withAuthor: 3, withDate: 3 })
  })
})

describe('pasted plain text', () => {
  it('falls back to post links when only text is on the clipboard', () => {
    expect(parsePastedText('see https://x.com/ada/status/123 and https://x.com/home')).toEqual([
      { id: '123', url: 'https://x.com/ada/status/123', handle: 'ada', links: [] },
    ])
    expect(parseClipboard({ html: '', text: 'https://twitter.com/ada/status/123' }).mode).toBe('text')
  })
})
