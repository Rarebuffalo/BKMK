import { ACHIEVEMENT_BY_ID, featuredAchievements } from '../domain/achievements'
import { ARCHETYPES } from '../domain/archetypes'
import { PIXEL_ICONS } from '../domain/pixels'
import { TOPIC_BY_ID } from '../domain/topics'
import type { Rarity, ScanResult } from '../domain/types'
import { fmt, PRODUCT_HOST } from './format'
import { badgeCells, BADGE_GRID, dnaBars, iconCells, resolveColor, type Cell } from './geometry'

// Share cards are drawn directly to <canvas> from scan data. The preview the
// user sees IS the exported PNG — there is no screenshotting of DOM.

export const CARD_W = 1200
export const CARD_H = 675
/** X may crop 16:9 to ~2:1 in some placements; keep key content inside. */
export const SAFE_TOP = 38

export type CardVariant = 'terminal' | 'identity' | 'badges'

export const CARD_VARIANTS: { id: CardVariant; label: string; blurb: string }[] = [
  { id: 'terminal', label: 'Terminal report', blurb: 'Minimal scan printout' },
  { id: 'identity', label: 'Collector ID', blurb: 'Archive index card' },
  { id: 'badges', label: 'Achievements', blurb: 'Badge showcase' },
]

export interface CardOptions {
  variant: CardVariant
  showScore: boolean
}

export interface CardData {
  handle: string
  archetypeName: string
  archetypeCode: string
  archetypeColor: string
  archetypeIcon: string
  tagline: string
  score: number
  saved: number
  topics: number
  threads: number
  topTopics: string[]
  badges: { id: string; name: string; rarity: Rarity }[]
  badgesEarned: number
  badgesTotal: number
  isDemo: boolean
  bars: ReturnType<typeof dnaBars>
}

/** Only aggregate, non-sensitive fields reach the card. No bookmark text. */
export function cardDataFrom(result: ScanResult, handleOverride?: string): CardData {
  const a = ARCHETYPES[result.archetype.primary]
  return {
    handle: handleOverride ?? result.handle,
    archetypeName: a.name,
    archetypeCode: a.code,
    archetypeColor: a.color,
    archetypeIcon: a.icon,
    tagline: a.tagline,
    score: result.score.total,
    saved: result.stats.accessible,
    topics: result.stats.topTopics.length,
    threads: result.stats.threadCount,
    topTopics: result.stats.topTopics.slice(0, 3).map((t) => TOPIC_BY_ID[t.topic].short),
    badges: featuredAchievements(result.achievements).map((p) => ({ id: p.id, name: ACHIEVEMENT_BY_ID[p.id].name, rarity: ACHIEVEMENT_BY_ID[p.id].rarity })),
    badgesEarned: result.achievements.filter((p) => p.earned).length,
    badgesTotal: result.achievements.length,
    isDemo: result.isDemo,
    bars: dnaBars(result.stats, 120),
  }
}

const FONTS = {
  display: '"Archivo Variable", sans-serif',
  mono: '"JetBrains Mono Variable", monospace',
  pixel: 'Silkscreen, monospace',
}

export async function ensureCardFonts() {
  await Promise.all([
    document.fonts.load(`800 80px ${FONTS.display}`),
    document.fonts.load(`500 20px ${FONTS.mono}`),
    document.fonts.load(`700 20px ${FONTS.mono}`),
    document.fonts.load(`400 16px ${FONTS.pixel}`),
    document.fonts.load(`700 16px ${FONTS.pixel}`),
  ])
}

const RARITY: Record<Rarity, string> = { common: '--paper-dim', uncommon: '--phosphor', rare: '--violet', special: '--amber' }

export function renderCard(canvas: HTMLCanvasElement, data: CardData, opts: CardOptions) {
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  const c = palette(data)
  ctx.textBaseline = 'alphabetic'
  ;({ terminal: drawTerminal, identity: drawIdentity, badges: drawBadges })[opts.variant](ctx, data, opts, c)
  if (data.isDemo) stamp(ctx, c.amber, opts.variant === 'identity' ? CARD_H - 34 : CARD_H - 76)
}

function palette(data: CardData) {
  const v = (name: string) => resolveColor(`var(${name})`)
  return {
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    line: v('--line'),
    lineStrong: v('--line-strong'),
    paper: v('--paper'),
    paperDim: v('--paper-dim'),
    paperFaint: v('--paper-faint'),
    phosphor: v('--phosphor'),
    amber: v('--amber'),
    arche: resolveColor(data.archetypeColor),
    rarity: (r: Rarity) => v(RARITY[r]),
    bar: (color: string) => resolveColor(color),
  }
}
type Palette = ReturnType<typeof palette>

// ── helpers ────────────────────────────────────────────────────────────────

function font(ctx: CanvasRenderingContext2D, spec: string, stretch: CanvasFontStretch = 'normal') {
  ctx.font = spec
  if ('fontStretch' in ctx) ctx.fontStretch = stretch
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, min: number, make: (px: number) => string, stretch: CanvasFontStretch = 'normal') {
  let px = start
  for (; px > min; px -= 2) {
    font(ctx, make(px), stretch)
    if (ctx.measureText(text).width <= maxW) break
  }
  return px
}

function drawCells(ctx: CanvasRenderingContext2D, cells: Cell[], x: number, y: number, s: number, color: (k: Cell['kind']) => [string, number] | null) {
  for (const cell of cells) {
    const col = color(cell.kind)
    if (!col) continue
    ctx.globalAlpha = col[1]
    ctx.fillStyle = col[0]
    ctx.fillRect(Math.round(x + cell.x * s), Math.round(y + cell.y * s), Math.ceil(s), Math.ceil(s))
  }
  ctx.globalAlpha = 1
}

function badge(ctx: CanvasRenderingContext2D, id: string, rarity: Rarity, x: number, y: number, size: number, c: Palette, onLight = false) {
  const color = c.rarity(rarity)
  const s = size / BADGE_GRID
  drawCells(ctx, badgeCells(rarity, PIXEL_ICONS[ACHIEVEMENT_BY_ID[id].icon]), x, y, s, (k) => {
    if (k === 'border') return [onLight ? c.ink : color, 1]
    if (k === 'ring') return [onLight ? c.ink : color, 0.5]
    if (k === 'fill') return [onLight ? color : c.ink3, 1]
    if (k === 'icon') return [onLight ? c.ink : color, 1]
    return [onLight ? c.ink : color, 0.3]
  })
}

function bars(ctx: CanvasRenderingContext2D, data: CardData, x: number, y: number, w: number, h: number, c: Palette, mono?: string) {
  const unit = w / 120
  for (const b of data.bars) {
    ctx.fillStyle = mono ?? c.bar(b.color)
    ctx.fillRect(Math.round(x + b.x * unit), y, Math.max(1, Math.round(b.w * unit)), h)
  }
}

function dots(ctx: CanvasRenderingContext2D, c: Palette, alpha = 0.07) {
  ctx.fillStyle = c.paper
  ctx.globalAlpha = alpha
  for (let y = 12; y < CARD_H; y += 24) for (let x = 12; x < CARD_W; x += 24) ctx.fillRect(x, y, 2, 2)
  ctx.globalAlpha = 1
}

function stamp(ctx: CanvasRenderingContext2D, color: string, y: number) {
  font(ctx, `400 13px ${FONTS.pixel}`)
  const text = 'SAMPLE DATA · PROTOTYPE'
  const w = ctx.measureText(text).width + 20
  const x = CARD_W - w - 46
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, w, 24)
  ctx.fillStyle = color
  ctx.fillText(text, x + 10, y + 16)
}

function footer(ctx: CanvasRenderingContext2D, c: Palette, color: string, x: number, y: number) {
  font(ctx, `600 16px ${FONTS.mono}`)
  ctx.fillStyle = color
  ctx.fillText(`SCAN YOUR BOOKMARK DNA → ${PRODUCT_HOST}`, x, y)
  void c
}

// ── variant: terminal report ───────────────────────────────────────────────

function drawTerminal(ctx: CanvasRenderingContext2D, d: CardData, o: CardOptions, c: Palette) {
  ctx.fillStyle = c.ink
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  dots(ctx, c)

  // Window frame + title bar
  const fx = 28
  const fy = 28
  ctx.fillStyle = c.ink2
  ctx.fillRect(fx, fy, CARD_W - fx * 2, CARD_H - fy * 2)
  ctx.strokeStyle = c.lineStrong
  ctx.lineWidth = 2
  ctx.strokeRect(fx + 1, fy + 1, CARD_W - fx * 2 - 2, CARD_H - fy * 2 - 2)
  ctx.fillStyle = c.ink3
  ctx.fillRect(fx + 2, fy + 2, CARD_W - fx * 2 - 4, 42)
  ctx.fillStyle = c.lineStrong
  ctx.fillRect(fx + 2, fy + 44, CARD_W - fx * 2 - 4, 2)
  font(ctx, `700 18px ${FONTS.pixel}`)
  ctx.fillStyle = c.phosphor
  ctx.fillText('BKMK.exe', fx + 22, fy + 30)
  const ww = ctx.measureText('BKMK.exe').width
  font(ctx, `500 15px ${FONTS.mono}`)
  ctx.fillStyle = c.paperFaint
  ctx.fillText('— SCAN REPORT // BOOKMARK DNA', fx + 22 + ww + 12, fy + 29)
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = c.paperFaint
    ctx.lineWidth = 2
    ctx.strokeRect(CARD_W - fx - 40 - i * 26, fy + 15, 14, 14)
  }

  const left = 72
  font(ctx, `500 20px ${FONTS.mono}`)
  ctx.fillStyle = c.phosphor
  ctx.fillText(`> bookmark_dna --user @${d.handle}`, left, 140)

  const name = d.archetypeName.toUpperCase()
  const px = fitFont(ctx, name, 640, 84, 40, (p) => `800 ${p}px ${FONTS.display}`, 'expanded')
  ctx.fillStyle = c.paper
  ctx.fillText(name, left, 160 + px)
  font(ctx, `700 18px ${FONTS.pixel}`)
  ctx.fillStyle = c.arche
  ctx.fillText(`// ${d.archetypeCode}`, left, 160 + px + 40)

  font(ctx, `italic 500 20px ${FONTS.mono}`)
  ctx.fillStyle = c.paperDim
  ctx.fillText(`"${d.tagline}"`, left, 160 + px + 82)

  const rows: [string, string][] = [
    ['SAVED POSTS', fmt(d.saved)],
    ['TOPIC CLUSTERS', String(d.topics)],
    ['TOP INTERESTS', d.topTopics.join(' · ') || '—'],
  ]
  font(ctx, `500 19px ${FONTS.mono}`)
  rows.forEach(([k, v], i) => {
    const y = 432 + i * 34
    ctx.fillStyle = c.paperFaint
    const label = `${k} `
    ctx.fillText(label, left, y)
    const lw = ctx.measureText(label).width
    const vw = ctx.measureText(v).width
    const dotsW = 640 - lw - vw - 10
    ctx.fillText('.'.repeat(Math.max(2, Math.floor(dotsW / ctx.measureText('.').width))), left + lw, y)
    ctx.fillStyle = c.paper
    ctx.fillText(v, left + 640 - vw, y)
  })

  // Right column
  const rx = 790
  if (o.showScore) {
    font(ctx, `400 15px ${FONTS.pixel}`)
    ctx.fillStyle = c.paperFaint
    ctx.fillText('CURATION SCORE', rx, 142)
    font(ctx, `800 150px ${FONTS.display}`, 'expanded')
    ctx.fillStyle = c.phosphor
    ctx.fillText(String(d.score), rx - 6, 280)
    const sw = ctx.measureText(String(d.score)).width
    font(ctx, `600 30px ${FONTS.mono}`)
    ctx.fillStyle = c.paperFaint
    ctx.fillText('/100', rx + sw + 4, 280)
  } else {
    const s = 168 / 12
    drawCells(ctx, iconCells(PIXEL_ICONS[d.archetypeIcon]), rx + 20, 118, s, (k) => [c.arche, k === 'tint' ? 0.35 : 1])
  }

  font(ctx, `400 14px ${FONTS.pixel}`)
  ctx.fillStyle = c.paperFaint
  ctx.fillText('UNLOCKED', rx, 342)
  d.badges.forEach((b, i) => {
    const bx = rx + i * 112
    badge(ctx, b.id, b.rarity, bx, 360, 84, c)
    font(ctx, `400 11px ${FONTS.pixel}`)
    ctx.fillStyle = c.paperDim
    wrapCentered(ctx, b.name.toUpperCase(), bx + 42, 468, 104, 14)
  })

  bars(ctx, d, left, 540, CARD_W - left * 2, 38, c)
  footer(ctx, c, c.paperDim, left, 618)
}

function wrapCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  lines.push(line)
  ctx.textAlign = 'center'
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lh))
  ctx.textAlign = 'left'
}

// ── variant: collector identity card ───────────────────────────────────────

function drawIdentity(ctx: CanvasRenderingContext2D, d: CardData, o: CardOptions, c: Palette) {
  ctx.fillStyle = c.ink
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  dots(ctx, c, 0.05)

  const x = 64
  const y = 44
  const w = CARD_W - 128
  const h = CARD_H - 96
  ctx.fillStyle = '#000'
  ctx.fillRect(x + 10, y + 10, w, h)
  ctx.fillStyle = c.paper
  ctx.fillRect(x, y, w, h)

  // Header band in archetype colour
  ctx.fillStyle = c.arche
  ctx.fillRect(x, y, w, 58)
  ctx.fillStyle = c.ink
  font(ctx, `700 22px ${FONTS.pixel}`)
  ctx.fillText('BKMK.exe', x + 28, y + 38)
  font(ctx, `700 15px ${FONTS.mono}`)
  ctx.textAlign = 'right'
  ctx.fillText('COLLECTOR IDENTITY CARD · BOOKMARK DNA', x + w - 28, y + 36)
  ctx.textAlign = 'left'

  // Emblem
  const ex = x + 36
  const ey = y + 92
  const es = 240
  ctx.fillStyle = c.arche
  ctx.fillRect(ex, ey, es, es)
  ctx.strokeStyle = c.ink
  ctx.lineWidth = 4
  ctx.strokeRect(ex + 2, ey + 2, es - 4, es - 4)
  drawCells(ctx, iconCells(PIXEL_ICONS[d.archetypeIcon]), ex + 36, ey + 36, 14, (k) => [c.ink, k === 'tint' ? 0.3 : 1])

  // Badges as stamps under the emblem
  d.badges.forEach((b, i) => badge(ctx, b.id, b.rarity, ex + i * 84, ey + es + 24, 68, c, true))

  // Fields
  const fx = x + 316
  const fw = w - 316 - 36
  const label = (t: string, ly: number) => {
    font(ctx, `400 12px ${FONTS.pixel}`)
    ctx.fillStyle = c.ink
    ctx.globalAlpha = 0.55
    ctx.fillText(t, fx, ly)
    ctx.globalAlpha = 1
  }
  const rule = (ry: number) => {
    ctx.fillStyle = c.ink
    ctx.globalAlpha = 0.18
    ctx.fillRect(fx, ry, fw, 2)
    ctx.globalAlpha = 1
  }

  label('ARCHETYPE', y + 104)
  const name = d.archetypeName.toUpperCase()
  const px = fitFont(ctx, name, fw, 64, 32, (p) => `800 ${p}px ${FONTS.display}`, 'expanded')
  ctx.fillStyle = c.ink
  ctx.fillText(name, fx, y + 110 + px)
  font(ctx, `700 16px ${FONTS.mono}`)
  ctx.fillText(`// ${d.archetypeCode}`, fx, y + 140 + px)
  rule(y + 160 + px)

  const ry = y + 196 + px
  label('HOLDER', ry)
  font(ctx, `700 28px ${FONTS.mono}`)
  ctx.fillStyle = c.ink
  ctx.fillText(`@${d.handle}`, fx, ry + 34)
  rule(ry + 52)

  const cols: [string, string][] = [
    ['SAVED', fmt(d.saved)],
    ['TOPICS', String(d.topics)],
    o.showScore ? ['CURATION', `${d.score}/100`] : ['THREADS', fmt(d.threads)],
  ]
  const colW = fw / 3
  cols.forEach(([k, v], i) => {
    const cx = fx + i * colW
    font(ctx, `400 12px ${FONTS.pixel}`)
    ctx.globalAlpha = 0.55
    ctx.fillStyle = c.ink
    ctx.fillText(k, cx, ry + 88)
    ctx.globalAlpha = 1
    font(ctx, `800 40px ${FONTS.display}`, 'expanded')
    ctx.fillText(v, cx, ry + 132)
  })

  bars(ctx, d, fx, y + h - 112, fw, 52, c, c.ink)
  font(ctx, `500 13px ${FONTS.mono}`)
  ctx.fillStyle = c.ink
  ctx.fillText(d.topTopics.join(' · ').toUpperCase(), fx, y + h - 40)
  ctx.textAlign = 'right'
  font(ctx, `700 13px ${FONTS.mono}`)
  ctx.fillText(`${PRODUCT_HOST} →`, fx + fw, y + h - 40)
  ctx.textAlign = 'left'
}

// ── variant: achievement showcase ──────────────────────────────────────────

function drawBadges(ctx: CanvasRenderingContext2D, d: CardData, o: CardOptions, c: Palette) {
  ctx.fillStyle = c.ink
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  const top = d.badges[0] ? c.rarity(d.badges[0].rarity) : c.phosphor
  const g = ctx.createRadialGradient(CARD_W / 2, 330, 40, CARD_W / 2, 330, 560)
  g.addColorStop(0, top)
  g.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.12
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.globalAlpha = 1
  dots(ctx, c, 0.06)

  font(ctx, `700 20px ${FONTS.pixel}`)
  ctx.fillStyle = c.phosphor
  ctx.fillText('BKMK.exe', 56, 76)
  font(ctx, `600 18px ${FONTS.mono}`)
  ctx.fillStyle = c.paperDim
  ctx.textAlign = 'right'
  ctx.fillText(`@${d.handle}`, CARD_W - 56, 76)

  ctx.textAlign = 'center'
  font(ctx, `400 16px ${FONTS.pixel}`)
  ctx.fillStyle = c.paperFaint
  ctx.fillText('ACHIEVEMENTS UNLOCKED', CARD_W / 2, 130)
  font(ctx, `800 54px ${FONTS.display}`, 'expanded')
  ctx.fillStyle = c.paper
  ctx.fillText(`${d.badgesEarned} of ${d.badgesTotal} badges`, CARD_W / 2, 190)

  const size = 164
  const gap = 90
  const n = d.badges.length
  const startX = CARD_W / 2 - (n * size + (n - 1) * gap) / 2
  d.badges.forEach((b, i) => {
    const bx = startX + i * (size + gap)
    badge(ctx, b.id, b.rarity, bx, 230, size, c)
    font(ctx, `800 22px ${FONTS.display}`)
    ctx.fillStyle = c.paper
    ctx.fillText(b.name, bx + size / 2, 432)
    font(ctx, `400 13px ${FONTS.pixel}`)
    ctx.fillStyle = c.rarity(b.rarity)
    ctx.fillText(b.rarity.toUpperCase(), bx + size / 2, 456)
  })

  font(ctx, `600 18px ${FONTS.mono}`)
  ctx.fillStyle = c.paperDim
  const meta = [d.archetypeName.toUpperCase(), o.showScore ? `CURATION ${d.score}/100` : null, `${fmt(d.saved)} SAVES`].filter(Boolean).join('  ·  ')
  ctx.fillText(meta, CARD_W / 2, 512)
  ctx.textAlign = 'left'

  bars(ctx, d, 56, 548, CARD_W - 112, 14, c)
  footer(ctx, c, c.paperDim, 56, 616)
}

export async function exportPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
