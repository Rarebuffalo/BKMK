import { describe, expect, it } from 'vitest'
import { generateDemoBookmarks, PERSONAS, type DemoPersona } from '../data/demoProfile'
import { evaluateAchievements } from './achievements'
import { analyze } from './analyze'
import { classify } from './classifier'
import { computeScore } from './scoring'
import { computeStats } from './stats'

const run = (handle: string, persona: DemoPersona) =>
  analyze({ handle, displayName: handle, isDemo: true, source: 'demo', raw: generateDemoBookmarks(handle, persona), coverage: 'complete', scannedAt: 'x' })

describe('demo rules', () => {
  it('is deterministic for the same handle and persona', () => {
    const a = run('ada', 'builder')
    const b = run('ada', 'builder')
    expect(a.score).toEqual(b.score)
    expect(a.archetype).toEqual(b.archetype)
    expect(a.achievements).toEqual(b.achievements)
  })

  it.each([
    ['builder', 'builder'],
    ['researcher', 'researcher'],
    ['idea-hunter', 'idea-hunter'],
    ['explorer', 'explorer'],
    ['curator', 'curator'],
    ['rabbit-hole', 'rabbit-hole'],
    ['starter', 'collector'],
  ] as const)('persona %s resolves to archetype %s', (persona, archetype) => {
    expect(run('demo', persona).archetype.primary).toBe(archetype)
  })

  it('keeps every score within bounds and explains each dimension', () => {
    for (const p of Object.keys(PERSONAS) as DemoPersona[]) {
      const { score } = run('someone', p)
      expect(score.total).toBe(score.dimensions.reduce((n, d) => n + d.value, 0))
      expect(score.total).toBeGreaterThanOrEqual(0)
      expect(score.total).toBeLessThanOrEqual(100)
      expect(score.version).toBe('score-v2')
    }
  })

  it('does not inflate scores for tiny collections (score-v2)', () => {
    const tiny = run('demo', 'starter')
    const dims = Object.fromEntries(tiny.score.dimensions.map((d) => [d.id, d.value]))
    expect(dims.exploration).toBeLessThanOrEqual(15)
    expect(tiny.score.dimensions[0].explanation).toMatch(/Scaled by/)
  })

  it('builds per-topic breakdowns and recent saves', () => {
    const r = run('demo', 'builder')
    const top = r.stats.topTopics[0].topic
    expect(r.stats.topicBreakdown[top]?.authors).toBeGreaterThan(0)
    expect(r.recent).toHaveLength(5)
    expect(r.recent[0].createdAt >= r.recent[4].createdAt).toBe(true)
  })

  it('awards nothing for an empty collection', () => {
    const stats = computeStats([])
    expect(evaluateAchievements(stats).some((a) => a.earned)).toBe(false)
    expect(computeScore(stats).total).toBe(0)
  })

  it('classifies by keywords and link domains without AI', () => {
    const b = classify({ id: '1', author: { handle: 'a', name: 'A' }, text: 'New open-source CLI', createdAt: '', url: '', links: ['https://github.com/x/y'], accessible: true })
    expect(b.topic).toBe('devtools')
    expect(b.contentType).toBe('repo')
    expect(classify({ id: '2', author: { handle: 'a', name: 'A' }, text: 'build stuff', createdAt: '', url: '', links: [], accessible: true }).topic).toBe('other')
  })
})
