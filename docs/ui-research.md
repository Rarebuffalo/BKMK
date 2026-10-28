# BKMK.exe — UI/UX research

Practical research that shaped the frontend prototype. Each source is tagged by how it was checked:

- **[observed]**: the page was rendered in a browser or fetched this session.
- **[secondary]**: from search results or third-party pages.
- **[unverified]**: prior knowledge, not checked this session.

---

## 1. Matiks (https://matiks.com)

Matiks is a 1v1 mental-math duel game ("just like chess, but with math"). Plain HTTP fetches get a 403, so the site was rendered in a browser. In-game screens were not reachable without signing up.

### What we observed

- **Instant comprehension [observed].**
  - A condensed all-caps headline ("TURN SCREEN TIME INTO SMART TIME"), with the payoff words in lime green on near-black.
  - A one-line subline ("Fast mental duels against real players").
  - A phone mock-up showing a live duel. You see the game before you read about it.
- **One obvious first action [observed].** The hero has a single primary CTA; desktop play is a secondary link.
- **Sticker-style sections, little copy [observed].** "THINKING IS A SPORT", "STREAKS REFLECT MOMENTUM… not reminders to come back", "GAME MODES THAT DEFINE YOUR PLAY-STYLE". Each section is a two-to-four-word title, one line of copy and one bold illustration.
- **Ends on a dare [observed].** The last section reads "LET'S SEE WHAT YOUR BRAIN CAN DO", not a feature list.
- **Live odometer counter [observed].** A digit-cell "total users" counter that ticked up while we watched. It is real data presented as a game element.
- **Friction [observed].** The web flow needs sign-up (phone, Google or Apple) before the first duel. There is no guest play.
- **In-game [secondary, App Store listing].** Adaptive difficulty, leagues, streak shields, post-duel reviews and per-game ratings. **Not observed:** duel animations, the result screen, rematch and the mobile layout.

### UX principles adapted for BKMK.exe

1. **Show the artifact, not a description.** The landing hero shows a real rendered share card. It is the same canvas renderer that exports the PNG, and it updates live as you type your handle.
2. **One verb, one field.** The username input is the visual focus, with one primary CTA: "Scan my Bookmark DNA". Other CTAs on the page are text links or reuse the same form.
3. **Frame it as play, not utility.**
   - Archetype codes such as `BUILD_MODE` and `ONE_MORE_THREAD` run in a ticker.
   - "Which one are you?" builds curiosity.
   - The final CTA is a dare: "Let's see what you've been saving."
4. **Show momentum, not guilt.** Badges show an "Almost: Deep Diver 46/50" next step instead of nagging. We added no streaks, because there is no daily action worth streaking.
5. **Numbers as game elements, but only real numbers.**
   - The scan uses a large tabular counter and a cell grid, tied to retrieved pages.
   - We did **not** copy the live global user counter. We have no real data for one, and inventing it would break our "no fake metrics" rule.

We did not reuse any of Matiks' branding, illustrations or layout.

---

## 2. Reference products

| Product | What it does well | Pattern | How BKMK adapts it | What we do differently |
|---|---|---|---|---|
| **WakeMark** (wakemark.app) [secondary] | AI auto-tagging, chat with citations, MCP server, digests | Organizer as an AI knowledge tool | Validates demand for "rediscover your saves" | No AI in the core. Identity and fun come first, then utility. |
| **Dewey** (getdewey.co) [observed] | Search across text, tags and authors; AI tag suggestions *you review*; CSV/Notion export; list/grid views | Utility depth and user control | Library search covers text, authors and links; author, type and date filters; JSON export | No folders or manual tagging in v1. Classification is automatic and its rules are explained. |
| **Tweetsmash** (tweetsmash.com) [observed] | Official X OAuth, "never your password" stated up front; Cmd+K; digests | Trust copy next to the auth action | The authorize screen shows a "will / will never" permission list right beside the button | — |
| **Readwise X sync** [secondary] | Open that bookmark sync is "experimental" and can't detect threads | Being honest about API limits | The scan states the 800-bookmark API cap; partial scans are labeled; deleted posts are counted and excluded | — |
| **Wordware Twitter Personality** (twitter.wordware.ai) [secondary] | Went viral in July 2024: no login, humor, roast tone | Humor and a little sting drive sharing | Each archetype has a witty tagline ("Just one more thread.") | We can't analyze others' handles (bookmarks are private). Results never live at a public per-handle URL. People mostly shared *screenshots*; we give them a designed card. |
| **Receiptify** [observed] | One borrowed metaphor (a receipt) carries the whole design | Commit to a single metaphor | Our metaphor is the **archive index card / scan printout**, plus the "DNA barcode" | Three variants of one system, not unlimited themes |
| **github-readme-stats** [observed] | The image *is* the product; themes are parameters | A generated image as the artifact | The share card is drawn from data on `<canvas>`, never a DOM screenshot | We deliberately **don't** show letter grades or percentiles. Without population data they would be invented. |
| **Spotify Wrapped** [secondary] | One stat per beat, big type, sharing at every step | Staged reveal | The reveal runs in 5 short beats: identity → count and DNA → archetype decrypt → score/interests/badges → actions | Brief (~2.5 s) and skippable, not a 10-card story |
| **Duolingo badges** [secondary + observed blog] | Celebration with share, badges moved into a visible collection, personal records | Visible cabinet; locked badges show the goal | Achievement cabinet with progress meters; badge modal with a share action | No streaks or currency |
| **Steam achievements** [secondary] | Rarity shown as % of players; hidden achievements | Rarity as a status signal | Rarity is a **visual tier** (common → rare) with its own frame shape | No percentages until we have real aggregate data |
| **Poolsuite** (poolsuite.net) [observed] | Fully committed retro OS metaphor, while controls stay obvious | Window chrome | Window chrome only on the connect → scan → reveal flow | The dashboard stays calm and modern. No window-in-window on mobile. |
| **PostHog** [secondary] | Personality inside a data product | Playful microcopy in serious UI | Terminal-style microcopy in the scan log and errors (`ERR // AUTH_EXPIRED`) | — |

### Share image format

- X's archived `summary_large_image` spec is 2:1 [secondary].
- In-feed **attached** images commonly use 16:9 (1200×675) [secondary].
- **Decision:** the downloadable card is **1200×675**. Key content stays inside a centered safe zone, about 38 px clear of the top and bottom edges.
- A future server-rendered Open Graph image for link previews should be a separate ~1200×630 render.

### X API constraints that affect UX [observed in official docs search]

- The bookmarks endpoint returns only the user's **800 most recent** bookmarks.
- It needs OAuth 2.0 Authorization Code with PKCE.
- The per-user rate limit is 180 requests per 15 minutes.
- The scan grid is designed around this limit: 160 cells × 5 saves = 800.
- **Pricing tier and access for new developers must be confirmed** before the backend phase. Third-party sources say the old Basic tier is closed to new sign-ups.

---

## 3. Design opportunities

- **Nobody owns "identity from your saves".** Every bookmark tool is a "manage your pile" utility. BKMK leads with a collectible identity and keeps the utility behind it.
- **A share artifact that isn't a screenshot.** A designed card with real aggregates and no private content.
- **A signature visual: the DNA barcode.** Every collection produces a deterministic barcode from its topic mix. It appears in the scan (cells recolor into topics), the reveal, the dashboard and the card.
- **Transparency as a feature.** "How it's scored", "Why this archetype?" and visible badge rules make the gamification feel earned rather than arbitrary.

## 4. Creative direction

> *A playful digital archive that scans your saved internet and turns it into a collectible identity.*

The look is library index cards meeting a phosphor terminal: near-black "ink" surfaces, warm "paper" text, a phosphor-green signal colour, and hard offset shadows that make buttons feel like keycaps. The type does most of the work:

- An **expanded grotesque** (Archivo at 125% width) for loud, poster-like headlines.
- A **monospace** (JetBrains Mono) for data and terminal voice.
- A **pixel face** (Silkscreen) only for small labels, badges and the wordmark.

## 5. Key decisions and why

| Decision | Why |
|---|---|
| The username form is the only hero CTA | Matiks and receiptify: one action, zero ambiguity |
| Live card preview in the hero, personalized as you type | Shows the artifact; cheap personalization creates intent |
| Canvas-rendered share card (no html-to-image dependency) | Preview == export; deterministic; no DOM/CORS issues; no extra dependency |
| Pixel art stored as data grids | One source of truth for SVG (UI) and canvas (PNG) |
| Window chrome only on connect/scan/reveal | Retro where it's memorable, modern where people work |
| Scan progress counts pages and phases, not a fake percentage | The X API gives no total up front; honest progress |
| Archetype falls back to "The Collector" | Spec: weak evidence → neutral label, never a forced one |
| No percentiles, no rarity percentages, no user counts | No representative data yet |
| Demo is labeled everywhere (banner, tags, card stamp, disabled "Open on X") | Synthetic posts must never pass as retrieved X posts |
| Badges never revoked, never double-awarded | Spec: versioned thresholds; rescans add nothing |
| No streaks or XP in v1 | No natural daily action; avoids a manufactured grind |
