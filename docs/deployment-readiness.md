# Deployment readiness audit

Audited 2026-10-29 against commit `6d905c6`. Provider facts were checked the same day on the official pages cited at the end.

## Verdict: READY WITH BLOCKERS

The code is ready for a free deployment: Vercel for the frontend, Render free for the API, Neon free for Postgres. The fixes this audit called for are listed under "Fixed in this pass".

What still blocks a **live** launch needs the owner's accounts, not code:

1. An X developer app with OAuth 2.0 enabled.
2. Pay-per-use API credit on that app.
3. The three hosting accounts.

Without the X app, the site can go live in **demo mode** today.

A successful build was not treated as proof of readiness. Nothing below claims a remote deployment, a live X login or a real Neon connection. None of those has been exercised yet.

## What the audit found

### Stack

| Part | What it is | Build / start |
|---|---|---|
| Frontend | React 19, Vite 8, TypeScript, Tailwind 4, React Router 7 (SPA) | `npm ci && npm run build`, output `frontend/dist` |
| Backend | FastAPI, SQLAlchemy 2, Alembic, psycopg 3, httpx, `cryptography` | `alembic upgrade head && uvicorn app.main:app` |
| Database | PostgreSQL. Two migrations; categories are seeded by `0001` | Alembic, transactional and idempotent |
| Package managers | npm (`package-lock.json`), uv (`uv.lock`) | |
| Tests | pytest on real Postgres, Vitest with jsdom, Playwright E2E with fixture X | |

Baseline before any change: 107 backend tests passed; ruff and format checks were clean. 37 Vitest tests passed. Type-check, lint (two pre-existing fast-refresh warnings) and the production build were clean.

### Already works

- **OAuth.** Authorization Code with PKCE (S256) as a confidential client, using Basic auth on the token, refresh and revoke calls. `state` is single-use, stored hashed, expires after 10 minutes, and is bound to the browser by a cookie scoped to `/api/auth/x`. The post-login redirect only goes to a fixed list of paths. The scopes `tweet.read users.read bookmark.read offline.access` are the minimum the bookmarks endpoint needs, plus `offline.access` so a rescan doesn't need a new login. This matches the current X docs.
- **Tokens.** Encrypted at rest with AES-256-GCM, with associated data tied to the user and the token kind. Refreshed when expired, revoked at X on disconnect or delete, and never sent to the browser.
- **Sessions.**
  - The session ID is an opaque 256-bit value; only its HMAC hash is stored.
  - Cookie: `HttpOnly`, `SameSite=Lax`, with the `__Host-` prefix and `Secure` in production. TTL 24 h.
  - Each session has its own CSRF token, required on every POST and DELETE. Logout deletes the session row.
- **Isolation.** Every data query filters by the session's user. Another user's scan or bookmark returns the same 404 as a missing one. Share cards carry totals only.
- **Logs.** JSON, with credentials redacted. The uvicorn access log, which would include the OAuth `code`, is off.
- **Production refuses to start** if secrets are missing, if fixture mode is on, or if any URL is not `https://`.
- **Demo mode** runs entirely in the browser, is labelled everywhere, and is never mixed with live data. Live data is never written to browser storage.
- **Interrupted scans** are marked failed on boot, so a restart can't leave a scan stuck.

### Missing or unsafe at audit time

| # | Issue | Severity |
|---|---|---|
| 1 | **Unbounded X API spend.** Any X user could sign in and start scans. Each full scan reads up to 800 posts at $0.005, about $4. Deleting the account and reconnecting skipped the cooldown, and nothing capped total spend. | Launch blocker |
| 2 | **No plain sign-out.** "Disconnect" and "Delete" both revoked access and deleted everything. A user could not end a session and keep their library. | Launch blocker |
| 3 | **Bookmark text kept indefinitely.** Nothing expired an abandoned account's data. | Launch blocker |
| 4 | **The health check queried the database.** Render probes every few seconds, so Neon's compute would never scale to zero and would burn through the 100 CU-hour monthly quota. | Deploy blocker |
| 5 | **Deploy config targeted paid plans.** `render.yaml` used `plan: starter` and a Render Postgres. There was no Vercel config, and only one image that bundles the SPA. | Deploy blocker |
| 6 | **No `Origin` check** on state-changing requests. CSRF tokens and SameSite already cover this, so this is defence in depth. | Should fix |
| 7 | **`BACKEND_URL` unused but required** in production. | Cleanup |

### Fixed in this pass

See "Changes" in [deployment.md](deployment.md) for files and tests.

1. **Spend controls.**
   - `X_DAILY_BUDGET_USD` sets a global daily cap (default $5.00). It is tracked in a usage ledger that survives account deletion. Scans refuse to start, or stop early and keep what they have, once it's reached.
   - `ALLOWED_X_USERNAMES` is an optional sign-in allowlist for a private beta.
   - The suggested `SCAN_MAX_BOOKMARKS` for the free launch is 200.
2. **Separate sign-out.** It ends the session and keeps data. Disconnect and Delete stay destructive, and the UI says which is which.
3. **Retention.** Accounts with no sign-in or scan for `DATA_RETENTION_DAYS` (default 90) have their tokens revoked and all data deleted. This runs on boot and every 6 h.
4. **Health checks.** `/api/health/live` is the database-free probe for the host; `/api/health` stays as the deep check.
5. **Deploy config.**
   - `frontend/vercel.json` for the SPA plus the `/api` proxy.
   - `backend/Dockerfile` for an API-only image.
   - `render.yaml` on the free plan with no Render database.
   - Engine pool settings sized for Neon.
6. **`Origin` check** on POST and DELETE in production.
7. **`BACKEND_URL` removed.**

### Remaining risks, acceptable for launch

- **Cold starts.** Render free spins down after 15 minutes idle and takes about a minute to wake. The first API call after a quiet spell is slow; Vercel's 120 s proxy timeout covers it. The landing page and demo are served by Vercel and are never slow.
- **Restarts.** "Render might restart the service at any time." A scan in progress then fails and can be retried; stored data is unaffected.
- **Rate limiting** is per process and per IP. That's fine on one instance. Someone who calls the Render URL directly can forge `X-Forwarded-For` to dodge the per-IP auth limit, but not the spend cap.
- **Backups.** Neon free has a 6-hour restore window and no backups. Take a `pg_dump` before risky changes.
- **Licence.** Vercel Hobby is for non-commercial personal use only. Move to Pro if the product earns money.

## Recommended architecture

```
Browser ── https://<app>.vercel.app ── Vercel (Hobby, free)
             ├─ /*      static SPA from frontend/dist (index.html fallback)
             └─ /api/*  external rewrite ──▶ https://<api>.onrender.com/api/*
                                              Render free web service (Docker, backend/)
                                              ├─▶ Neon Postgres (free, direct endpoint, TLS)
                                              └─▶ api.x.com (OAuth + bookmarks)
```

Why this shape:

- **First-party cookies.** The browser only ever talks to the Vercel origin, so the session cookie is first-party. Third-party cookie blocking, CORS and `SameSite=None` never come into play, and X needs a single callback URL: `https://<app>.vercel.app/api/auth/x/callback`. The Vite dev proxy already works this way locally.
- **No new infrastructure.** No Redis, queue or object storage. Scans are a few HTTP pages, run in a background thread, with progress kept in Postgres.
- **The demo survives a dead API.** If the API is missing or asleep, the frontend shows "live scanning isn't enabled" and the demo keeps working.

### Options compared (checked 2026-10-29)

| Option | Free? | Fit | Verdict |
|---|---|---|---|
| **Render free web service** | Yes. 750 h/month, 512 MB, 0.1 CPU; spins down after 15 min idle | Runs the existing Docker image unchanged. `PORT` is supplied. Background threads are fine while awake. | **Chosen** |
| Koyeb free instance | Yes. One instance, 512 MB, 0.1 vCPU; scales to zero after 1 h; Frankfurt or Washington only | Also compatible, with fewer cold starts | Good fallback |
| Single Render service serving the SPA (the existing root `Dockerfile`) | Yes | Simplest, but the landing page cold-starts too | Kept as an option |
| Google Cloud Run | Has a free tier but needs a billing account | Request-based billing throttles CPU after the response, which starves scans. Instance-based billing costs more. | Rejected |
| Fly.io | No free tier for new organizations | | Rejected |
| Railway | $5 one-time trial, then $1/month credit | Too small for an always-available API | Rejected |
| Render Postgres free | Expires after 30 days, deleted 14 days later | | Rejected, use Neon |
| **Neon free** | 100 CU-h/month per project, 1 GB storage, 5 GB egress; scales to zero after 5 min; never deleted for inactivity | Plain Postgres; Alembic works unchanged | **Chosen** |

**Neon connection choice.** The API is one long-running process with a small pool (5 connections, plus 5 overflow), so it uses Neon's **direct** endpoint with `sslmode=require`. The `-pooler` endpoint runs PgBouncer in transaction mode, which buys nothing here. Neon also recommends the direct endpoint for migrations.

### Cost assumptions

| Item | Cost |
|---|---|
| Vercel Hobby | $0 |
| Render free | $0 within 750 h/month (one always-awake service would use about 730 h) |
| Neon free | $0. If the 100 CU-h run out, the compute is suspended, not billed. |
| **X API** | **Not free.** Pay-per-use: $0.005 per post read, $0.010 per user read, so a full 800-bookmark scan costs about $4 and a 200-bookmark scan about $1. Reading the app owner's own bookmarks may count as an "Owned Read" at $0.001. Capped by `X_DAILY_BUDGET_USD`. |

Only the X API can generate a bill. The daily cap and per-scan limit bound it. Set a spend limit in the X developer console as well.

## Sources (fetched 2026-10-29)

- Vercel Hobby: https://vercel.com/docs/plans/hobby
- Vercel fair use (non-commercial clause): https://vercel.com/docs/limits/fair-use-guidelines
- Vercel rewrites and forwarded headers: https://vercel.com/docs/routing/rewrites
- Vercel request headers: https://vercel.com/docs/headers/request-headers
- Vercel limits (120 s proxied request timeout): https://vercel.com/docs/limits
- Vercel Vite guide (SPA fallback): https://vercel.com/docs/frameworks/frontend/vite
- Render free: https://render.com/docs/free
- Render compute plans: https://render.com/docs/compute-plans
- Render web services and `PORT`: https://render.com/docs/web-services
- Render pre-deploy command (paid only): https://render.com/docs/deploys
- Render health checks: https://render.com/docs/health-checks
- Koyeb instances: https://www.koyeb.com/docs/reference/instances
- Koyeb pricing: https://www.koyeb.com/pricing
- Fly.io pricing: https://docs.fly.io/about/pricing
- Railway trial: https://docs.railway.com/reference/pricing/free-trial
- Cloud Run billing settings: https://docs.cloud.google.com/run/docs/configuring/billing-settings
- Neon plans: https://neon.com/docs/introduction/plans
- Neon compute lifecycle: https://neon.com/docs/introduction/compute-lifecycle
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
- X OAuth 2.0 Authorization Code with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X user access tokens and revoke: https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token
- X bookmarks endpoint: https://docs.x.com/x-api/users/get-bookmarks
- X API pricing: https://docs.x.com/x-api/getting-started/pricing

**Not confirmed in the docs:**

- Whether Vercel forwards `Cookie` and `Set-Cookie` unchanged through external rewrites. Rewrites are proxies, so this is expected, but it must be verified after the first deploy (checklist step 10).
- The lifetime of X refresh tokens and whether they rotate. The code stores whatever refresh token X returns.
