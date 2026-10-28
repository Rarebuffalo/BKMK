# Deployment

**Status:** the configuration below has been built and checked locally:

- The Docker image builds.
- It runs in `ENVIRONMENT=production` against Postgres.
- Migrations apply on boot and `/api/health` returns ok.
- The SPA is served with deep-link fallback.
- Security headers are set and API docs are disabled.
- OAuth start redirects to `x.com/i/oauth2/authorize` with PKCE S256.
- Production refuses to start with missing secrets.
- The full `docker compose` stack was smoke-tested with fixture X.

**Not done:** it has not been deployed to a public URL from here. That needs the owner's hosting account and X developer app (see "External actions" below).

## Architecture in production

```
Browser ──HTTPS──▶ one container: uvicorn (FastAPI)
                        ├─ /api/*   JSON API, OAuth, scans (background thread)
                        └─ /*       built SPA (frontend/dist), index.html fallback
                     └──▶ managed PostgreSQL
                     └──▶ api.x.com (OAuth + bookmarks)
```

Serving the frontend and API from one origin keeps cookies first-party (`SameSite=Lax`, `__Host-` prefix), needs no CORS, and leaves one URL to register with X.

## Required environment variables

| Variable | Example | Notes |
|---|---|---|
| `ENVIRONMENT` | `production` | Enables the strict checks: https URLs, secrets present, fixture mode refused, Secure cookies, HSTS |
| `DATABASE_URL` | `postgres://…` | `postgres://` is converted to `postgresql+psycopg://` automatically |
| `FRONTEND_URL` | `https://bkmk.example` | Where OAuth sends users back. Same origin as the app. |
| `BACKEND_URL` | `https://bkmk.example` | Same origin |
| `X_REDIRECT_URI` | `https://bkmk.example/api/auth/x/callback` | Must exactly match the callback registered in the X app |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | from the X Developer Console | Web App (confidential client), OAuth 2.0 |
| `SESSION_SECRET` | 48+ random chars | `uv run python -m app.cli gen-secrets` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte url-safe base64 | Same command. **Back it up:** losing it means every user must reconnect. |
| `PORT` | `8000` | Set by most hosts |

Optional variables: `SCAN_MAX_BOOKMARKS` (default 800), `SCAN_COOLDOWN_SECONDS` (300), `X_EXPAND_AUTHORS` (true), `SESSION_TTL_HOURS` (24), `AUTH_RATE_LIMIT_PER_MINUTE` (20), `ALLOWED_ORIGINS` (only for a split-origin setup), and `X_PRICE_*` for cost estimates. The frontend build arg `VITE_PUBLIC_URL` sets the link shown on share cards.

Never commit `.env` files. `.gitignore` and `.dockerignore` exclude them.

## X developer app setup (owner action)

1. Create a Project and an App at the X Developer Console.
2. Under **User authentication settings**, enable **OAuth 2.0** with:
   - Type of App: **Web App, Automated App or Bot** (confidential client).
   - Callback URI: `https://<your-host>/api/auth/x/callback` (also add `http://localhost:5173/api/auth/x/callback` for local live testing).
   - Website URL: your public URL.
3. Copy the OAuth 2.0 **Client ID** and **Client Secret** into `X_CLIENT_ID` and `X_CLIENT_SECRET`.
4. Buy credits (pay-per-use) and **set a spending limit**. See `cost-model.md`.
5. Check that the app's access level allows `GET /2/users/{id}/bookmarks`. This couldn't be verified without credentials.

## Option A: Render (blueprint included)

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repo. `render.yaml` creates the Docker web service and a Postgres database.
3. Fill in the `sync: false` variables in the dashboard: the URLs (your `https://<name>.onrender.com`), the X credentials and `TOKEN_ENCRYPTION_KEY`. `SESSION_SECRET` is generated automatically.
4. Deploy. The container runs `alembic upgrade head`, then starts uvicorn behind Render's TLS. `/api/health` is the health check.
5. Add the final callback URL to the X app, then sign in to verify the live flow.

The cheapest working configuration is the Starter web service plus Basic Postgres. Free instances sleep, which breaks OAuth callbacks and in-progress scans.

## Option B: any Docker host (Fly.io, Railway, a VM)

```bash
docker build -t bkmk --build-arg VITE_PUBLIC_URL=https://bkmk.example .
docker run -p 8000:8000 --env-file prod.env bkmk
```

Put TLS in front: the platform proxy, Caddy or nginx. uvicorn runs with `--proxy-headers` so client IPs reach the rate limiter.

## Local production-like check

```bash
cd backend && uv run python -m app.cli gen-secrets   # export SESSION_SECRET / TOKEN_ENCRYPTION_KEY
cd .. && docker compose up --build                   # http://localhost:8080, fixture X by default
```

## Database migrations

- **Apply:** `cd backend && uv run alembic upgrade head`. The container does this on every boot; it's idempotent.
- **Create a new migration:** `uv run alembic revision --autogenerate -m "describe change"`. Review it, then commit it.
- **Check for drift:** `uv run alembic check`.
- `create_all()` is never used.

## Operations

- **Logs.** JSON lines on stdout with `scan_id`, `user_id`, status and cost estimates. Never tokens or post text.
- **Health.** `GET /api/health` returns 503 if the database is unreachable.
- **Restarts.** In-flight scans are marked `failed (interrupted)` on boot, and users can retry.
- **Scaling.** One instance handles this product's scale. Before running several instances, move the in-process rate limiter to a shared store. Scans would still work, since their state is in Postgres.

## External actions still needed

1. Create the X developer app, configure OAuth 2.0 and buy credits (see above).
2. Create the hosting account and database, and deploy (Option A or B).
3. Run one real sign-in and scan, then compare the X Developer Console usage with `estimated_cost_usd`.
4. Publish a privacy policy page before inviting users (X policy requirement).
