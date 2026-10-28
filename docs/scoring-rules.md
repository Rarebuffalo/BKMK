# Scoring, archetype and achievement rules

Everything here is deterministic and runs without AI. The same bookmarks under the same rules version always give the same result. The rules are implemented twice, with identical constants:

- **Live:** `backend/app/rules/`, for real accounts.
- **Demo:** `frontend/src/domain/`, which runs in the browser on sample data.

Both are tested:

- **Backend:** `backend/tests/test_rules.py` covers fixture datasets (empty, small, specialist, diverse, developer-heavy, founder-heavy, mixed, researcher), checks golden values, and runs partial and duplicate scans through `test_scans.py`.
- **Frontend:** `frontend/src/domain/rules.test.ts`.

## Versions

| Rule set | Version | Notes |
|---|---|---|
| Classifier (backend) | `classifier-v2` | v1 rules plus confidence, secondary tags, domain topic hints and certainty of content type |
| Classifier (demo) | `classifier-v1` | Keyword and domain rules only. Sample data doesn't need confidence. |
| Curation Score | `score-v2` | See the change log |
| Archetype | `archetype-v1` | |
| Achievements | `achievements-2026.10-v1` | |

Every scan row stores the combined `rules_version`. Each bookmark stores its classifier version and is reclassified automatically when the classifier version changes.

## Classification (`classifier-v2`)

- **Topic.** Each topic has a keyword list (`rules/topics.py`):
  - Keywords of three characters or fewer must match whole words, so "ui" doesn't match "build".
  - A recognised link domain adds one point to its topic: arxiv to research, GitHub to dev tools, Hugging Face to AI, Figma to design.
  - The highest score wins. Ties go to the earlier topic in the list, which keeps results stable.
- **No match.** The bookmark goes to `other` ("Unsorted") with `classification_status = unclassified`. Nothing is forced into a confident category.
- **Confidence.** `min(1, 0.35 + 0.15 × points)`, multiplied by 0.6 when the runner-up topic ties.
- **Secondary tags.** Up to two other topics that score at least half of the winner's points.

**Content type**

| Signal | Type | Certain? |
|---|---|---|
| GitHub, GitLab or Codeberg link | `repo` | yes |
| arXiv, OpenReview, bioRxiv, Nature, ACM or IEEE link | `paper` | yes |
| YouTube or Vimeo link | `video` | yes |
| Substack, Medium, dev.to, Hashnode, `blog.*` or `/blog/` link | `article` | yes |
| Conversation root plus a thread marker (🧵, "thread", "1/") | `thread` | **no, heuristic** |
| X long-form post (`note_tweet`) | `article` | yes |
| Any other external link | `tool` | **no, heuristic** |
| Otherwise | `post` | yes |

**Limits:**

- Thread detection would need extra billed API calls to confirm, so the UI labels heuristic types "likely".
- External pages are never fetched.
- "Tutorial" and "opinion" types are not inferred: the available data can't support them reliably.

## Curation Score (`score-v2`)

Four dimensions, each worth 0–25 points. The total is their sum (0–100). It describes the collection, not the person.

| Dimension | Formula | Intent |
|---|---|---|
| Topic exploration | `25 × (1 − e^(−(E_topics − 1)/4)) × S` | E is the effective number of topics (exp of Shannon entropy). It measures proportions, with diminishing returns. |
| Resource diversity | `25 × (1 − e^(−(E_types − 1)/2.2)) × S` | Effective number of content types |
| Collection depth | `25 × min(1, substantial_share / 0.85)` | Share of threads, articles, repos, papers, videos and tools |
| Metadata coverage | `25 × classified / accessible` | Share of bookmarks placed in a topic |

`S = min(1, accessible / 30)` is the small-sample factor added in v2.

**Safeguards (each one tested):**

- **Size alone doesn't raise the score.** Multiplying every topic count by 10 gives the same score.
- **Deleted or protected posts are excluded,** never penalised.
- **Small collections aren't inflated.** Five bookmarks in five topics score ≤ 5 on exploration.
- **Partial scans are labelled.** `coverage = partial` is stored and shown, the archetype is marked `provisional`, and the UI says so.
- **No percentiles or rankings** against other users.

**Golden values** (`test_rules.py`): diverse fixture = 94, specialist fixture = 59. If either changes, the formula changed: bump the version.

### Change log

- **score-v1 → score-v2 (2026-10-28).** Testing showed a 5-bookmark collection spread across 5 topics scoring near-maximum on exploration and diversity. Effective counts from a handful of items are noise. v2 scales those two dimensions linearly up to 30 bookmarks. Collections of 30 or more score the same as under v1.

## Archetypes (`archetype-v1`)

Signals, each clamped to 0–1:

| Archetype | Signal |
|---|---|
| Builder | 1.2 × share(engineering + devtools) + 0.8 × share(repo + tool types) |
| Researcher | 1.1 × share(research + AI) + 0.35 × share(paper + thread + article) |
| Idea Hunter | 1.6 × share(startups + growth) |
| Explorer | (E_topics − 3) / 4, only when no topic exceeds 30% |
| Curator | 0.6 × (E_types − 2)/3 + 0.5 × (E_topics − 4)/4, only with 6+ topics and 85%+ coverage |
| Rabbit-Hole | top-topic share + thread share, only when the top topic is ≥ 40% and threads ≥ 15% |

**How the result is chosen:**

- **Primary.** The highest signal wins. Ties are broken by name.
- **Neutral fallback.** If the best signal is below **0.35**, or there are fewer than **25** readable bookmarks, the result is **The Collector**, a deliberately neutral label.
- **Secondary.** Shown when the second signal is ≥ 0.35 and ≥ 75% of the primary.
- **Explanation.** The UI's "Why this archetype?" shows every signal and the rule that applied.

## Achievements (`achievements-2026.10-v1`)

| Badge | Rarity tier | Condition |
|---|---|---|
| First Scan | common | A successful scan with ≥ 1 bookmark |
| Bookmark Rookie | common | 25 readable bookmarks |
| Wide Explorer | uncommon | ≥ 3 bookmarks in each of 8 topics |
| Deep Diver | uncommon | 50 bookmarks in one topic |
| Thread Collector | uncommon | 25 threads |
| Open-Source Hunter | rare | ≥ 15% of bookmarks link to a public code repository |
| Curiosity Engine | rare | ≥ 5 bookmarks in each of the 4 topic families (build, business, craft, knowledge) |
| Digital Archivist | rare | 500 readable bookmarks |

**Persistence:**

- `user_achievements` has a unique key on (user, badge, rules version). Inserts use `ON CONFLICT DO NOTHING`, so repeat scans and retries never award a badge twice.
- Earned badges are **never revoked** by a later partial scan, or by bookmarks deleted on X.
- **Badges that change.** A retired badge stays in the database but isn't shown. A new badge is evaluated on the next scan. Changing a threshold means bumping the version; earlier awards keep their version.
- **Rarity is a visual tier only.** No ownership percentages are shown until there's representative, privacy-respecting aggregate data.
