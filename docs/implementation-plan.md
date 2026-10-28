# Implementation plan: prototype to product

Written 2026-10-28, before the backend work started. Each section is updated as the work lands.

## 1. Baseline (audit before changes)

| Check | Result |
|---|---|
| `npm run lint` (oxlint) | 0 errors, 7 warnings (all `only-export-components` fast-refresh hints) |
| `tsc -b` | clean |
| `npm run build` | succeeds (JS 475 kB / 148 kB gzip) |
| Tests | none existed |
| Backend | none existed |
| Git | 30 commits on `main`, clean tree, no remote |

## 2. Existing architecture

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind 4 and React Router 7 under `frontend/`.
- **`src/domain/`:** pure, versioned rules. These are the classifier (`classifier-v1`), stats, Curation Score (`score-v1`), archetypes (`archetype-v1`), achievements (`achievements-2026.10-v1`) and pixel art.
- **`src/services/`:** typed contracts (`IdentityService`, `AuthService`, `ScanService`) with **demo** implementations only.
- **`src/state/session.tsx`:** a reducer store persisted to `localStorage`. It holds identity, a demo "authorized" flag, the full `ScanResult` including all bookmarks, and demo-lab settings.
- **Pages:** landing, connect, scan, reveal, share, dashboard (overview, topics, topic detail, library, achievements, settings) and 404.

## 3. What is simulated today

| Area | Simulation |
|---|---|
| Identity lookup | `demoIdentityService.lookup` echoes the handle after a delay |
| OAuth | `demoAuthService.authorize` resolves to the outcome chosen in the UI |
| Scan | `demoScanService` emits timed events over seeded synthetic bookmarks |
| Persistence | everything lives in browser `localStorage` |
| Library and search | filtered client-side over the in-memory array |
| Export, disconnect, delete | local JSON blob; reducer resets |
| "Open on X" | disabled for sample posts |

**UI actions that depend on demo data:** every page reads `state.result`. That object is produced only by the demo scan or the sample generator.

## 4. What must become real

1. Official X OAuth 2.0 Authorization Code + PKCE, run server-side, with tokens encrypted at rest.
2. A server-side session (HttpOnly cookie), with no tokens in the browser.
3. A scan pipeline: call the X bookmarks endpoint, persist records (upsert, no duplicates), classify, compute stats, score, archetype and achievements, and record progress.
4. The dashboard, topics, library (server-side pagination, search and filters), achievements and export, all scoped to the logged-in user.
5. Disconnect (revoke at X plus delete local data) and account deletion.
6. Demo mode kept as an explicit, isolated mode that never touches the backend.

## 5. External dependencies

| Dependency | Needed for | Status |
|---|---|---|
| X developer app (OAuth 2.0 enabled, callback URL registered) | Live login and scans | **Needs the owner's action.** No credentials are available to this build. |
| X API credits (pay-per-use) | Every bookmark read | **Needs the owner's action.** See `cost-model.md`. |
| PostgreSQL | Persistence | Local cluster for development; managed Postgres in production |
| Hosting | Public URL | Configuration provided. Deploying needs the owner's account. |

## 6. Backend architecture

- **One FastAPI service** (`backend/`) built on SQLAlchemy 2, Alembic, Postgres (psycopg 3), httpx, pydantic-settings and `cryptography` (AES-GCM).
- **Same origin in production.** FastAPI serves the built SPA and `/api/*`, so cookies are first-party and CORS isn't needed. In development, Vite proxies `/api` to the backend.
- **Server-side sessions.** A random 256-bit session ID goes in an HttpOnly cookie; only its SHA-256 hash is stored in the database. Each session carries a CSRF token, which state-changing requests must echo in `X-CSRF-Token`. Cookies are `SameSite=Lax` and `Secure` in production.
- **Scans run in a background thread.** At most 8 pages at roughly 1 s each, so no queue is needed. Progress is persisted on the `scans` row and the frontend polls `GET /api/scans/{id}`. Each user can run one scan at a time. When the app starts, it marks interrupted `running` scans as `failed`.
- **Rules ported to Python** (`app/rules/`) with the same constants as the TypeScript rules. The classifier gains confidence scores and secondary tags (`classifier-v2`). The TypeScript copy stays for demo mode.
- **Rate limits** are in-memory sliding windows per IP for authentication, plus a per-user scan cooldown stored in the database, because every scan costs money.

## 7. Security requirements

See `security-and-privacy.md`. In summary:

- OAuth state and PKCE (S256).
- AES-GCM token encryption with a key supplied by the environment.
- No tokens in URLs, logs or responses.
- HttpOnly, Secure, SameSite cookies.
- CSRF header check.
- Fixed redirect allowlist.
- Every query is scoped to the user.
- Request size limits.
- Generic errors.
- No HTML rendering of post text.
- No fetching of arbitrary URLs.

## 8. Testing plan

- **Backend:** pytest against a real local Postgres test database. Alembic migrations are applied, and every test runs inside a transaction that's rolled back. The X API is faked with `httpx.MockTransport` fixtures, so the default suite needs no credentials. An opt-in live test runs only when `X_LIVE_TEST_ACCESS_TOKEN` is set.
- **Frontend:** Vitest for the rules, filters, handle validation, API client and key components.
- **E2E:** Playwright against the dev servers. It covers the demo journey, plus OAuth errors and the live flow with the backend in fixture mode (`X_API_MODE=fixture`, used only in tests and refused in production).

## 9. Deployment plan

- A single Docker image: multi-stage build of the frontend, then the backend serving `dist/`.
- `docker-compose.yml` for a local production-like run with Postgres.
- `render.yaml` blueprint (web service plus Postgres) as the documented low-cost target.
- Migrations run on start (`alembic upgrade head`).
- Health check at `/api/health`.
