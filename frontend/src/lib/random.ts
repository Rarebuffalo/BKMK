// Seeded PRNG so demo data is identical for the same handle on every render.

export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 */
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    weighted: <T extends string>(weights: Partial<Record<T, number>>): T => {
      const entries = Object.entries(weights) as [T, number][]
      const total = entries.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [k, w] of entries) {
        r -= w
        if (r <= 0) return k
      }
      return entries[entries.length - 1][0]
    },
  }
}
