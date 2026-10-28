# Storage, sessions and retention

Every piece of state BKMK.exe keeps: where it lives, how long it lasts and what removes it. This was checked against the code on 2026-10-29.

**Principle:** the browser holds nothing secret. Credentials and private bookmark data stay on the server. Postgres keeps only what a returning user expects to find, and only for as long as the retention policy allows.

## Storage matrix

### In the browser

| Data | Where | Sensitive? | Lifetime | Removed by |
|---|---|---|---|---|
| **Session ID** | Cookie `__Host-bkmk_session` (production): `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Named `bkmk_session` in development. | Yes. Never readable by JavaScript. | 24 h (`SESSION_TTL_HOURS`) | Sign out, Disconnect, Delete, expiry |
| **OAuth state** | Cookie `bkmk_oauth_state`: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/api/auth/x` | Binds the login to this browser | 10 min | The callback (success or failure), expiry |
| **CSRF token** | JavaScript memory only (from `/api/auth/me`) | Low: useless without the cookie | The tab | Reload, sign out |
| **Live report and library** | React memory (`LiveProvider`), fetched from the API | Yes (private bookmarks) | The tab | Reload, sign out. Never written to storage. |
| **Demo session** | `localStorage` key `bkmk.session.v2` | No. Synthetic sample data and a typed demo handle (not looked up on X), plus the current mode, reveal-seen flag and demo-lab choices. | Until cleared | Settings → Delete (demo), Disconnect (demo), or clearing site data |

`sessionStorage` isn't used.

**Why the demo lives in `localStorage`:** keeping a demo library across reloads is existing product behaviour. The data is generated in the browser, labelled DEMO everywhere, contains no real account data, and is never sent to the server. The only live-mode value in `localStorage` is the `mode` flag (`"live"`), which isn't sensitive.

### On the server (Postgres)

| Data | Table | Sensitive? | Lifetime | Removed by |
|---|---|---|---|---|
| Account identity: X user ID, handle, display name, avatar URL, `last_scan_at`, `last_seen_at` | `users` | Low | Until deleted or retention | Disconnect, Delete, retention |
| X access and refresh tokens | `oauth_accounts`, AES-256-GCM encrypted, associated data `<kind>:<user id>` | **High** | Until disconnected | Disconnect or Delete (revoked at X first), retention (revoked first) |
| Sessions: HMAC of the session ID, CSRF token, expiry | `sessions` | Medium (hash only) | 24 h | Sign out (that session), Disconnect or Delete (all of the user's), expiry purge |
| OAuth in-flight state: hashed `state`, encrypted PKCE verifier, return path | `oauth_states` | Medium | 10 min, single use | Callback, expiry purge |
| Bookmarks: post text, author, links, dates, topic and type | `bookmarks`, `bookmark_tags` | **Private** | Until deleted or retention. Posts no longer on X are dropped after the next complete full scan. | Disconnect, Delete, retention, deletion sync |
| Scan history: counts, progress events, cost estimate | `scans` | Low | As for the account | Same |
| Derived report and badges | `profile_stats`, `user_achievements` | Low | As for the account | Same |
| Daily X API usage: counts and cost per UTC day | `api_usage_daily` | None (no user data) | Kept | Manual. Feeds the spend cap. |
| Topic catalogue | `categories` | None | Static | Migrations |

### Process memory (backend)

| Data | Lifetime |
|---|---|
| Per-IP auth rate-limit windows | 1 min windows; lost on restart |

Nothing else is kept in memory between requests: scan progress is in Postgres, so polling works across restarts. A scan that is mid-flight when the process restarts is marked failed on boot.

## Sessions

- **Creation.** After a successful OAuth callback, the server generates a 256-bit opaque ID, stores `HMAC-SHA256(SESSION_SECRET, id)` and sets the cookie. A database leak therefore exposes no usable session IDs.
- **Validation.** Every request hashes the cookie, looks it up and checks `expires_at`. Expired rows are purged every 6 h and on boot.
- **CSRF.** Every POST and DELETE needs `X-CSRF-Token` to match the session's token. `SameSite=Lax` already blocks cross-site POSTs. A foreign `Origin` header is also refused with `origin_rejected`.
- **Same origin in production.** The browser only talks to `https://<app>.vercel.app`. Vercel proxies `/api/*` to Render. The cookie is first-party, `__Host-` is allowed, and no CORS is needed: `ALLOWED_ORIGINS` stays empty.
- **Persistence.** Sessions are in Postgres, so they survive Render spin-downs and redeploys.
- **Rotating `SESSION_SECRET`** signs everyone out (old hashes stop matching). Nothing else is affected.

## Sign out, Disconnect and Delete

| Action | Where | Session | X grant | Stored library | After the next sign-in |
|---|---|---|---|---|---|
| **Sign out** | Settings → Sign out (live) | This one deleted, cookie cleared, in-memory state dropped | Kept (encrypted) | **Kept** | Library, score and badges are back. Rescans are incremental. |
| **Disconnect** | Settings → Disconnect | All deleted | **Revoked at X** (best effort), then deleted | **Deleted** | A fresh account and a full scan |
| **Delete data** | Settings → Delete | All deleted | Revoked, then deleted | Deleted | Same as Disconnect |
| **Session expiry** | Automatic after 24 h | Ends | Kept | Kept | Sign in again; everything is there |
| **Revoked on X's side** | User removes the app on X | Still valid | Refresh fails, so the connection is marked `expired` | Kept | The UI asks to reconnect |

Disconnect and Delete do the same thing on the server: they are two entry points to "remove me". The UI labels both as destructive and asks for confirmation. Sign out is the non-destructive option. In demo mode there is no server state: Disconnect and Delete clear `localStorage`, and Sign out isn't shown.

## Retention policy

- **Inactive accounts.** If an account has no sign-in or scan for **`DATA_RETENTION_DAYS` (default 90)**, its X tokens are revoked and all its rows are deleted. The check runs on every boot and every 6 h; Render free restarts often, so it runs regularly. `0` disables it.
- **The UI states the policy** in Settings, using the value from `/api/auth/me` (`dataRetentionDays`).
- **Bookmarks** that X stops returning are deleted after the next complete full scan, as X's developer policy requires.
- **Never stored:** passwords, raw API responses, and request logs that include query strings (the access log is off because the callback URL carries the OAuth `code`).
- **Logs** hold IDs, counts and error codes, never tokens, cookies or post text. They live in Render's log viewer, under Render's own retention.

## Neon specifics

- **Connection.** Use the **direct** endpoint with `sslmode=require` (`postgres://…@ep-xxx.<region>.aws.neon.tech/neondb?sslmode=require`). The app rewrites `postgres://` to the psycopg 3 driver.
- **Pool.** 5 connections plus 5 overflow, recycled after 280 s, pinged before use.
- **Scale to zero.** Render's health probe uses `/api/health/live`, which doesn't touch the database, so Neon can scale to zero after 5 minutes without queries. The first request after that waits a moment while the compute starts.
- **Migrations.** `alembic upgrade head` runs on every boot (transactional and idempotent; one instance). Never run `downgrade` against production.
- **Backups.** The free plan's restore window is 6 hours. Before a risky change, take `pg_dump "$DATABASE_URL" -Fc -f bkmk-$(date +%F).dump` from your own machine. Restore with `pg_restore --clean --no-owner -d "$DATABASE_URL" file.dump`.
