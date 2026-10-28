import { TOPICS } from './topics'
import type { Bookmark, ContentType, RawBookmark, TopicId } from './types'

// Deterministic, rules-based classification. No model calls.
// Version is stored alongside results so reclassification can be detected later.
export const CLASSIFIER_VERSION = 'classifier-v1'

/** A topic needs at least this many keyword hits to be assigned. */
const MIN_HITS = 1

const DOMAIN_TYPES: [RegExp, ContentType][] = [
  [/(^|\.)github\.com$|(^|\.)gitlab\.com$|(^|\.)codeberg\.org$/, 'repo'],
  [/(^|\.)arxiv\.org$|(^|\.)openreview\.net$|(^|\.)biorxiv\.org$|(^|\.)nature\.com$/, 'paper'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)vimeo\.com$/, 'video'],
  [/(^|\.)substack\.com$|(^|\.)medium\.com$|^blog\.|(^|\.)dev\.to$|\/blog\//, 'article'],
]

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function classifyContentType(raw: RawBookmark): ContentType {
  for (const link of raw.links) {
    const host = hostOf(link)
    for (const [pattern, type] of DOMAIN_TYPES) {
      if (pattern.test(host) || pattern.test(link)) return type
    }
  }
  if ((raw.threadLength ?? 1) > 1) return 'thread'
  // Any other external link is treated as a tool/product page.
  if (raw.links.length > 0) return 'tool'
  return 'post'
}

export function classifyTopic(raw: RawBookmark): { topic: TopicId; matched: string[] } {
  const haystack = `${raw.text} ${raw.links.join(' ')}`.toLowerCase()
  let best: { topic: TopicId; matched: string[] } = { topic: 'other', matched: [] }
  for (const topic of TOPICS) {
    const matched = topic.keywords.filter((k) => matchesKeyword(haystack, k))
    // Ties go to the earlier topic in TOPICS, which keeps output stable.
    if (matched.length >= MIN_HITS && matched.length > best.matched.length) {
      best = { topic: topic.id, matched }
    }
  }
  return best
}

function matchesKeyword(haystack: string, keyword: string): boolean {
  // Short keywords must match whole words so "ui" doesn't match "build".
  if (keyword.length <= 3) return new RegExp(`\\b${keyword}\\b`).test(haystack)
  return haystack.includes(keyword)
}

export function classify(raw: RawBookmark): Bookmark {
  const { topic, matched } = classifyTopic(raw)
  return { ...raw, topic, matched, contentType: classifyContentType(raw) }
}
