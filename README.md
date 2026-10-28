# BKMK.exe

> You saved it for a reason.

BKMK.exe scans your X bookmarks. It gives you a collector archetype, a Curation Score and achievement badges, plus a searchable library of what you saved.

**Status:** frontend prototype (build 001). It has no backend and no real X integration. Every scan runs on deterministic **synthetic sample data**, and the UI labels it that way throughout.

## Run the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build), `npm run lint` (oxlint), `npm run preview`.

Optional: set `VITE_PUBLIC_URL` to the public site URL used in share captions and on the card. It defaults to the current origin.

### Try it

1. Enter any valid handle, or use **Try the demo profile**.
2. Confirm → Connect (simulated) → watch the scan → reveal.
3. **Demo lab** opens from the bottom-left button, or from Settings in the dashboard. It previews:
   - slow, partial, empty, API-error and auth-expired scans;
   - each sample collection type, one per archetype.
4. The same handle and collection always give the same archetype, score and badges.

## Layout

```
frontend/src/
  domain/      pure rules: classifier, stats, scoring, archetypes, achievements, pixel art
  data/        demo-only synthetic bookmarks (seeded, deterministic)
  services/    service interfaces + demo implementations (the backend swap point)
  state/       session store (React context + reducer, persisted to localStorage)
  lib/         share-card canvas renderer, geometry, filters, formatting
  components/  ui primitives, brand (pixel art, badges, DNA barcode), feature components
  pages/       one per route
docs/
  ui-research.md    research, references and design decisions
  design-system.md  tokens and component rules
```

## Backend integration points

All of these sit behind interfaces in `frontend/src/services/types.ts`. They are wired in `services/index.ts`.

| Interface | Production behaviour |
|---|---|
| `IdentityService.lookup(handle)` | Resolve the handle to a public profile (name, avatar) |
| `AuthService.authorize()` | Redirect to the backend's X OAuth 2.0 (PKCE) start URL, then handle the callback |
| `ScanService.start()` | Stream `ScanEvent`s (`phase`, `progress`, `topics`, `log`, `achievement`, `slow`, `error`, `done`) from the backend, e.g. over SSE |
| Rules in `domain/` | Port to Python, or keep them shared. Classification, scoring and badges are pure functions with version strings. |
| Settings actions | Disconnect means revoke the token and delete server data. Delete removes stored bookmarks. Export comes from the server. |
| Share | Optional server-rendered Open Graph image (~1200×630) for link previews |

Known API constraint: X's bookmarks endpoint returns only the **800 most recent** bookmarks. It is rate-limited per user and needs OAuth 2.0 user context. Confirm current pricing and access before building the backend.
