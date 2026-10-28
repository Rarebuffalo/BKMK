# Security and privacy

This describes what is implemented and tested in this repository. **No formal security audit has been performed.**

## Data collected

| Data | Source | Why | Where |
|---|---|---|---|
| X user ID, handle, display name, avatar URL | `GET /2/users/me` after OAuth | Identify the account. The stable ID is the key, so a renamed handle stays the same account. | `users` |
| OAuth access and refresh tokens | X token endpoint | Read bookmarks on the user's behalf | `oauth_accounts`, **AES-256-GCM encrypted** |
| Bookmarked posts: ID, text, author ID/handle/name, created time, URLs, conversation ID | Bookmarks endpoint | Classification, search and the library | `bookmarks`, `bookmark_tags` |
| Scan records: counts, timings, API usage, error codes | Generated | Progress, retries, cost control | `scans` |
| Derived report: stats, score, archetype | Computed | Dashboard | `profile_stats` |
| Earned badges | Computed | Achievements | `user_achievements` |
| Session: hashed ID, CSRF token, expiry | Generated | Sign-in | `sessions` |

**Not collected:**

- Passwords.
- DMs, likes and follows (those scopes are never requested).
- Email.
- Contents of linked pages: URLs are never fetched.
- Analytics or tracking cookies.

## Token handling

- **OAuth flow.** OAuth 2.0 Authorization Code with PKCE (`S256`), using a confidential client.
  - The client secret exists only on the server.
  - The state is random (256-bit), stored server-side as an HMAC, single use, valid for 10 minutes.
  - The state is also bound to the browser by an `HttpOnly`, `SameSite=Lax` cookie scoped to `/api/auth/x`.
  - The PKCE verifier is stored encrypted, bound to that state.
- **Token storage.**
  - Tokens are encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`, with a random nonce each time.
  - Associated data binds each ciphertext to its kind and user, so a ciphertext copied to another row fails to decrypt.
  - Tokens are **never** returned by any endpoint, put in URLs, or written to `localStorage`.
- **Logging.**
  - Logs are structured JSON and carry IDs and codes only.
  - A redaction filter scrubs anything resembling bearer tokens or `code=`, `token=` or `code_verifier=`.
  - Uvicorn access logs are disabled, because callback query strings contain the code and state. Tested: no fixture token or code appears in logs.
- **Refresh.** Access tokens are refreshed shortly before expiry (`offline.access`). If a refresh fails, the connection is marked `expired` and the UI asks the user to reconnect.

## Sessions and request security

- The session cookie holds a random 256-bit ID. Only its `HMAC-SHA256(SESSION_SECRET, id)` is stored.
  - Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - In production the cookie is `Secure` with the `__Host-` prefix.
  - Sessions last 24 hours (`SESSION_TTL_HOURS`).
- **CSRF.** Every state-changing request (POST and DELETE) must send `X-CSRF-Token`, matching the session's token, compared in constant time. SameSite=Lax is a second layer.
- **CORS.** Off by default: production is same-origin. If `ALLOWED_ORIGINS` is set, it's an explicit list with credentials, and `*` is refused at startup.
- **Authorization.** Every query filters on the session user's ID. No endpoint accepts a user ID. Another user's scan or bookmark returns 404 (no existence oracle). Tested with two accounts.
- **Input validation.**
  - Pydantic schemas reject unknown fields, which prevents mass assignment.
  - Query parameters have length, range and pattern limits.
  - Requests are limited to 64 KB.
  - Search uses parameterised ORM queries, with `LIKE` wildcards escaped (tested with `%` and SQL-injection strings).
- **Rate limits.** Authentication endpoints allow 20 requests per minute per IP, in process. Scans have a per-user cooldown stored in the database.
- **Errors.** Clients get a code and a safe message. Stack traces and database errors stay in the logs.
- **Response headers.**
  - `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
  - HSTS in production.
  - `Cache-Control: no-store` on the API.
- **No unsafe rendering.** Post text is rendered as React text, never as HTML (tested with a `<script>` payload).
- **No open redirects.** Post-login redirects go to `FRONTEND_URL` plus one of two fixed paths. The callback URL must exactly match the one registered with X.
- **Fixture X API.** Usable only when `X_API_MODE=fixture`, which the app refuses in production.

## Public versus private

- Everything about a user's bookmarks is private to their session. **There are no public profile or library URLs.**
- The share card is generated in the browser and contains only aggregates: handle, archetype, score, saved count, topic count, top topic names and badges. It never includes bookmark text, authors or links.
- The share link points to the product home page (`/?ref=dna`), not to the user.
- Sharing never posts automatically. It opens X's own composer.

## Retention and deletion

- **Retention.** Bookmarks are kept while the account is connected.
- **Sync on full scans.** After a *complete* full scan, bookmarks X no longer returns are deleted: they were unbookmarked, deleted or made private. This follows the X Developer Policy's requirement to delete content that's removed or made private on X.
- **Partial or capped scans** can't tell what was removed, so they delete nothing.
- **Disconnect and delete account** both:
  1. Revoke the refresh and access tokens at X (`/2/oauth2/revoke`, best effort).
  2. Delete the user row. Database cascades remove tokens, sessions, scans, bookmarks, tags, stats and badges.
  - Tested: every table is empty afterwards.
  - If revocation fails, local deletion still happens, and the UI tells the user to revoke the app in X settings.
- **Demo mode** stores sample data in the browser's `localStorage` only. "Delete data" clears it.

## Third-party access

- **X API**, only to read the signed-in user's own profile and bookmarks.
- **The hosting provider and its managed Postgres.**
- No analytics, ads, AI or other processors. No bookmark is sent to an LLM.

## Known limitations

- **Single-instance rate limiting.** It's in process; scaling to several instances needs a shared store.
- **Background scans run in-process.** A restart marks running scans `failed` (`interrupted`), and the user can retry. There's no queue.
- **Same encryption key for every token,** with no re-encryption tooling. Rotating `TOKEN_ENCRYPTION_KEY` marks stored grants expired on next use, and users are asked to reconnect. Libraries are kept.
- **No 24-hour deletion-request webhook from X** is handled, because no such mechanism is configured. Deletions happen on the next complete full scan or at disconnect.
- **Retention:** accounts inactive for `DATA_RETENTION_DAYS` (default 90) are revoked and deleted. Sign out keeps data; Disconnect and Delete remove it. See [storage-and-sessions.md](storage-and-sessions.md).
- **No privacy policy page yet.** X's policy requires one before launch.
- **Live X integration is unverified.** No live X credentials were available, so the integration is tested only against fixtures that follow the documented response shapes.
