# Cost model

## Confirmed provider pricing

From the [X pricing page](https://docs.x.com/x-api/getting-started/pricing), checked 2026-10-28. Pay-per-use, with credits bought in advance:

| Resource | Price |
|---|---|
| Post read | **$0.005** per post returned |
| User read | **$0.010** per user returned |
| "Owned reads" (your own data through your own app) | $0.001 per resource |
| Deduplication | Same resource billed once per UTC day (a "soft guarantee") |
| Monthly cap | 3M post reads per billing cycle on pay-per-use |
| Free tier | None stated on the pricing page |

These pricing points **can't be verified without credentials**:

- **Owned reads.** Whether bookmarks of *other* users who signed into our app count as owned reads. We assume they don't (the pessimistic case).
- **Author expansion.** Whether `expansions=author_id` (the users in `includes`) is billed as user reads. We assume it is.

## Requests and cost per scan

- Bookmarks are 100 per page, with a hard cap of 800, so a scan makes at most 8 pages plus `/users/me` at sign-in.
- Unique authors are assumed to be 35% of bookmarks for small collections and ~300 at 800.

| Scenario | Posts read | Users read | Requests | Estimated cost |
|---|---|---|---|---|
| Sign-in (`/users/me`) | 0 | 1 | 1 | $0.01 |
| First scan, small (50) | 50 | ~18 | 1 | **$0.43** |
| First scan, typical (300) | 300 | ~110 | 3 | **$2.60** |
| First scan, maximum (800) | 800 | ~300 | 8 | **$7.00** |
| Same, `X_EXPAND_AUTHORS=false` | 800 | 0 | 8 | **$4.00** |
| Refresh (one page of 25, 3 new authors) | 25 | 3 | 1 | **$0.155** |
| Repeat within the same UTC day | — | — | — | ≈ $0 (deduplicated, not guaranteed) |

Every scan records `api_requests`, `api_posts_read`, `api_users_read` and `estimated_cost_usd`. The prices come from `X_PRICE_*` settings, so the estimate follows price changes.

## Monthly projections

Assumptions:

- Average first scan of 300 bookmarks: $2.60.
- 30% of monthly active users refresh twice a month: $0.31.
- New users are 40% of MAU.

| MAU | New (first scans) | Refreshing | X API / month (estimate) |
|---|---|---|---|
| 100 | 40 × $2.60 = $104 | 30 × $0.31 = $9 | **≈ $113** |
| 1,000 | $1,040 | $93 | **≈ $1,130** |
| 10,000 | $10,400 | $930 | **≈ $11,300** |

With authors off and the cap lowered to 200 (`SCAN_MAX_BOOKMARKS=200`), a typical first scan costs about $1.00. That brings 1,000 MAU down to roughly $430 a month.

## Hosting and database

| Item | Cheapest realistic option | Notes |
|---|---|---|
| Frontend | Vercel Hobby (free, non-commercial) | Static SPA plus the `/api` proxy |
| API | Render free web service | Sleeps after 15 min idle and wakes in about a minute. An active scan polls, which keeps it awake. Upgrade to Starter if cold starts hurt. |
| Postgres | Neon free (1 GB, 100 CU-h a month) | ~1–2 KB per bookmark, so 1 GB holds roughly 500k bookmarks. Paid tiers are needed long before 10k users. |
| Redis or queue | Not needed | Scans finish in seconds in-process |
| AI | None | $0 |

Hosting is small compared with X API costs. **The X API is the dominant cost.**

## Free-first: what's realistic

The product can't be free and unlimited:

- **Every first scan costs real money.** Roughly $0.40–$7 per user.
- **There's no confirmed free tier.** New accounts get one-off credit promotions (e.g. $20 after the first purchase), which isn't sustainable.

Recommended launch settings:

1. **Spending limit in the X Developer Console.** This is the hard backstop.
1. **`X_DAILY_BUDGET_USD`** (blueprint: $2). An in-app global cap per UTC day, in a ledger that account deletion can't reset. Scans refuse to start, or stop early and keep what they read.
2. **`SCAN_MAX_BOOKMARKS=200` for free users,** stated in the UI. Raise it to 800 behind a paid tier or for invited testers.
3. **`X_EXPAND_AUTHORS=false`** if the author filter can be lost. That cuts about 40% of cost.
4. **Rely on refresh scans.** Automatic for returning users; small pages that stop at the first known post.
5. **`SCAN_COOLDOWN_SECONDS=3600`**, as in the Render blueprint, so repeated scans are mostly deduplicated anyway.
6. **Invite-only for the 20–50 user research launch.** Budget about $50–150.

## Unknown costs to measure

- Real distribution of bookmark counts and unique authors per user.
- Whether expansions and owned reads are billed as assumed. Check the Developer Console usage report after the first real scans.
- Retry overhead from rate limits.
- Database growth per active user.
