# BKMK.exe

> You saved it for a reason.

BKMK.exe scans your X bookmarks through the official X API. It gives you a Bookmark DNA report (collector archetype, Curation Score and badges), a shareable scorecard, and a searchable, categorised library. Classification and scoring are rules-based, with no AI.

There are two modes, and their data is never mixed:

- **Live:** sign in with X (OAuth 2.0 + PKCE). Scans read your real bookmarks and store them in Postgres.
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

With the default `X_API_MODE=fixture`, sign-in and scans use recorded X responses that follow the documented API shapes. You can click through the whole live flow, including cancelled, rate-limited and revoked cases, without credentials. Fixture mode is refused in production.

To use **real X accounts**, set `X_API_MODE=live`, `X_CLIENT_ID` and `X_CLIENT_SECRET` in `backend/.env`, and register `http://localhost:5173/api/auth/x/callback` in your X app. See [docs/deployment.md](docs/deployment.md#x-developer-app-setup-owner-action).

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
- [Deployment](docs/deployment.md)
- [API reference](docs/api-reference.md)
- [UI research](docs/ui-research.md) · [Design system](docs/design-system.md)

## Known limits

- X returns at most your ~800 most recent bookmarks. Scans say so and never claim a full history.
- The live X integration is tested against fixtures only, because no developer credentials were available while building it.
- Every scan costs real X API credits (about $0.40–$7 per first scan). See the cost model before opening sign-ups.
