import type { RawBookmark, TopicId } from '../domain/types'
import { createRng, hashString } from '../lib/random'
import { DEMO_AUTHORS, TEMPLATES } from './demoTemplates'

// Deterministic demo collections. The same handle + persona always yields the
// same bookmarks, so archetype, score and badges never change between renders.

export type DemoPersona = 'builder' | 'researcher' | 'idea-hunter' | 'explorer' | 'curator' | 'rabbit-hole' | 'starter'

interface PersonaSpec {
  label: string
  size: [number, number]
  weights: Partial<Record<TopicId, number>>
  /** Probability of preferring a thread template when one exists. */
  threadBias: number
}

export const PERSONAS: Record<DemoPersona, PersonaSpec> = {
  builder: {
    label: 'Builder-leaning sample',
    size: [520, 760],
    weights: { engineering: 30, devtools: 28, ai: 15, startups: 6, security: 6, design: 5, research: 3, productivity: 3, growth: 2, other: 4 },
    threadBias: 0.2,
  },
  researcher: {
    label: 'Research-leaning sample',
    size: [380, 640],
    weights: { research: 30, ai: 30, engineering: 8, productivity: 8, design: 4, devtools: 4, security: 4, startups: 3, growth: 2, other: 5 },
    threadBias: 0.5,
  },
  'idea-hunter': {
    label: 'Founder-leaning sample',
    size: [300, 560],
    weights: { startups: 32, growth: 26, ai: 10, design: 8, productivity: 8, engineering: 5, devtools: 4, research: 2, other: 5 },
    threadBias: 0.4,
  },
  explorer: {
    label: 'Wide-ranging sample',
    size: [260, 480],
    weights: { ai: 9, engineering: 9, devtools: 8, startups: 9, growth: 8, design: 9, security: 8, research: 9, productivity: 9, other: 22 },
    threadBias: 0.3,
  },
  curator: {
    label: 'Well-sorted sample',
    size: [420, 720],
    weights: { ai: 12, engineering: 12, devtools: 12, startups: 10, growth: 9, design: 12, security: 8, research: 12, productivity: 10, other: 1 },
    threadBias: 0.25,
  },
  'rabbit-hole': {
    label: 'Deep-dive sample',
    size: [240, 420],
    weights: { design: 58, productivity: 8, growth: 6, ai: 6, engineering: 5, research: 5, startups: 4, other: 8 },
    threadBias: 0.7,
  },
  starter: {
    label: 'Small new collection',
    size: [14, 22],
    weights: { other: 6, ai: 2, design: 2, startups: 1, productivity: 1 },
    threadBias: 0.2,
  },
}

const ROTATION: DemoPersona[] = ['builder', 'researcher', 'idea-hunter', 'curator', 'rabbit-hole', 'explorer']

/** Persona for a handle when the user hasn't picked one in the demo lab. */
export function personaForHandle(handle: string): DemoPersona {
  if (handle.toLowerCase() === 'demo') return 'builder'
  return ROTATION[hashString(handle.toLowerCase()) % ROTATION.length]
}

/** Fixed reference date so demo output never depends on the clock. */
const REFERENCE_DATE = Date.UTC(2026, 9, 20)
const DAY = 86_400_000

export function generateDemoBookmarks(handle: string, persona: DemoPersona): RawBookmark[] {
  const spec = PERSONAS[persona]
  const rng = createRng(hashString(`${handle.toLowerCase()}::${persona}`))
  const size = rng.int(spec.size[0], spec.size[1])
  const out: RawBookmark[] = []

  for (let i = 0; i < size; i++) {
    const topic = rng.weighted(spec.weights)
    const pool = TEMPLATES[topic]
    const threads = pool.filter((t) => t.thread)
    const picked = threads.length && rng.next() < spec.threadBias ? rng.pick(threads) : rng.pick(pool)
    // Real collections are full of plain posts (screenshots, quotes, one-liners).
    const template = rng.next() < 0.3 ? { text: picked.text } : picked
    const authors = DEMO_AUTHORS[topic === 'other' ? 'misc' : topic]
    const author = rng.pick(authors)
    const slug = String(rng.int(1000, 99999))
    const id = `demo-${String(i + 1).padStart(5, '0')}`
    // Newer saves are denser: square the uniform draw to skew recent.
    const ageDays = Math.floor(rng.next() ** 2 * 900)
    out.push({
      id,
      author,
      text: template.text,
      createdAt: new Date(REFERENCE_DATE - ageDays * DAY - rng.int(0, DAY - 1)).toISOString(),
      url: `https://x.com/${author.handle}/status/${id}`,
      links: template.link ? [template.link.replace('{slug}', slug)] : [],
      threadLength: template.thread ? rng.int(template.thread[0], template.thread[1]) : undefined,
      // A small share of saved posts are later deleted or protected.
      accessible: rng.next() > 0.018,
    })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
