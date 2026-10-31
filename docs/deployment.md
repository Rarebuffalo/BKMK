# Deployment

**Target:** Vercel (frontend, free Hobby plan), Render (API, free web service) and Neon (Postgres, free plan). [deployment-readiness.md](deployment-readiness.md) explains the choice and its limits; [storage-and-sessions.md](storage-and-sessions.md) explains data handling.

**Status (2026-10-29): not deployed.**

Verified locally:
- The API image builds and starts with `ENVIRONMENT=production` against Postgres.
- Migrations reach `0004`.
- `/api/health/live` and `/api/health` respond, and API docs are off.
- OAuth start redirects to X with PKCE S256, and the state cookie is `Secure` and `HttpOnly`.
- HSTS is on, and no secrets appear in the logs.
- All backend, unit and E2E tests pass.

Not verified until you deploy:
- The Vercel rewrite and its cookie passthrough.
- A live X sign-in and scan.
- The Neon connection.

```
Browser ──▶ https://<app>.vercel.app
              ├─ /*      SPA (frontend/dist)
              └─ /api/*  rewrite ──▶ https://<api>.onrender.com/api/*  ──▶ Neon Postgres
                                                                     └──▶ api.x.com
```

## Free mode is the default

Since 2026-10-30, `LIVE_SYNC_ENABLED` defaults to `false`.

- The app makes **no X API calls**, so there are no X charges.
- Users import their X archive Likes or bookmark lists, and these are analysed in their browser.
- **You don't need the X developer app, X credentials or X credit for this mode.** Steps 4 and the X variables below are only for turning on paid live sync later.
- The API and Neon are still deployed; they serve health checks and are ready for live sync. Imports don't use them.

## Deployment checklist

Do the steps in order; each one needs something from the step before.

**Stage 1** (steps 1–3) publishes the site in **demo mode**, with no X app needed.

**Stage 2** (steps 4–10) turns on live X scanning.

### 1. Create the accounts (all free; no card needed except at X)

| Service | Plan to choose | Used for |
|---|---|---|
| GitHub | Free | Hosts the repository that Vercel and Render deploy from. Push `main` first. |
| Vercel | **Hobby** | Frontend. Non-commercial use only; move to Pro if BKMK.exe earns money. |
| Neon | **Free** | Postgres |
| Render | **Free** instance type (the "Hobby" workspace plan) | API |
| X Developer Console | Pay-per-use with **pre-paid credits** | OAuth and bookmark reads. **This is the only paid part.** |

### 2. Deploy the frontend on Vercel (demo mode)

1. In Vercel, choose **Add New → Project** and import the GitHub repository.
2. Configure the project:

   | Setting | Value |
   |---|---|
   | Root Directory | **`frontend`** |
   | Framework Preset | Vite (also set by `frontend/vercel.json`) |
   | Install / Build command | `npm ci` / `npm run build` |
   | Output directory | `dist` |
   | Node.js version | 22.x (Project → Settings → Build) |

3. Optionally, add the environment variable `VITE_PUBLIC_URL`, set to `https://<app>.vercel.app`. It's public: it appears in share captions. Leave `VITE_API_BASE` **unset**.
4. Deploy, and note the production URL `https://<app>.vercel.app`. A custom domain works the same way: use it wherever this guide says `<app>.vercel.app`.

### 3. Check demo mode

1. Open `https://<app>.vercel.app/app/library` directly. Deep links must load, not 404.
2. The landing page should say live scanning isn't enabled. `/api/*` isn't wired yet, so it returns 404.
3. Run the demo scan end to end.

You can stop here and have a working public demo.

### 4. Create the X developer app (only for paid live sync)

1. In the X Developer Console, create a Project and an App.
2. Under **User authentication settings**, enable **OAuth 2.0**:
   - **Type of App:** Web App, Automated App or Bot (a confidential client).
   - **Callback URI:** `https://<app>.vercel.app/api/auth/x/callback`. It must match character for character, with no trailing slash. For local live testing, also add `http://localhost:5173/api/auth/x/callback`.
   - **Website URL:** `https://<app>.vercel.app`.
   - **Permissions:** read only. The app requests `tweet.read users.read bookmark.read offline.access`.
3. Copy the **OAuth 2.0 Client ID and Client Secret** into a password manager. Never paste them into chat, an issue or a commit.
4. Under **Billing**, buy a small amount of credit and **set a spending limit**. Reads cost about $0.005 per post and $0.010 per user ([cost-model.md](cost-model.md)).

### 5. Create the Neon database

1. In Neon, choose **New Project**: Postgres 17, in the region closest to your Render region (for example AWS US East (Ohio) with Render Ohio).
2. Open **Connection details**:
   - Turn **Connection pooling OFF**. You want the *direct* host, without `-pooler`.
   - Copy the connection string. It looks like `postgresql://<user>:<password>@ep-<id>.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require`.
3. Keep it for step 7. It's a secret.

### 6. Generate the app secrets on your machine

```bash
cd backend && uv run python -m app.cli gen-secrets
```

This prints a `SESSION_SECRET` and a `TOKEN_ENCRYPTION_KEY` in your own terminal.

- You only need `TOKEN_ENCRYPTION_KEY`; Render generates `SESSION_SECRET`.
- Store `TOKEN_ENCRYPTION_KEY` in your password manager. **If you lose it, every user has to reconnect.**

### 7. Deploy the API on Render

1. In Render, choose **New → Blueprint**, connect the repository and select `render.yaml`. It creates the free Docker web service `bkmk-api` from `backend/`.
2. Render asks for the `sync: false` values. Use the table below. Leave `ALLOWED_X_USERNAMES` empty for open sign-up, or list your own handle for a private beta.
3. Deploy. The container runs `alembic upgrade head`, then uvicorn. Watch the logs for `"msg": "bkmk started"`.

   If it exits with `Missing required production settings` or `must use https`, fix the variable it names.
4. Note the service URL `https://bkmk-api-<suffix>.onrender.com`. Check that `https://<that>/api/health` returns `"database":"ok"`.

### 8. Point Vercel's `/api` at Render

Edit `frontend/vercel.json` and put the API rewrite **first** in `rewrites`, using your exact Render URL:

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://bkmk-api-<suffix>.onrender.com/api/:path*" },
  { "source": "/((?!api/).*)", "destination": "/index.html" }
]
```

Commit and push; Vercel redeploys.

Production is configured this way: `https://bkmk-ashy.vercel.app` proxies `/api/*` to `https://bkmk-api.onrender.com`.

If `/api/*` on Vercel still returns Vercel's `NOT_FOUND` after a push, check that the commit actually deployed. The commit on GitHub should carry a "Vercel" status. If it doesn't, the push event never reached Vercel. Go to Vercel → Deployments → **Create Deployment** and pick `main`, rather than redeploying an older deployment, which rebuilds the old commit.

This is a file edit rather than a setting because Vercel rewrites can't read environment variables. Use the URL Render gave *you*: pointing at someone else's service would send them your users' cookies.

### 9. Migrations

Migrations already ran in step 7, because they run on every API boot.

To run them by hand (for example, before a risky deploy):

```bash
cd backend && DATABASE_URL='<neon direct url>' uv run alembic upgrade head
```

Rules:
- Run this from your own terminal; never paste the URL anywhere else.
- Never run `alembic downgrade` or `DROP` against production.
- Take a `pg_dump` first ([storage-and-sessions.md](storage-and-sessions.md#neon-specifics)).

### 10. Test the deployed app end to end

| # | Check | Expected |
|---|---|---|
| a | `curl https://<app>.vercel.app/api/health/live` | `{"status":"ok"}`, which proves the rewrite works |
| b | `curl https://<app>.vercel.app/api/health` | `"database":"ok"`, `"xConfigured":true` |
| c | Open the site | Live sign-in is offered; demo still works |
| d | Sign in with X and approve | Back on `/scan`; the scan runs and the reveal shows real numbers |
| e | DevTools → Application → Cookies on `<app>.vercel.app` | `__Host-bkmk_session` with HttpOnly ✓, Secure ✓, SameSite Lax. **Proves Vercel passes `Set-Cookie` through.** |
| f | DevTools → Application → Local storage | Only `bkmk.session.v2`, with no bookmark text from your real library |
| g | Settings → Sign out, then sign in again | Library, score and badges are still there |
| h | Reload `/app/library` | It loads |
| i | `curl https://bkmk-api-<suffix>.onrender.com/api/dashboard` | `401`, so nothing is readable without a session |
| j | X Developer Console → Usage vs Render logs (`"scan finished" … cost_usd`) | Roughly equal |
| k | Render logs | No tokens, codes, cookies or post text |
| l | Settings → Disconnect | Back to the landing page; on X, Settings → Connected apps no longer lists BKMK.exe |

If **(e)** fails because there's no cookie after sign-in, stop and tell me. The fallback is a split-origin setup (`SameSite=None` plus CORS), which needs code changes.

### 11. Rollback and credential rotation

**Rolling back a bad deploy**

- **Frontend:** Vercel → Project → Deployments → pick the last good deployment → **Promote to Production**. This is instant.
- **API:** Render → `bkmk-api` → Deploys → the last good deploy → **Rollback**. All migrations so far are additive (new table, new column), so older code runs fine on the newer schema.
- **Data:** Neon → Branches → **Restore**, to any point in the last 6 hours (free plan).

**Rotating credentials**

| Credential | How | Effect |
|---|---|---|
| `X_CLIENT_SECRET` | X Console → App → Keys and tokens → regenerate. Paste into Render and save, which redeploys. | Existing user grants keep working. |
| `SESSION_SECRET` | Render → Environment → Generate. Save. | Everyone is signed out; no data is lost. |
| `TOKEN_ENCRYPTION_KEY` | Run `gen-secrets` again, paste into Render, save. | Users are asked to reconnect on their next scan; stored libraries stay. |
| Neon password | Neon → Roles → Reset password. Update `DATABASE_URL` on Render. | Brief API restart |
| Leaked anything | Rotate first. Then remove it from the code. If it was committed, also rewrite history (`git filter-repo`) and force-push, because deleting the line isn't enough. | |

## Environment variables

**Changes take effect when:**
- **Render:** saving a variable redeploys the service automatically.
- **Vercel:** `VITE_*` values are baked into the bundle at build time, so they need a new deployment.

### Backend (Render)

| Variable | Purpose | Secret? | Required | How to get it | Takes effect |
|---|---|---|---|---|---|
| `ENVIRONMENT` | `production` turns on strict checks, Secure cookies and HSTS | Public | Yes | Set by the blueprint | On redeploy |
| `DATABASE_URL` | Neon connection | **Secret** | Yes | Neon → Connection details, direct, `sslmode=require` | On redeploy |
| `FRONTEND_URL` | Browser origin: OAuth return target and allowed `Origin` | Public | Yes | `https://<app>.vercel.app` | On redeploy |
| `X_REDIRECT_URI` | OAuth callback, exactly as registered at X | Public | Yes | `https://<app>.vercel.app/api/auth/x/callback` | On redeploy |
| `LIVE_SYNC_ENABLED` | `false` (default) means free mode: no X API calls, users import files. `true` enables paid live bookmark sync. | Public | No (false) | Your choice; see [zero-cost-mode.md](zero-cost-mode.md) | On redeploy |
| `X_CLIENT_ID` | X OAuth 2.0 client ID | Secret-ish (public in auth URLs, but keep it out of git) | Only if live sync is on | X Console | On redeploy |
| `X_CLIENT_SECRET` | X OAuth 2.0 client secret | **Secret** | Only if live sync is on | X Console | On redeploy |
| `SESSION_SECRET` | HMAC key for session IDs (≥32 characters) | **Secret** | Yes | Generated by Render, or `gen-secrets` | On redeploy (signs everyone out) |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for stored X tokens | **Secret** | Yes | `gen-secrets`; back it up | On redeploy (users reconnect) |
| `X_DAILY_BUDGET_USD` | Global daily cap on estimated X spend; `0` stops live scans | Public | No (5.00; blueprint 2.00) | Your choice | On redeploy |
| `SCAN_MAX_BOOKMARKS` | Posts per scan (each is a $0.005 read) | Public | No (30, the starter scan) | Your choice | On redeploy |
| `SCAN_REFRESH_PROBE_SIZE` / `SCAN_REFRESH_PAGE_SIZE` | A refresh first reads this many newest posts (1), then pages of 10 until it reaches a known one | Public | No (1 / 10) | | On redeploy |
| `SCAN_COOLDOWN_SECONDS` | Minimum gap between a user's scans | Public | No (3600) | Your choice | On redeploy |
| `ALLOWED_X_USERNAMES` | Private-beta allowlist, comma-separated; empty means anyone | Public | No | Your choice | On redeploy |
| `DATA_RETENTION_DAYS` | Delete accounts inactive this long; `0` means keep | Public | No (90) | Your choice | On redeploy |
| `SESSION_TTL_HOURS` | Session lifetime | Public | No (24) | | On redeploy |
| `AUTH_RATE_LIMIT_PER_MINUTE` | Per-IP limit on the OAuth endpoints | Public | No (20) | | On redeploy |
| `X_EXPAND_AUTHORS` | Fetch author profiles with each page (+$0.010 per new author). Nothing in scoring uses them. | Public | No (false) | | On redeploy |
| `X_PRICE_POST_READ`, `X_PRICE_USER_READ` | Prices used for estimates and the cap | Public | No (0.005 / 0.010) | X pricing page | On redeploy |
| `ALLOWED_ORIGINS` | Only for a split-origin setup; **leave empty** here | Public | No | | On redeploy |
| `PORT` | Listen port | Public | Set by Render | | |

`X_API_MODE` must stay unset or `live`: `fixture` is refused in production.

### Frontend (Vercel)

| Variable | Purpose | Secret? | Required | Takes effect |
|---|---|---|---|---|
| `VITE_PUBLIC_URL` | Link in share captions and cards (defaults to the current origin) | Public: it's in the bundle | No | On a new Vercel deployment |
| `VITE_API_BASE` | API origin for split-origin setups. **Leave unset**: the rewrite makes it same-origin. | Public | No | On a new Vercel deployment |

Never put a secret in a `VITE_*` variable; everything prefixed `VITE_` ships to every visitor.

## Enabling live sync later (when funded)

Nothing below has been done. Each step is a deliberate owner action.

1. **X Developer Console:** buy credits and set a **spending limit**, the hard backstop. Optionally turn auto-recharge off.
2. **Render → `bkmk-api` → Environment:**
   - set `X_CLIENT_ID` and `X_CLIENT_SECRET` if they aren't already;
   - set `X_DAILY_BUDGET_USD` to the daily amount you approve;
   - optionally, set `ALLOWED_X_USERNAMES` to your own handle for a private trial;
   - then set `LIVE_SYNC_ENABLED=true`.

   Saving redeploys.
3. **Check:** `https://<app>.vercel.app/api/auth/me` should show `"liveSyncEnabled":true,"xConfigured":true,"scanLimit":30`. The landing page then offers Connect with X.
4. **Trial:** sign in with your own account and run one scan. Your own bookmarks are billed as "Owned Reads" ($0.001 each), so a 30-bookmark scan is about $0.04. Compare the Render log line `"scan finished" … cost_usd` with the X console's usage.
5. **Turning it off:** set `LIVE_SYNC_ENABLED=false`. Every live entry point then stops before contacting X.

## Alternatives

- **One origin on a single host.** The root `Dockerfile` builds the SPA into the API image, so one Render service serves both. It's simpler but the landing page cold-starts too. Use `FRONTEND_URL` = `X_REDIRECT_URI` origin = the Render URL. `docker compose up --build` runs it locally at `http://localhost:8080`.
- **Koyeb free** instead of Render: the same image from `backend/`, health check `/api/health/live`, and the same variables. It scales to zero after 1 h instead of 15 min.

## Operations

- **Cold starts.** Render free sleeps after 15 minutes idle; the first API call then takes up to about a minute. Vercel's proxy waits 120 s, so the call completes. An active scan polls every 0.7 s, which keeps the service awake.
- **Health.** Render probes `/api/health/live`, which never queries the database. Use `/api/health` for a manual deep check: it returns 503 if Neon is unreachable.
- **Restarts.** On boot the API marks interrupted scans failed and runs housekeeping (expired sessions and the retention policy), then repeats that every 6 h.
- **Logs.** JSON on stdout, viewed in the Render dashboard, with credentials redacted. Search for `"scan finished"` for per-scan cost.
- **Scaling beyond one instance.** Move the rate limiter to a shared store first. Scans and sessions already live in Postgres.

## Changes made for this deployment (2026-10-29)

| Area | Change | Files |
|---|---|---|
| Health | `/api/health/live` for host probes, so Neon can scale to zero | `backend/app/main.py`, both Dockerfiles, `render.yaml` |
| Cost | Global daily spend cap in a ledger that survives account deletion; refuses or stops scans early | `backend/app/services/budget.py`, `scan_service.py`, migration `0003` |
| Access | `ALLOWED_X_USERNAMES` private-beta allowlist; refused grants are revoked | `backend/app/api/auth.py` |
| Sessions | Sign out (keeps data), separate from Disconnect and Delete; `Origin` check on POST and DELETE | `sessions.py`, `SettingsPage.tsx`, `actions.ts` |
| Retention | Inactive accounts deleted after `DATA_RETENTION_DAYS`; `last_seen_at` | `services/retention.py`, migration `0004`, `main.py` |
| Robustness | A rotated `TOKEN_ENCRYPTION_KEY` leads to a reconnect prompt instead of a crash; comma-separated list variables now parse | `services/tokens.py`, `config.py` |
| Database | Pool sized for one process on Neon | `database.py` |
| Hosting | API-only image, free Render blueprint, Vercel config | `backend/Dockerfile`, `render.yaml`, `frontend/vercel.json` |
| Config | `BACKEND_URL` removed (unused); new variables in `.env.example`; `.gitignore` hardened | |
