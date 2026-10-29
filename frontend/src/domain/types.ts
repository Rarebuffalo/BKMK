// Core data model. These shapes are what the backend will eventually return;
// the demo services produce exactly the same types.

export type TopicId =
  | 'ai'
  | 'engineering'
  | 'devtools'
  | 'startups'
  | 'growth'
  | 'design'
  | 'security'
  | 'research'
  | 'productivity'
  | 'other'

export type ContentType = 'post' | 'thread' | 'article' | 'repo' | 'paper' | 'video' | 'tool'

export interface Author {
  /** Empty when the source didn't include the author (e.g. archive Likes). */
  handle: string
  name: string
}

/** A bookmark as retrieved from the source, before classification. */
export interface RawBookmark {
  id: string
  author: Author
  text: string
  /** When the post was created (ISO), or '' if unknown. X does not expose when it was bookmarked. */
  createdAt: string
  url: string
  links: string[]
  /** Number of posts in the thread, if the post opens a thread. */
  threadLength?: number
  /** False when the post was deleted or became protected after saving. */
  accessible: boolean
}

export interface Bookmark extends RawBookmark {
  topic: TopicId
  contentType: ContentType
  /** Keywords that matched during classification — shown for transparency. */
  matched: string[]
  /** Live data only: rules-based confidence for the primary topic (0–1). */
  topicConfidence?: number
  secondaryTopics?: TopicId[]
  /** False when the content type came from a heuristic (e.g. thread markers). */
  contentTypeCertain?: boolean
}

export type ArchetypeId =
  | 'builder'
  | 'researcher'
  | 'explorer'
  | 'curator'
  | 'idea-hunter'
  | 'rabbit-hole'
  | 'collector'

export interface ArchetypeResult {
  primary: ArchetypeId
  secondary?: ArchetypeId
  /** Signal strengths 0–1 per archetype, used for the "why" explanation. */
  signals: Record<Exclude<ArchetypeId, 'collector'>, number>
  version: string
  /** True when based on a partial scan: shown as provisional in the UI. */
  provisional?: boolean
}

export interface ScoreDimension {
  id: 'exploration' | 'diversity' | 'depth' | 'coverage'
  label: string
  value: number // 0–25
  explanation: string
}

export interface CurationScore {
  total: number // 0–100
  dimensions: ScoreDimension[]
  version: string
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'special'

export interface AchievementProgress {
  id: string
  earned: boolean
  current: number
  target: number
}

export interface CollectionStats {
  retrieved: number
  accessible: number
  inaccessible: number
  classified: number
  topicCounts: Record<TopicId, number>
  /** Topics sorted by count, descending, excluding 'other' and zero counts. */
  topTopics: { topic: TopicId; count: number; share: number }[]
  contentTypeCounts: Record<ContentType, number>
  threadCount: number
  repoShare: number
  authorCount: number
  topAuthors: { author: Author; count: number }[]
  /** Per-topic aggregates so topic pages don't need every bookmark loaded. */
  topicBreakdown: Partial<Record<TopicId, { authors: number; types: Partial<Record<ContentType, number>>; topAuthors: { author: Author; count: number }[] }>>
  oldest?: string
  newest?: string
}

export type ScanCoverage = 'complete' | 'partial'

/** Where a result came from. Optional for results saved before imports existed. */
export type ResultSource = 'demo' | 'import' | 'live'

/** What an import contained: shown so missing data is never mistaken for a low score. */
export interface ImportInfo {
  /** X's archive holds Likes, not bookmarks. */
  kind: 'likes' | 'bookmarks'
  formats: string[]
  files: number
  total: number
  duplicates: number
  skipped: number
  withText: number
  withAuthor: number
  withDate: number
  truncated: number
}

export interface ScanResult {
  handle: string
  displayName: string
  isDemo: boolean
  source?: ResultSource
  importInfo?: ImportInfo
  scannedAt: string
  coverage: ScanCoverage
  /** Human-readable note when coverage is partial. */
  coverageNote?: string
  /** Demo: the whole collection. Live: only `recent`; the library pages through the API. */
  bookmarks: Bookmark[]
  /** Most recent saves for the overview. */
  recent: Bookmark[]
  stats: CollectionStats
  archetype: ArchetypeResult
  score: CurationScore
  achievements: AchievementProgress[]
  achievementsVersion: string
}
