# BKMK.exe

> You saved it for a reason.

BKMK.exe analyses what you save on X. It gives you a Bookmark DNA report (collector archetype, Curation Score and badges), a shareable scorecard, and a searchable, categorised library. Classification and scoring are rules-based, with no AI.

There are four ways in, and their data is never mixed:

- **Copy from X (default, free, about a minute):** select all on your X bookmarks page, copy, and paste into BKMK.exe. It's parsed and analysed in your browser: no extension, no login, nothing uploaded, and BKMK.exe never contacts X. Tagged "IMPORTED". See [docs/instant-analysis.md](docs/instant-analysis.md) for why this, not an extension.
- **Archive or file import (fallback, free):** X archive Likes (the archive has no bookmarks) or a bookmark list you already have. See [docs/zero-cost-mode.md](docs/zero-cost-mode.md).
- **Live (optional, paid X API):** sign in with X (OAuth 2.0 + PKCE). Scans read real bookmarks through X's pay-per-use API and store them in Postgres. Off unless `LIVE_SYNC_ENABLED=true`.
- **Demo:** fixed sample data that runs entirely in the browser. It's labelled "DEMO" everywhere and never touches the backend.

## Quick start (local)

Requirements: Node 20+, Python 3.12+, [uv](https://docs.astral.sh/uv/), PostgreSQL binaries (`initdb`, `pg_ctl`).

```bash
# 1. Database — a project-local cluster in .local/pg on port 54329
./scripts/dev-db.sh start

# 2. Backend
cd backend
uv sync
cp .env.example .env
uv run python -m app.cli gen-secrets >> .env   # fills SESSION_SECRET / TOKEN_ENCRYPTION_KEY
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000 --reload

# 3. Frontend (new terminal) — proxies /api to :8000
cd frontend
npm install
npm run dev                                     # http://localhost:5173
```

Imports and the demo need only the frontend. For the live flow locally, set `LIVE_SYNC_ENABLED=true` in `backend/.env`. With `X_API_MODE=fixture`, sign-in and scans use recorded X responses that follow the documented API shapes. You can click through the whole live flow, including cancelled, rate-limited and revoked cases, without credentials. Fixture mode is refused in production.

To use **real X accounts** (billed by X per read), set `LIVE_SYNC_ENABLED=true`, `X_API_MODE=live`, `X_CLIENT_ID` and `X_CLIENT_SECRET` in `backend/.env`, and register `http://localhost:5173/api/auth/x/callback` in your X app. See [docs/deployment.md](docs/deployment.md#4-create-the-x-developer-app).

## Tests

```bash
cd backend && uv run pytest              # unit + integration against the bkmk_test database
cd backend && uv run ruff check . && uv run alembic check
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run e2e               # Playwright: starts its own fixture backend + dev server
```

Playwright uses `/usr/bin/chromium` when present (or `PW_CHROMIUM_PATH`). Otherwise run `npx playwright install chromium` once. No test needs X credentials. The live API is never called by the test suite.

## Layout

```
backend/
  app/
    api/           auth (OAuth PKCE, sessions), scans, data (dashboard, library, export, delete)
    integrations/  X API client (retries, rate limits, shape checks) + fixture transport
    rules/         classifier-v2, stats, Curation Score, archetypes, achievements
    services/      scan pipeline, token store, library queries
    models.py      SQLAlchemy models   config.py  validated settings   security.py  AES-GCM, PKCE
  alembic/         migrations
  tests/           pytest (Postgres)
frontend/
  src/api/         typed API client
  src/state/       live session (server) and demo session (browser) stores
  src/services/    demo scan (simulated) and live scan (polls the backend)
  src/domain/      rules for demo mode (same constants as backend)
  e2e/             Playwright journeys
docs/              plan, X API, scoring, security, cost, deployment, API reference, UI research, design system
```

## Docs

- [Implementation plan and status](docs/implementation-plan.md)
- [X API integration: what's verified and what isn't](docs/x-api-integration.md)
- [Scoring, archetype and badge rules](docs/scoring-rules.md)
- [Security and privacy](docs/security-and-privacy.md)
- [Cost model](docs/cost-model.md)
- [Deployment](docs/deployment.md): Vercel + Render + Neon, all on free tiers. Read the [readiness audit](docs/deployment-readiness.md) and the [storage and sessions design](docs/storage-and-sessions.md) first.
- [API reference](docs/api-reference.md)
- [UI research](docs/ui-research.md) · [Design system](docs/design-system.md)

## Known limits

- X returns at most your ~800 most recent bookmarks. Scans say so and never claim a full history.
- The live X integration is tested against fixtures only, because no developer credentials were available while building it.
- Every scan costs real X API credits (about $0.40–$7 per first scan). See the cost model before opening sign-ups.
