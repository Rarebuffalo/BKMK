import type { AchievementProgress, ArchetypeResult, Bookmark, CollectionStats, ContentType, CurationScore, ScanCoverage, ScanResult, TopicId } from '../domain/types'
import { request } from './client'

// Wire types for the BKMK.exe API (docs/api-reference.md).

export interface Me {
  authenticated: boolean
  xConfigured: boolean
  apiMode: 'live' | 'fixture'
  /** Days of inactivity before the server deletes stored data; 0 = kept until deleted. */
  dataRetentionDays: number
  /** How many of the newest bookmarks a live first scan reads. */
  scanLimit: number
  user: { handle: string; displayName: string | null; profileImageUrl: string | null; lastScanAt: string | null } | null
  connection: { status: 'active' | 'expired' | 'revoked'; scopes: string[]; expiresAt: string | null } | null
  csrfToken: string | null
}

export interface ApiBookmark {
  id: string
  xPostId: string
  author: { handle: string; name: string }
  text: string
  createdAt: string | null
  url: string
  links: string[]
  threadLength: number | null
  accessible: boolean
  topic: TopicId
  topicConfidence: number
  secondaryTopics: TopicId[]
  contentType: ContentType
  contentTypeCertain: boolean
  matched: string[]
  firstSeenAt: string
}

export interface ApiScanEvent {
  type: string
  at: string
  [key: string]: unknown
}

export interface ApiScan {
  id: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'
  mode: 'full' | 'refresh'
  phase: string
  requestedLimit: number
  retrieved: number
  newBookmarks: number
  removedBookmarks: number
  classified: number
  pages: number
  events: ApiScanEvent[]
  coverage: ScanCoverage | null
  coverageNote: string | null
  stopReason: string | null
  errorCode: string | null
  errorMessage: string | null
  apiRequests: number
  estimatedCostUsd: number
  startedAt: string
  completedAt: string | null
}

export interface ApiReport {
  handle: string
  displayName: string
  isDemo: boolean
  scannedAt: string
  coverage: ScanCoverage
  coverageNote: string | null
  stats: CollectionStats
  archetype: ArchetypeResult
  score: CurationScore
  achievements: (AchievementProgress & { unlockedAt: string | null; rulesVersion: string | null })[]
  achievementsVersion: string
  recent: ApiBookmark[]
  scan: ApiScan | null
}

export interface BookmarkQuery {
  q?: string
  topic?: TopicId[]
  type?: ContentType[]
  author?: string
  date?: 'any' | '30d' | '6m' | '1y' | 'older'
  sort?: 'newest' | 'oldest' | 'author' | 'longest'
  offset?: number
  limit?: number
}

export interface BookmarkPage {
  items: ApiBookmark[]
  total: number
  offset: number
  limit: number
  facets: { types: Partial<Record<ContentType, number>>; topics: Partial<Record<TopicId, number>>; authors: { handle: string; count: number }[] }
}

export const api = {
  me: (signal?: AbortSignal) => request<Me>('GET', '/api/auth/me', { signal }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  disconnect: () => request<{ deleted: boolean; revoked: boolean }>('POST', '/api/auth/disconnect'),
  deleteAccount: () => request<{ deleted: boolean; revoked: boolean }>('DELETE', '/api/account'),
  startScan: (mode?: 'full' | 'refresh') => request<ApiScan>('POST', '/api/scans', { body: mode ? { mode } : {} }),
  scan: (id: string, signal?: AbortSignal) => request<ApiScan>('GET', `/api/scans/${encodeURIComponent(id)}`, { signal }),
  dashboard: (signal?: AbortSignal) => request<ApiReport>('GET', '/api/dashboard', { signal }),
  bookmarks: (q: BookmarkQuery, signal?: AbortSignal) =>
    request<BookmarkPage>('GET', '/api/bookmarks', {
      signal,
      query: { ...q, topic: q.topic?.join(','), type: q.type?.join(','), date: q.date === 'any' ? undefined : q.date },
    }),
}

/** OAuth is a full-page navigation: the browser must visit X itself. */
export function startOAuthUrl(handle: string | null, returnTo: 'scan' | 'settings' = 'scan') {
  const qs = new URLSearchParams({ returnTo })
  if (handle) qs.set('handle', handle)
  return `${(import.meta.env.VITE_API_BASE as string | undefined) ?? ''}/api/auth/x/start?${qs}`
}

export const EXPORT_URL = `${(import.meta.env.VITE_API_BASE as string | undefined) ?? ''}/api/export`

export function toBookmark(b: ApiBookmark): Bookmark {
  return {
    id: b.id,
    author: b.author,
    text: b.text,
    createdAt: b.createdAt ?? b.firstSeenAt,
    url: b.url,
    links: b.links,
    threadLength: b.threadLength ?? undefined,
    accessible: b.accessible,
    topic: b.topic,
    contentType: b.contentType,
    matched: b.matched,
    topicConfidence: b.topicConfidence,
    secondaryTopics: b.secondaryTopics,
    contentTypeCertain: b.contentTypeCertain,
  }
}

/** The live report in the shape every existing page already renders. */
export function toScanResult(r: ApiReport): ScanResult {
  const recent = r.recent.map(toBookmark)
  return {
    handle: r.handle,
    displayName: r.displayName,
    isDemo: false,
    source: 'live',
    scannedAt: r.scannedAt,
    coverage: r.coverage,
    coverageNote: r.coverageNote ?? undefined,
    bookmarks: recent,
    recent,
    stats: r.stats,
    archetype: r.archetype,
    score: r.score,
    achievements: r.achievements.map(({ id, earned, current, target }) => ({ id, earned, current, target })),
    achievementsVersion: r.achievementsVersion,
  }
}
