import { describe, expect, it } from 'vitest'
import { INVALID_RECORDS, syntheticRecords } from './mockBridge'
import { LIMITS, messageSize, validateRecord } from './record'

const ok = (raw: unknown) => {
  const r = validateRecord(raw)
  if (!r.ok) throw new Error(`expected valid, got: ${r.reason}`)
  return r.item
}
const reason = (raw: unknown) => {
  const r = validateRecord(raw)
  if (r.ok) throw new Error('expected rejection')
  return r.reason
}

describe('ImportRecord v1 validation', () => {
  it('turns a valid record into the same ImportItem the file importers produce', () => {
    expect(
      ok({
        id: '1850000000000000001',
        url: 'https://twitter.com/ada/status/1850000000000000001',
        text: '  Postgres indexing notes  ',
        author: { handle: '@ada', name: 'Ada' },
        createdAt: '2026-10-01T12:00:00Z',
        links: ['https://github.com/a/b', 'https://github.com/a/b'],
      }),
    ).toEqual({
      id: '1850000000000000001',
      url: 'https://x.com/ada/status/1850000000000000001',
      text: 'Postgres indexing notes',
      handle: 'ada',
      authorName: 'Ada',
      createdAt: '2026-10-01T12:00:00.000Z',
      links: ['https://github.com/a/b'],
    })
  })

  it('needs only id and url; the permalink handle stands in for a missing author', () => {
    expect(ok({ id: '42', url: 'https://x.com/grace/status/42' })).toEqual({ id: '42', url: 'https://x.com/grace/status/42', handle: 'grace', links: [] })
    expect(ok({ id: '43', url: 'https://x.com/i/web/status/43' })).toEqual({ id: '43', url: 'https://x.com/i/web/status/43', links: [] })
  })

  it('accepts every synthetic record the mock source generates', () => {
    for (const r of syntheticRecords(300)) expect(validateRecord(r).ok).toBe(true)
  })

  it('rejects invalid or missing ids', () => {
    expect(reason({ url: 'https://x.com/a/status/1' })).toMatch(/id/)
    expect(reason({ id: 1, url: 'https://x.com/a/status/1' })).toMatch(/id/)
    expect(reason({ id: '0', url: 'https://x.com/a/status/0' })).toMatch(/id/)
    expect(reason({ id: '1'.repeat(21), url: 'https://x.com/a/status/1' })).toMatch(/id/)
  })

  it('rejects urls that aren’t this post’s permalink on x.com or twitter.com', () => {
    expect(reason({ id: '5' })).toMatch(/url/)
    expect(reason({ id: '5', url: 'http://x.com/a/status/5' })).toMatch(/permalink/)
    expect(reason({ id: '5', url: 'https://x.com.example.org/a/status/5' })).toMatch(/permalink/)
    expect(reason({ id: '5', url: 'https://user:pw@x.com/a/status/5' })).toMatch(/permalink/)
    expect(reason({ id: '5', url: 'https://x.com/a/likes' })).toMatch(/permalink/)
    expect(reason({ id: '5', url: 'https://x.com/a/status/6' })).toMatch(/match/)
    expect(reason({ id: '5', url: `https://x.com/a/status/5?${'q'.repeat(LIMITS.url)}` })).toMatch(/url/)
  })

  it('rejects oversized text and names', () => {
    expect(reason({ id: '7', url: 'https://x.com/a/status/7', text: 'x'.repeat(LIMITS.text + 1) })).toMatch(/too long/)
    expect(ok({ id: '7', url: 'https://x.com/a/status/7', text: 'x'.repeat(LIMITS.text) }).text).toHaveLength(LIMITS.text)
    expect(reason({ id: '7', url: 'https://x.com/a/status/7', author: { name: 'n'.repeat(LIMITS.name + 1) } })).toMatch(/too long/)
  })

  it('rejects invalid and out-of-range dates', () => {
    for (const createdAt of ['yesterday', '2026-10-01', '2026-13-01T00:00:00Z', '1999-01-01T00:00:00Z', '2999-01-01T00:00:00Z', 12345]) {
      expect(reason({ id: '8', url: 'https://x.com/a/status/8', createdAt })).toMatch(/createdAt/)
    }
  })

  it('refuses unexpected fields instead of ignoring them', () => {
    expect(reason({ id: '9', url: 'https://x.com/a/status/9', extra: 1 })).toMatch(/unexpected field "extra"/)
    expect(reason({ id: '9', url: 'https://x.com/a/status/9', author: { handle: 'a', avatar: 'x' } })).toMatch(/unexpected author field/)
  })

  it('rejects malformed values', () => {
    for (const raw of [null, 'record', 42, [], { id: '9', url: 'https://x.com/a/status/9', text: 5 }, { id: '9', url: 'https://x.com/a/status/9', author: 'a' }]) {
      expect(validateRecord(raw).ok).toBe(false)
    }
    expect(reason({ id: '9', url: 'https://x.com/a/status/9', author: { handle: 'not a handle!' } })).toMatch(/handle/)
    expect(reason({ id: '9', url: 'https://x.com/a/status/9', links: 'https://a.b' })).toMatch(/list/)
    expect(reason({ id: '9', url: 'https://x.com/a/status/9', links: ['ftp://a.b/c'] })).toMatch(/link/)
    expect(reason({ id: '9', url: 'https://x.com/a/status/9', links: Array.from({ length: LIMITS.links + 1 }, (_, i) => `https://a.b/${i}`) })).toMatch(/too many/)
  })

  it('keeps untrusted text as inert text, removing only control characters', () => {
    const item = ok({ id: '10', url: 'https://x.com/a/status/10', text: 'Use <div> & <span> tags\u0000 here\u0007\nnext line', author: { name: 'A <b>name</b>' } })
    expect(item.text).toBe('Use <div> & <span> tags here\nnext line')
    expect(item.authorName).toBe('A <b>name</b>')
  })

  it('rejects every record in the shared invalid fixture', () => {
    for (const raw of INVALID_RECORDS) expect(validateRecord(raw).ok).toBe(false)
  })

  it('measures message size and flags unserializable messages', () => {
    expect(messageSize({ a: 'é' })).toBe(JSON.stringify({ a: 'é' }).length + 1)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(messageSize(cyclic)).toBeNull()
    expect(messageSize(10n)).toBeNull()
  })
})
