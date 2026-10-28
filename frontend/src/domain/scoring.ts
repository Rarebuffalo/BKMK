import { effectiveCount } from './stats'
import type { CollectionStats, CurationScore, ScoreDimension } from './types'

// Curation Score v1. Describes the collection, not the person.
// Each dimension is 0–25; the total is their sum. Changing any constant here
// requires bumping SCORE_VERSION so old scores stay interpretable.
export const SCORE_VERSION = 'score-v1'

/** Share of substantial resources that earns the full 25 for depth. */
const DEPTH_FULL_MARKS = 0.85

const SUBSTANTIAL_TYPES = ['thread', 'article', 'repo', 'paper', 'video', 'tool'] as const

/** Diminishing returns: 0 at x=0, approaches 1 as x grows. */
const saturate = (x: number, scale: number) => 1 - Math.exp(-Math.max(0, x) / scale)
const clamp25 = (x: number) => Math.round(Math.max(0, Math.min(25, x)))

export function computeScore(stats: CollectionStats): CurationScore {
  const topicCounts = stats.topTopics.map((t) => t.count)
  const effTopics = effectiveCount(topicCounts)
  const effTypes = effectiveCount(Object.values(stats.contentTypeCounts))
  const substantial = SUBSTANTIAL_TYPES.reduce((n, t) => n + stats.contentTypeCounts[t], 0)
  const depthShare = stats.accessible ? substantial / stats.accessible : 0
  const coverage = stats.accessible ? stats.classified / stats.accessible : 0

  const dimensions: ScoreDimension[] = [
    {
      id: 'exploration',
      label: 'Topic exploration',
      value: clamp25(25 * saturate(effTopics - 1, 4)),
      explanation: `Your saves spread across about ${effTopics.toFixed(1)} effective topics. Measured on proportions, so a larger collection does not score higher by size alone.`,
    },
    {
      id: 'diversity',
      label: 'Resource diversity',
      value: clamp25(25 * saturate(effTypes - 1, 2.2)),
      explanation: `A mix of about ${effTypes.toFixed(1)} effective resource types — posts, threads, articles, repos, papers, videos and tools.`,
    },
    {
      id: 'depth',
      label: 'Collection depth',
      value: clamp25((25 * depthShare) / DEPTH_FULL_MARKS),
      explanation: `${Math.round(depthShare * 100)}% of accessible bookmarks are substantial resources (threads, articles, repos, papers, videos, tools). ${Math.round(DEPTH_FULL_MARKS * 100)}% or more earns full marks.`,
    },
    {
      id: 'coverage',
      label: 'Metadata coverage',
      value: clamp25(25 * coverage),
      explanation: `${Math.round(coverage * 100)}% of accessible bookmarks could be placed in a topic. Deleted or protected posts are excluded, not penalised.`,
    },
  ]

  return { total: dimensions.reduce((n, d) => n + d.value, 0), dimensions, version: SCORE_VERSION }
}
