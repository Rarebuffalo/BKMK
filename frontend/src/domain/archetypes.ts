import { effectiveCount } from './stats'
import type { ArchetypeId, ArchetypeResult, CollectionStats, TopicId } from './types'

export const ARCHETYPE_VERSION = 'archetype-v1'

/** A signal must reach this strength before we assign a named archetype. */
const MIN_SIGNAL = 0.35
/** Secondary archetype is shown only when it is reasonably close to the primary. */
const SECONDARY_RATIO = 0.75
/** Below this many readable bookmarks there isn't enough evidence to label anyone. */
const MIN_BOOKMARKS = 25

export interface ArchetypeDef {
  id: ArchetypeId
  name: string
  code: string
  tagline: string
  description: string
  color: string
  /** Key into PIXEL_ICONS. */
  icon: string
  rule: string
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  builder: {
    id: 'builder',
    name: 'The Builder',
    code: 'BUILD_MODE',
    tagline: "I don't scroll. I collect tools.",
    description: 'Your saves are things you can use: repos, dev tools, implementation guides and engineering deep cuts.',
    color: 'var(--phosphor)',
    icon: 'wrench',
    rule: 'Engineering + dev-tools share, plus repos and tools as resource types.',
  },
  researcher: {
    id: 'researcher',
    name: 'The Researcher',
    code: 'DEEP_SCAN',
    tagline: 'Footnotes are my love language.',
    description: 'You save the long version: papers, technical threads and explanations you mean to read properly.',
    color: 'var(--signal)',
    icon: 'lens',
    rule: 'Research + AI share, weighted by papers, threads and articles.',
  },
  explorer: {
    id: 'explorer',
    name: 'The Explorer',
    code: 'WIDE_NET',
    tagline: 'Interested in everything. Apologising for nothing.',
    description: 'No single topic owns your collection. You cast a wide net across very different corners of X.',
    color: 'var(--amber)',
    icon: 'compass',
    rule: 'High topic entropy with no topic above 30%.',
  },
  curator: {
    id: 'curator',
    name: 'The Curator',
    code: 'ARCHIVE_MODE',
    tagline: 'Everything in its right place.',
    description: 'A broad, well-sorted archive: clear clusters, varied resource types and almost nothing unsorted.',
    color: 'var(--violet)',
    icon: 'cabinet',
    rule: 'Six or more topics, varied resource types and 85%+ classification coverage.',
  },
  'idea-hunter': {
    id: 'idea-hunter',
    name: 'The Idea Hunter',
    code: 'IDEAS_FOUND',
    tagline: 'Every bookmark is a startup I might build.',
    description: 'Startup ideas, pricing experiments, launch playbooks and growth tactics. Your folder is a business plan in waiting.',
    color: 'var(--topic-startups)',
    icon: 'bulb',
    rule: 'Startups + marketing & growth share.',
  },
  'rabbit-hole': {
    id: 'rabbit-hole',
    name: 'The Rabbit-Hole Explorer',
    code: 'ONE_MORE_THREAD',
    tagline: 'Just one more thread.',
    description: 'You go deep, not wide: a dominant topic and a lot of long threads you followed all the way down.',
    color: 'var(--topic-design)',
    icon: 'spiral',
    rule: 'One topic above 40% of the collection and threads above 15%.',
  },
  collector: {
    id: 'collector',
    name: 'The Collector',
    code: 'SAVE_STATE',
    tagline: 'Saved for later. Later is now.',
    description: "Your collection doesn't lean hard in any one direction yet. Keep saving — your shape will show.",
    color: 'var(--paper-dim)',
    icon: 'disk',
    rule: 'Fallback when no signal is strong enough. We would rather say nothing than guess.',
  },
}

export function deriveArchetype(stats: CollectionStats): ArchetypeResult {
  const n = stats.accessible || 1
  const classified = stats.classified || 1
  const share = (...ids: TopicId[]) => ids.reduce((s, id) => s + stats.topicCounts[id], 0) / classified
  const type = (...ids: (keyof CollectionStats['contentTypeCounts'])[]) =>
    ids.reduce((s, id) => s + stats.contentTypeCounts[id], 0) / n
  const top = stats.topTopics[0]?.share ?? 0
  const effTopics = effectiveCount(stats.topTopics.map((t) => t.count))
  const effTypes = effectiveCount(Object.values(stats.contentTypeCounts))
  const coverage = stats.classified / n
  const clamp = (x: number) => Math.max(0, Math.min(1, x))

  const signals = {
    builder: clamp(share('engineering', 'devtools') * 1.2 + type('repo', 'tool') * 0.8),
    researcher: clamp(share('research', 'ai') * 1.1 + type('paper', 'thread', 'article') * 0.35),
    'idea-hunter': clamp(share('startups', 'growth') * 1.6),
    explorer: top <= 0.3 ? clamp((effTopics - 3) / 4) : 0,
    curator:
      stats.topTopics.length >= 6 && coverage >= 0.85 ? clamp(((effTypes - 2) / 3) * 0.6 + ((effTopics - 4) / 4) * 0.5) : 0,
    'rabbit-hole': top >= 0.4 && stats.threadCount / n >= 0.15 ? clamp(top + stats.threadCount / n) : 0,
  }

  const ranked = (Object.entries(signals) as [Exclude<ArchetypeId, 'collector'>, number][]).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const [first, second] = ranked
  if (!first || first[1] < MIN_SIGNAL || stats.accessible < MIN_BOOKMARKS) {
    return { primary: 'collector', signals, version: ARCHETYPE_VERSION }
  }
  return {
    primary: first[0],
    secondary: second && second[1] >= MIN_SIGNAL && second[1] >= first[1] * SECONDARY_RATIO ? second[0] : undefined,
    signals,
    version: ARCHETYPE_VERSION,
  }
}
