import type { PixelGrid } from '../domain/pixels'
import type { CollectionStats, Rarity, TopicId } from '../domain/types'
import { TOPIC_BY_ID } from '../domain/topics'
import { createRng, hashString } from './random'

// Pure geometry shared by the SVG components and the canvas share-card
// renderer, so on-screen and exported artwork are pixel-identical.

export interface Cell {
  x: number
  y: number
  kind: 'fill' | 'border' | 'ring' | 'icon' | 'tint'
}

export const BADGE_GRID = 20
const CORNER: Record<Rarity, number> = { common: 2, uncommon: 4, rare: 6, special: 7 }

export function badgeCells(rarity: Rarity, icon: PixelGrid): Cell[] {
  const n = BADGE_GRID
  const c = CORNER[rarity]
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && x + y >= c && n - 1 - x + y >= c && x + (n - 1 - y) >= c && n - 1 - x + (n - 1 - y) >= c
  const cells: Cell[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
      if (edge) {
        cells.push({ x, y, kind: 'border' })
        continue
      }
      // Rare and above get a dotted inner ring.
      const nearEdge = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2)
      if ((rarity === 'rare' || rarity === 'special') && nearEdge && (x + y) % 2 === 0) {
        cells.push({ x, y, kind: 'ring' })
        continue
      }
      cells.push({ x, y, kind: 'fill' })
    }
  }
  const off = (n - icon.length) / 2
  icon.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') cells.push({ x: x + off, y: y + off, kind: 'icon' })
      if (ch === '+') cells.push({ x: x + off, y: y + off, kind: 'tint' })
    }),
  )
  return cells
}

export function iconCells(icon: PixelGrid): Cell[] {
  const cells: Cell[] = []
  icon.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') cells.push({ x, y, kind: 'icon' })
      if (ch === '+') cells.push({ x, y, kind: 'tint' })
    }),
  )
  return cells
}

export interface DnaBar {
  x: number
  w: number
  topic: TopicId
  color: string
}

/**
 * The Bookmark DNA barcode. Each topic gets width proportional to its share;
 * inside that span, bar widths are derived from a hash of the topic and its
 * count. Same collection → same barcode, always.
 */
export function dnaBars(stats: CollectionStats, units = 120): DnaBar[] {
  const topics = stats.topTopics.slice(0, 8)
  const total = topics.reduce((s, t) => s + t.count, 0)
  if (!total) return []
  const bars: DnaBar[] = []
  let x = 0
  topics.forEach((t, i) => {
    const span = i === topics.length - 1 ? units - x : Math.max(4, Math.round((t.count / total) * units))
    const end = Math.min(units, x + span)
    const rng = createRng(hashString(`${t.topic}:${t.count}`))
    let cursor = x
    while (cursor < end) {
      const w = Math.min(end - cursor, rng.int(1, 3))
      bars.push({ x: cursor, w, topic: t.topic, color: TOPIC_BY_ID[t.topic].color })
      cursor += w + rng.int(1, 2)
    }
    x = end + 1
  })
  return bars
}

/** Resolves `var(--token)` to its computed value (needed for canvas). */
export function resolveColor(value: string): string {
  const m = value.match(/^var\((--[^)]+)\)$/)
  if (!m) return value
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#888'
}
