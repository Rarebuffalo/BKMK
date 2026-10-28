import { ACHIEVEMENTS_VERSION, evaluateAchievements } from './achievements'
import { deriveArchetype } from './archetypes'
import { classify } from './classifier'
import { computeScore } from './scoring'
import { computeStats } from './stats'
import type { RawBookmark, ScanCoverage, ScanResult } from './types'

export interface AnalyzeInput {
  handle: string
  displayName: string
  isDemo: boolean
  raw: RawBookmark[]
  coverage: ScanCoverage
  coverageNote?: string
  scannedAt: string
}

/** The whole pipeline: classify → stats → score → archetype → achievements. */
export function analyze(input: AnalyzeInput): ScanResult {
  const bookmarks = input.raw.map(classify)
  const stats = computeStats(bookmarks)
  return {
    handle: input.handle,
    displayName: input.displayName,
    isDemo: input.isDemo,
    scannedAt: input.scannedAt,
    coverage: input.coverage,
    coverageNote: input.coverageNote,
    bookmarks,
    recent: bookmarks.filter((b) => b.accessible).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    stats,
    archetype: deriveArchetype(stats),
    score: computeScore(stats),
    achievements: evaluateAchievements(stats),
    achievementsVersion: ACHIEVEMENTS_VERSION,
  }
}
