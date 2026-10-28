import { TOPIC_BY_ID } from './topics'
import type { AchievementProgress, CollectionStats, Rarity } from './types'

// Thresholds are versioned. Earned badges keep the version they were earned
// under, so tuning thresholds later never revokes or inflates old awards.
export const ACHIEVEMENTS_VERSION = 'achievements-2026.10-v1'

export interface AchievementDef {
  id: string
  name: string
  description: string
  condition: string
  rarity: Rarity
  /** Key into PIXEL_ICONS. */
  icon: string
  unit?: '%'
  evaluate: (stats: CollectionStats) => { current: number; target: number }
}

const WIDE_EXPLORER_MIN_PER_TOPIC = 3
const CURIOSITY_MIN_PER_FAMILY = 5

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-scan',
    name: 'First Scan',
    description: 'Ran your first Bookmark DNA scan.',
    condition: 'Complete a successful scan.',
    rarity: 'common',
    icon: 'power',
    evaluate: (s) => ({ current: s.retrieved > 0 ? 1 : 0, target: 1 }),
  },
  {
    id: 'bookmark-rookie',
    name: 'Bookmark Rookie',
    description: 'Your archive has officially started.',
    condition: 'Scan 25 accessible bookmarks.',
    rarity: 'common',
    icon: 'bookmark',
    evaluate: (s) => ({ current: s.accessible, target: 25 }),
  },
  {
    id: 'wide-explorer',
    name: 'Wide Explorer',
    description: 'Your saves cover a lot of ground.',
    condition: `Save at least ${WIDE_EXPLORER_MIN_PER_TOPIC} posts in each of 8 distinct topics.`,
    rarity: 'uncommon',
    icon: 'compass',
    evaluate: (s) => ({
      current: s.topTopics.filter((t) => t.count >= WIDE_EXPLORER_MIN_PER_TOPIC).length,
      target: 8,
    }),
  },
  {
    id: 'deep-diver',
    name: 'Deep Diver',
    description: 'You went all the way down one rabbit hole.',
    condition: 'Have 50 or more bookmarks in a single topic.',
    rarity: 'uncommon',
    icon: 'anchor',
    evaluate: (s) => ({ current: s.topTopics[0]?.count ?? 0, target: 50 }),
  },
  {
    id: 'thread-collector',
    name: 'Thread Collector',
    description: 'You save the whole story, not just the hook.',
    condition: 'Save 25 accessible multi-post threads.',
    rarity: 'uncommon',
    icon: 'thread',
    evaluate: (s) => ({ current: s.threadCount, target: 25 }),
  },
  {
    id: 'open-source-hunter',
    name: 'Open-Source Hunter',
    description: 'Public code is your favourite genre.',
    condition: 'At least 15% of accessible bookmarks link to a public code repository.',
    rarity: 'rare',
    icon: 'branch',
    unit: '%',
    evaluate: (s) => ({ current: Math.round(s.repoShare * 100), target: 15 }),
  },
  {
    id: 'curiosity-engine',
    name: 'Curiosity Engine',
    description: 'Builder, business, craft and knowledge — you read across all of it.',
    condition: `Save at least ${CURIOSITY_MIN_PER_FAMILY} posts in each of the 4 topic families.`,
    rarity: 'rare',
    icon: 'atom',
    evaluate: (s) => {
      const families = new Map<string, number>()
      for (const t of s.topTopics) {
        const fam = TOPIC_BY_ID[t.topic].family
        families.set(fam, (families.get(fam) ?? 0) + t.count)
      }
      return {
        current: [...families.values()].filter((n) => n >= CURIOSITY_MIN_PER_FAMILY).length,
        target: 4,
      }
    },
  },
  {
    id: 'digital-archivist',
    name: 'Digital Archivist',
    description: 'Five hundred saves deep. This is an archive now.',
    condition: 'Scan 500 accessible bookmarks.',
    rarity: 'rare',
    icon: 'cabinet',
    evaluate: (s) => ({ current: s.accessible, target: 500 }),
  },
]

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])) as Record<string, AchievementDef>

/**
 * Evaluates every achievement against collection stats. Pure and idempotent:
 * re-scanning the same bookmarks produces the same result, never extra awards.
 */
export function evaluateAchievements(stats: CollectionStats): AchievementProgress[] {
  return ACHIEVEMENTS.map((a) => {
    const { current, target } = a.evaluate(stats)
    return { id: a.id, current: Math.min(current, target), target, earned: current >= target }
  })
}

export const RARITY_ORDER: Rarity[] = ['special', 'rare', 'uncommon', 'common']

/** Earned badges to feature on the reveal and share card: rarest first, max 3. */
export function featuredAchievements(progress: AchievementProgress[], limit = 3): AchievementProgress[] {
  return progress
    .filter((p) => p.earned)
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(ACHIEVEMENT_BY_ID[a.id].rarity) - RARITY_ORDER.indexOf(ACHIEVEMENT_BY_ID[b.id].rarity) ||
        ACHIEVEMENTS.indexOf(ACHIEVEMENT_BY_ID[a.id]) - ACHIEVEMENTS.indexOf(ACHIEVEMENT_BY_ID[b.id]),
    )
    .slice(0, limit)
}

export function progressLabel(p: AchievementProgress) {
  const u = ACHIEVEMENT_BY_ID[p.id].unit ?? ''
  return `${p.current}${u} / ${p.target}${u}`
}
