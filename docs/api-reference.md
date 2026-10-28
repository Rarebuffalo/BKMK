# API reference

The base path is `/api`. Bodies are JSON and keys are camelCase. Interactive OpenAPI docs are at `/api/docs` outside production.

## Conventions

- **Authentication.** A session cookie (`bkmk_session`, or `__Host-bkmk_session` in production) is set by the OAuth callback. Private endpoints return `401 {"code": "not_authenticated"}` without one.
- **CSRF.** `POST` and `DELETE` require an `X-CSRF-Token` header equal to `csrfToken` from `/api/auth/me`. Otherwise they return `403 {"code": "csrf_failed"}`.
- **Errors.** Every error has the shape `{"code": string, "message": string}`. Validation errors add `fields`. The status codes are:

  | Status | Meaning |
  |---|---|
  | 401 | Not authenticated |
  | 403 | CSRF check failed |
  | 404 | Not found, or not yours |
  | 409 | Not connected |
  | 413 | Request too large |
  | 422 | Invalid request |
  | 429 | Rate limited or in scan cooldown (`retryAfter` in seconds) |
  | 500 | Internal error |
- **Scope.** Every resource is scoped to the session user. IDs belonging to other users return 404.

## Health

`GET /api/health` returns `200 {"status": "ok", "database": "ok", "xApiMode": "live", "xConfigured": true}`, or `503` with `"database": "unavailable"`.

## Authentication

| Method and path | Purpose |
|---|---|
| `GET /api/auth/x/start?handle=&returnTo=scan\|settings` | Starts OAuth 2.0 PKCE. Sets the state cookie and responds `303` to X's authorize URL. If X isn't configured, it redirects to `/connect?auth=failed&reason=not_configured`. |
| `GET /api/auth/x/callback?state=&code=\|error=` | Validates the state (cookie plus single-use server record), exchanges the code, calls `/2/users/me`, upserts the user by stable X ID, stores encrypted tokens and creates the session. Redirects to `FRONTEND_URL` + `/scan?auth=success`, or `/connect?auth=success&requested=<typed handle>` on an account mismatch, or `/connect?auth=cancelled\|failed&reason=…`. |
| `GET /api/auth/me` | `{authenticated, xConfigured, apiMode, user?, connection?, csrfToken?}`. Never includes tokens. |
| `POST /api/auth/logout` | `204`. Ends this session. |
| `POST /api/auth/disconnect` | Revokes the tokens at X, then deletes all of the user's data. Returns `{"deleted": true, "revoked": bool}`. |

Failure reasons for the callback: `state_mismatch`, `cancelled`, `exchange_failed`, `provider_error`, `invalid_handle`, `not_configured`.

## Scans

| Method and path | Purpose |
|---|---|
| `POST /api/scans` body `{"mode"?: "full"\|"refresh"}` | Returns `202` with a `Scan`. Runs in the background. If a scan is already active, that scan is returned. `409 not_connected`, `429 scan_cooldown`. Without `mode`: `full` for the first scan, `refresh` after that. |
| `GET /api/scans/latest` | The most recent `Scan`, or `null` |
| `GET /api/scans/{id}` | A `Scan` owned by the user. Poll it while the status is `queued` or `running`. |

`Scan` fields:

```text
id, status (queued|running|completed|partial|failed), mode, phase (connect|retrieve|topics|classify|stats|achievements|report),
requestedLimit, retrieved, newBookmarks, removedBookmarks, classified, pages,
events: [{type, at, ...}], coverage (complete|partial), coverageNote, stopReason (end_of_collection|caught_up|scan_limit|page_budget),
errorCode, errorMessage, apiRequests, estimatedCostUsd, startedAt, completedAt
```

Event types:

```text
scan_started, retrieving_page {page}, bookmarks_received {page, count, total, new}, normalizing, classifying,
calculating_stats, evaluating_achievements, achievement_unlocked {id}, scan_completed {durationMs}, scan_partial {code?}, scan_failed {code}
```

Error codes:

```text
auth_expired, missing_permissions, rate_limited, api_error, network, invalid_response, database_error, internal_error, interrupted
```

## Dashboard and library

| Method and path | Purpose |
|---|---|
| `GET /api/dashboard` | A `Report`, the same shape as the frontend `ScanResult` minus the full bookmark list: `handle, displayName, isDemo:false, scannedAt, coverage, coverageNote, stats, archetype {primary, secondary?, signals, version, provisional}, score {total, dimensions[], version}, achievements[], achievementsVersion, recent[5], scan`. Returns `404 no_scan` before the first scan. |
| `GET /api/topics` | `[{id, label, description, count, share, authors, types}]` |
| `GET /api/topics/{topicId}/bookmarks?q=&offset=&limit=` | Topic-scoped `BookmarkPage` |
| `GET /api/bookmarks?q=&topic=a,b&type=repo,thread&author=&date=any\|30d\|6m\|1y\|older&sort=newest\|oldest\|author\|longest&offset=&limit=1..100` | `{items: Bookmark[], total, offset, limit, facets: {types, topics, authors[]}}`. Search requires every term to match (case-insensitive) post text, author handle or author name. Sorting is stable (ties break on ID). |
| `GET /api/bookmarks/{id}` | A single `Bookmark` |
| `GET /api/achievements` | `[{id, earned, current, target, unlockedAt?, rulesVersion?}]`. Earned badges persist across partial rescans. |

`Bookmark` fields:

```text
id, xPostId, author {handle, name}, text, createdAt, url, links[], threadLength (null), accessible,
topic, topicConfidence, secondaryTopics[], contentType, contentTypeCertain, matched[], firstSeenAt
```

## Export and deletion

| Method and path | Purpose |
|---|---|
| `GET /api/export` | A JSON attachment containing the account, report and every bookmark with its classification. No tokens. |
| `DELETE /api/account` | Same effect as disconnect: revoke, then delete everything. Returns `{"deleted": true, "revoked": bool}`. |
