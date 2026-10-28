import { describe, expect, it } from 'vitest'
import { analyze } from '../domain/analyze'
import { generateDemoBookmarks } from '../data/demoProfile'
import { applyFilters, EMPTY_FILTERS } from './filters'
import { normalizeHandle, validateHandle } from './handle'
import { demoLibrary } from './librarySource'

describe('handle validation', () => {
  it.each([
    ['@ada_builds', 'ada_builds'],
    ['ada', 'ada'],
    ['https://x.com/Ada_1?s=20', 'Ada_1'],
    ['twitter.com/someone', 'someone'],
  ])('normalises %s', (input, out) => {
    expect(normalizeHandle(input)).toBe(out)
    expect(validateHandle(input)).toEqual({ ok: true, handle: out })
  })

  it('rejects bad characters, long handles and empty input', () => {
    expect(validateHandle('bad handle!')).toMatchObject({ ok: false })
    expect(validateHandle('a'.repeat(16))).toMatchObject({ ok: false, reason: expect.stringMatching(/15/) })
    expect(validateHandle('   ')).toEqual({ ok: null })
  })
})

const result = analyze({ handle: 'demo', displayName: 'demo', isDemo: true, raw: generateDemoBookmarks('demo', 'builder'), coverage: 'complete', scannedAt: 'x' })
const NOW = Date.UTC(2026, 9, 28)

describe('library filters', () => {
  it('searches every term across text and authors', () => {
    const out = applyFilters(result.bookmarks, { ...EMPTY_FILTERS, q: 'postgres latency' }, NOW)
    expect(out.length).toBeGreaterThan(0)
    for (const b of out) expect(`${b.text} ${b.author.handle} ${b.author.name}`.toLowerCase()).toMatch(/postgres/)
  })

  it('combines topic, type and author filters and sorts stably', () => {
    const f = { ...EMPTY_FILTERS, topics: ['engineering' as const], types: ['thread' as const], sort: 'oldest' as const }
    const out = applyFilters(result.bookmarks, f, NOW)
    expect(out.every((b) => b.topic === 'engineering' && b.contentType === 'thread')).toBe(true)
    expect(out.map((b) => b.createdAt)).toEqual([...out.map((b) => b.createdAt)].sort())
  })

  it('hides unavailable posts unless asked', () => {
    const all = applyFilters(result.bookmarks, EMPTY_FILTERS, NOW)
    expect(all.every((b) => b.accessible)).toBe(true)
    const withHidden = applyFilters(result.bookmarks, { ...EMPTY_FILTERS, showUnavailable: true }, NOW)
    expect(withHidden.length).toBe(result.bookmarks.length)
  })
})

describe('demo library source', () => {
  it('pages results and reports facets for the current scope', async () => {
    const src = demoLibrary(result, NOW)
    const first = await src.query(EMPTY_FILTERS, 0, 10)
    const second = await src.query(EMPTY_FILTERS, 10, 10)
    expect(first.items).toHaveLength(10)
    expect(first.total).toBe(second.total)
    expect(new Set([...first.items, ...second.items].map((b) => b.id)).size).toBe(20)
    const topic = await src.query({ ...EMPTY_FILTERS, topics: ['design'] }, 0, 5)
    const designCount = result.bookmarks.filter((b) => b.accessible && b.topic === 'design').length
    expect(Object.values(topic.facets.types).reduce((a, b) => a + (b ?? 0), 0)).toBe(designCount)
  })
})
