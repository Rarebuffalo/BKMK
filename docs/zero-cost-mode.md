# Zero-cost mode

> **Update (same day):** the primary path is now "Copy from X", a paste of the user's own bookmarks page. See [instant-analysis.md](instant-analysis.md). Archive and file import below is the fallback.

Decided 2026-10-30. BKMK.exe now runs with **no ongoing X API cost** by default. Users import a file they can export themselves, and it is analysed in their browser. Live X sync still exists, but it is off unless the owner switches it on (`LIVE_SYNC_ENABLED=true`).

## What was costing money

X's API is pay-per-use only for new developers; there's no free tier ([pricing](https://docs.x.com/x-api/getting-started/pricing)). Every outbound X call in the code:

| Call | Where | Billed? |
|---|---|---|
| `POST /2/oauth2/token` (code exchange and refresh) | `api/auth.py` callback, `services/tokens.py` | No (OAuth plumbing) |
| `GET /2/users/me` | `api/auth.py` callback, **on every sign-in** | **Yes**, a user read (~$0.010) |
| `GET /2/users/{id}/bookmarks` | `services/scan_service.py` | **Yes**, per post ($0.005; $0.001 as an "Owned Read" when the app owner reads their own) plus each expanded author ($0.010) |
| `POST /2/oauth2/revoke` | disconnect, delete, retention, allowlist refusals | No |

So the cost was the live path: sign-in plus bookmark scans. The 402 seen in production was X refusing those reads once the credit ran out. Vercel, Render and Neon cost nothing.

Already free before this change:
- The demo.
- All classification, scoring, archetypes and badges: rules-based, and in the browser for the demo.
- Share cards, search and the library UI.

## What X allows (checked 2026-10-30)

- **No free API access to private bookmarks.** Bookmarks are only available through `GET /2/users/{id}/bookmarks` with OAuth 2.0 user context, and that endpoint is pay-per-use ([docs](https://docs.x.com/x-api/users/get-bookmarks)).
- **X's data archive doesn't include bookmarks.** The official archive description lists posts, likes, DMs, lists and more, but no bookmarks. X developer-forum threads confirm this.
  - [Download your archive](https://help.x.com/en/managing-your-account/how-to-download-your-x-archive)
  - [Accessing your X data](https://help.x.com/en/managing-your-account/accessing-your-x-data)
  - [Forum: bookmarks in archive download](https://devcommunity.x.com/t/bookmarks-in-archive-download/137707)
- **It does include Likes** (`data/like.js`): post ID, full text, and the post URL.
- **There is no official bookmark export,** including bookmark folders on Premium ([bookmarks help](https://help.x.com/en/using-x/bookmarks)).
- **oEmbed** (`publish.x.com/oembed`) is free and unauthenticated, but returns public posts only and is meant for embedding. It's not used. See "Possible next steps".
- **Excluded on principle:** scraping x.com, reusing browser cookies or session tokens, internal GraphQL endpoints, and extensions that drive the logged-in site.

## Options compared

| | A. Local import (chosen) | B. User-owned X API keys | C. Other "free" routes |
|---|---|---|---|
| Cost to owner | **$0** | $0 | $0 |
| Cost to user | **$0** | Their own pay-per-use bill: Owned Reads ≈ $1 per 1,000 bookmarks, plus card setup | n/a |
| Data | Archive Likes with full text; or bookmark lists the user already has | Real bookmarks, full metadata | n/a |
| Reliability | High: no network, no rate limits, works while Render sleeps | Depends on X billing and each user's setup | Breaks whenever X changes the site |
| UX | Archive takes X a day or more to prepare; then one drop of a file | Each user must create an X developer account and app, buy credit and paste keys: a heavy ask | n/a |
| Privacy | Best: the file never leaves the browser | Keys and bookmarks pass through our server | Session theft risk |
| Terms risk | None: users' own exports | Sharing developer credentials with a third-party service is a grey area under X's Developer Agreement | **Violates X's terms. Rejected.** |
| Complexity | Moderate, all frontend | High: per-user client registration, secret storage, per-user callbacks | n/a |

**Decision: A, with live sync kept as an explicit, optional feature.**

- A is the only option that is free for both the owner and the user, honest about what it contains, and within X's rules.
- B is technically possible, but it moves an X developer account and a bill onto every user. Many users would get stuck, and storing third-party developer secrets is a liability. It's documented below as a future option, not built.
- For the owner's own use, live sync with `LIVE_SYNC_ENABLED=true` and `ALLOWED_X_USERNAMES=<you>` costs about $0.001 per bookmark as an Owned Read. That's about $0.80 for a full 800-bookmark scan, still capped by `X_DAILY_BUDGET_USD`.

## What works without any paid X API call

- **Import:**
  - The X archive `.zip`, streamed: only `data/like*.js` and `account.js` are decompressed.
  - Or `data/like.js` on its own.
  - CSV with a `url` column (Raindrop, Readwise Reader, spreadsheets).
  - JSON: BKMK.exe's own export, X API-shaped dumps, or arrays of links.
  - Browser bookmarks HTML.
  - Pasted X post links.
- **Validation:**
  - Each file gets its own error message, and one bad file doesn't stop the others.
  - Non-post entries are counted and skipped.
  - Duplicates are merged by post ID, keeping the richest copy.
  - Imports over 5,000 posts keep the newest 5,000 and say so.
  - An empty import says so instead of showing an empty report.
- **The full experience on imported data:**
  - The scan animation, with real counts.
  - The Bookmark DNA reveal: archetype, Curation Score and badges.
  - The dashboard, topics and achievements.
  - Searchable library, JSON export and share card.
- **Labelling:** every result is tagged IMPORTED, never LIVE or DEMO. Captions for Likes say "likes", not "bookmarks".
- **Server:** nothing. The backend isn't involved, so this works even while Render is asleep.

## Limitations (stated in the UI)

- **Likes are not bookmarks.** It's the closest signal X lets users export. The import page, reveal note and share caption all say so.
- **Archive Likes have no author and only `t.co` short links.**
  - Author stats are empty.
  - Link types such as repo, paper and video are mostly unknown, so resource diversity and depth tend to score lower.
  - The coverage note explains this.
- **A plain list of links has no post text,** so topics can't be read from it. The UI warns before analysis.
- **Post dates come from the post ID,** which encodes creation time from November 2010 onwards. Older posts show "date unknown". X never exposes when something was bookmarked or liked.
- **Storage.** The analysed library is kept in this browser's local storage. It isn't synced across devices, and it's cleared by Settings → Delete or by clearing site data. Very large imports may not fit in local storage; then they stay for that session only.
- **The archive takes X a day or more to generate.**

## Possible next steps (not built)

- **oEmbed enrichment** for link-only imports: fetch public post text and author through `publish.x.com/oembed`. It's free and documented as fine for bulk use. Open questions:
  - It only covers public posts.
  - Throttling is reported (429/404).
  - It's framed as an embedding API.

  It would need a cached, rate-limited server proxy (CORS) and a terms check first.
- **User-owned credentials (Option B)** if there's demand from power users.
- **Server-side persistence for imports.** It would need an account system that doesn't use X sign-in, because X sign-in itself is a billed read.

## Switching live sync on (owner only)

Set `LIVE_SYNC_ENABLED=true` on Render, along with `X_CLIENT_ID` and `X_CLIENT_SECRET`, and fund the X developer account. Keep `ALLOWED_X_USERNAMES` and `X_DAILY_BUDGET_USD` set. With it off, every live entry point stops before contacting X: sign-in, the callback, scan creation and already-queued scans. `backend/tests/test_zero_cost.py` enforces this.
