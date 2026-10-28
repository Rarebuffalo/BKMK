# BKMK.exe — Design system

The tokens live in `frontend/src/index.css` (`:root` plus Tailwind `@theme`). The share-card canvas reads the same CSS variables at render time, so the UI and the exported PNG never drift apart.

## Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0a0c0a` | Page background (green-tinted black, never pure black) |
| `--ink-2` | `#111411` | Panels |
| `--ink-3` | `#181c18` | Raised surfaces, modals, title bars |
| `--ink-4` | `#20261e` | Hover, empty meter segments |
| `--line` / `--line-strong` | `#2a3128` / `#3d4739` | Borders: default / emphasised |
| `--paper` | `#ede9dd` | Primary text (warm off-white) |
| `--paper-dim` | `#aeb3a4` | Secondary text (≈ 9:1 on ink) |
| `--paper-faint` | `#808a79` | Tertiary text and labels (≈ 5:1 on ink, AA) |
| `--phosphor` | `#86f26b` | Signature accent: primary actions, active states, focus ring |
| `--phosphor-ink` | `#0b1f07` | Text on phosphor |
| `--signal` | `#72b8ff` | Secondary information |
| `--amber` | `#ffb547` | Demo/warning state, special badges |
| `--violet` | `#b9a0ff` | Rare badges |
| `--danger` | `#ff6f61` | Errors, destructive actions |

**Rules**

- Phosphor is an accent, not a theme. At most one phosphor-filled element per view (the primary CTA). Elsewhere it appears only as small marks.
- No gradients on surfaces. There is one very faint radial glow on the body and none on cards.
- No glassmorphism. Backdrop blur appears only on sticky bars, for legibility.

### Topic palette (data visualisation only)

`ai #72b8ff`, `engineering #86f26b`, `devtools #3fd9c1`, `startups #ffb547`, `growth #ff8a5c`, `design #ff86bd`, `security #dcd65c`, `research #b9a0ff`, `productivity #d2a77c`, `other #5f675b`.

These colours appear in charts, topic markers, the DNA barcode and the scan grid. Content types use a neutral ramp so they don't compete with topic colours.

### Archetype colours

| Archetype | Colour | Icon |
|---|---|---|
| Builder | phosphor | wrench |
| Researcher | signal | lens |
| Explorer | amber | compass |
| Curator | violet | cabinet |
| Idea Hunter | startups amber | bulb |
| Rabbit-Hole Explorer | design pink | spiral |
| Collector (fallback) | paper-dim | disk |

## Typography

| Role | Font | Notes |
|---|---|---|
| Display (`.display`) | Archivo Variable, `font-stretch: 125%`, weight 800, tracking −0.02em, leading 0.95 | Headlines, archetype names, big numbers |
| Body | Archivo Variable, normal width | 16px base, 1.5 leading |
| Data (`.data`, `font-mono`) | JetBrains Mono Variable, tabular numerals | Numbers, handles, logs, buttons |
| Eyebrow (`.eyebrow`) | Silkscreen 11px, +0.08em, uppercase | Section labels, badge names, wordmark. Never body text. |

All fonts are self-hosted through `@fontsource` packages, with no third-party font CDN.

**Scale**

| Level | Size |
|---|---|
| Hero display | `clamp(2.5rem, 10vw, 4.2rem)` on mobile, up to 5.2rem on desktop |
| Page title | 30–36px |
| Card title | 15–18px |
| Body | 14–16px |
| Meta | 11–12px mono |

## Spacing, radius, elevation

- **Spacing:** Tailwind's 4px scale. Page gutters are 16px on mobile, 24px at `sm`, 40px at `lg`. Card padding is 20px; card gaps are 12–20px.
- **Radius:** deliberately tight. `xs 2px` for tags, `sm 4px` for inputs and buttons, `md 6px` for panels. No pill shapes.
- **Elevation:** hard offset shadows, no blur.
  - `--shadow-hard` (`4px 4px 0 #000`) for primary buttons and raised panels.
  - `8px 8px 0 #000` for hero artefacts (card preview, scan window).

## Components

- **Buttons (keycaps):**
  - `primary`: phosphor fill with hard shadow. On press it moves 3px into the shadow.
  - `secondary`: ink-3 fill with a small hard shadow.
  - `ghost`: text only.
  - `danger`: red fill.
  - All buttons use uppercase mono labels. Sizes: `sm` 32px, `md` 40px, `lg` 52px tall.
  - Disabled buttons drop to 45% opacity.
- **Inputs:**
  - Ink background, 1–2px `line-strong` border.
  - The border turns phosphor on focus, phosphor when valid (username form), and danger on error.
  - Messages appear below the field, announced with `aria-live`.
- **Panels:** `.panel` (ink-2, 1px line, 6px radius) and `.panel-raised` (ink-3, strong line, hard shadow).
- **Window:** title bar with the pixel wordmark, a mono title and three hollow squares. Used only on the connect, scan and reveal flow.
- **Chips:** toggle filters. When active they invert to paper-on-ink, with an optional colour swatch.
- **Tags:** small mono labels with a 2px border and an optional colour dot.
- **BlockProgress:** a segmented meter (old LED-bar style), used for score dimensions, badge progress and scan steps. It has an ARIA `progressbar` role.
- **Modal / ConfirmDialog:**
  - Built on native `<dialog>`: focus trap, Escape to close, backdrop click to close.
  - Destructive confirmations are labelled `CONFIRM // IRREVERSIBLE`.
- **Toast:** bottom-centre, hard shadow, auto-dismisses after 3.2 s, `aria-live="polite"`.
- **Tooltip:** shown on hover and on focus, using the `role="tooltip"` pattern.
- **Empty and error states:**
  - Empty states use a dashed icon frame, a title, one line of copy and one action.
  - Errors use the `ERR // CODE` eyebrow, a plain-language explanation and recovery actions.

## Icons and artwork

- **UI icons:** Lucide at 13–18px, inheriting the current colour.
- **Pixel art:** 12×12 grids defined as data in `domain/pixels.ts`, rendered by `PixelIcon` (SVG) and by the canvas renderer.
- **Avatars:** generated 5×5 mirrored identicons. No external images are hotlinked.

## Badges and rarity

Each badge is a 20×20 pixel frame with a 12×12 icon centred inside. **Frame shape signals rarity**, so it reads even without colour:

| Rarity | Corner cut | Extra | Colour |
|---|---|---|---|
| Common | 2px notch | — | paper-dim |
| Uncommon | 4px chamfer | — | phosphor |
| Rare | 6px chamfer | dotted inner ring | violet |
| Special (reserved) | 7px chamfer | dotted inner ring | amber |

- **Locked badges** render in `line-strong` with a lock chip. The rule and progress stay visible.
- **Rarity is a visual tier only.** We never show a percentage of users.

## Data visualisation

- Charts are used only where they answer a question: topic share (horizontal bars), resource mix (stacked bar plus legend), score (segmented meters).
- Charts have no axes or gridlines. Values are written as text next to every bar, so colour is never the only channel.
- **DNA barcode:** each topic gets width proportional to its share. Bar widths inside a topic's span come from a hash of `topic:count`, so the barcode is deterministic and unique to the collection.

## Motion

| Name | Duration | Use |
|---|---|---|
| `rise` | 420ms snap ease | Content entering |
| `pop` | 380ms | Badge unlocks, archetype reveal |
| `flicker` | 600ms stepped | "Report ready" CRT moment |
| `blink` | 1.05s stepped | Cursors only |
| Ticker | 40s linear | Archetype code strip on the landing page |

- **Principles:**
  - Motion marks state changes (scan phase, unlock, reveal). It never just decorates idle UI.
  - The reveal is staged in 5 beats over about 2.5 s and can be skipped.
  - Revisits render instantly.
- **Reduced motion:** `prefers-reduced-motion` collapses all animations and transitions to 1ms. The archetype "decrypt" effect shows the final text immediately, and the ticker stops.

## Responsive behaviour

| Breakpoint | Layout |
|---|---|
| < 640 | Single column. The username form stacks its button under the input. Dashboard: top bar plus a 5-item bottom tab bar, with account actions in a sheet. |
| ≥ 768 (`md`) | Two-column dashboard grid |
| ≥ 1024 (`lg`) | Persistent 256px sidebar. Landing hero splits into two columns. |
| ≥ 1280 (`xl`) | Dense 12-column overview grid |

Horizontal page overflow was checked at 375px and 1024px.

## Accessibility

- Text contrast is at least 4.5:1, including faint text.
- Focus is a visible 2px phosphor outline on every control.
- All interactive elements are native buttons, links or inputs.
- Progress uses `role="progressbar"` with values. Scan counters and form messages use `aria-live`.
- Canvas cards and the barcode carry `role="img"` with labels.
- The archetype "decrypt" exposes the final text through `aria-label`.
- Everything is keyboard-operable, and `/` focuses library search.
