# X API integration

Checked against official X documentation on **2026-10-28**. These are the official sources:

- [Get Users Bookmarks reference](https://docs.x.com/x-api/users/get-users-bookmarks.md)
- [Bookmarks introduction](https://docs.x.com/x-api/posts/bookmarks/introduction.md)
- [Bookmarks lookup quickstart](https://docs.x.com/x-api/posts/bookmarks/quickstart/bookmarks-lookup.md)
- [Rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)
- [OAuth 2.0 Authorization Code with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [User access token, refresh and revoke](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
- [Pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Developer Agreement and Policy](https://docs.x.com/developer-terms/agreement-and-policy)

No X credentials were available while building this. **No request to the live X API has been made or verified.** Everything below the "Explicitly documented" heading comes from the docs, and the client is tested against recorded fixture responses that match the documented shapes.

## Explicitly documented

| Topic | Official statement |
|---|---|
| Endpoint | `GET https://api.x.com/2/users/{id}/bookmarks`. `id` is the **authenticated** user's numeric ID (1–19 digits). |
| Auth | OAuth 2.0 user token (Authorization Code with PKCE). Scopes are `bookmark.read`, `tweet.read`, `users.read`. |
| Page size | `max_results` 1–100 |
| Pagination | `pagination_token` (base32hex). The response returns `meta.next_token` and `meta.result_count`. |
| Fields | `tweet.fields`/`post.fields`, `expansions` (e.g. `author_id`), `user.fields` |
| Response | `data[]` posts, `includes.users[]`, `errors[]` (problem objects), `meta` |
| Rate limit | **180 requests per 15 minutes per user.** No per-app limit is listed for this endpoint. |
| Rate-limit headers | `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset` (Unix seconds). Exceeding the limit returns HTTP **429**. |
| Authorize URL | `https://x.com/i/oauth2/authorize` with `response_type=code`, `client_id`, `redirect_uri` (must match a registered callback), `scope`, `state`, `code_challenge`, `code_challenge_method` (`S256` or `plain`) |
| Token URL | `POST https://api.x.com/2/oauth2/token` (form-encoded). Confidential clients send `Authorization: Basic base64(client_id:client_secret)`. |
| Token lifetime | Access tokens last **2 hours**. A refresh token is issued only with the `offline.access` scope. |
| Refresh | `grant_type=refresh_token` to the token URL |
| Revoke | `POST https://api.x.com/2/oauth2/revoke` with `token` (access or refresh). Confidential clients use Basic auth. |
| Identity | `GET /2/users/me` returns the authenticated user's stable `id`, `username` and `name` |
| Content policy | You must delete or modify stored content "if it is deleted or modified on X", including posts made private. This must happen as soon as reasonably possible, or within **24 hours** of a request from X or the account owner. |

## How BKMK.exe uses it

1. **OAuth.** Authorization Code with PKCE (`S256`), scopes `tweet.read users.read bookmark.read offline.access`. The client is confidential: the secret is used only on the server, in a Basic header.
2. **Identity.** After the token exchange we call `GET /2/users/me`. The **stable numeric ID** is the account key. A handle change updates the same account. If the account that logged in doesn't match the handle the visitor typed, the UI says so and asks them to confirm. The typed handle is never treated as proof of ownership.
3. **Scan.** `GET /2/users/{me.id}/bookmarks` with `max_results=100`, `expansions=author_id`, `tweet.fields=created_at,entities,conversation_id,note_tweet,public_metrics,referenced_tweets`, `user.fields=name,username`. The scan follows `meta.next_token` until one of these happens:
   - there's no next token,
   - a page comes back short,
   - the **configured cap** (`SCAN_MAX_BOOKMARKS`, default 800) is reached, or
   - a page budget is exhausted.

   It never requests another user's ID.
4. **Refresh.** Bookmarks come back most recent first. A refresh requests smaller pages (`SCAN_REFRESH_PAGE_SIZE`, default 25) and stops at the first page containing a post we already have. This keeps billed reads low.
5. **Rate limits.**
   - A 429 is retried after `x-rate-limit-reset` only if the wait is ≤ `X_MAX_RATE_LIMIT_WAIT_SECONDS` (default 20). Otherwise the scan ends as `partial` and keeps what it has.
   - 5xx and network errors get bounded exponential backoff with jitter (3 attempts).
   - 401 triggers one refresh-token attempt, then `auth_expired`.
   - 403 means `missing_permissions`. Other 4xx errors are permanent and aren't retried.
6. **Deletion sync.** After a **complete** scan (no next token and under the cap), stored bookmarks that X no longer returned are deleted: they were unbookmarked, deleted or made private. Capped or partial scans can't tell, so they delete nothing. Only "last seen" timestamps are kept for that case.

## Limited by the API

- **The 800 most recent bookmarks.** This cap appears in X's developer documentation and in many client libraries. However, it is **not stated on the current reference pages fetched for this check**. We therefore treat 800 as the expected ceiling, but not a verified one:
  - The cap is configurable.
  - We stop when X stops returning a `next_token`.
  - The UI always shows the count actually retrieved and says it's "the bookmarks X makes available (up to your most recent 800)". It never claims a complete history.
- **No bookmark timestamp.** X doesn't expose when a post was bookmarked. Dates shown are when the post was created.
- **No total count.** The API gives no total up front, so scan progress shows pages and counts, never a percentage of a known total.
- **Thread detection is heuristic.** Telling whether a bookmarked post opens a multi-post thread would need extra (billed) requests. We use `conversation_id == id` combined with thread markers in the text, and label the result a heuristic.

## Requires developer-console setup

- A project and app with **OAuth 2.0** enabled, type **Web App (confidential client)**.
- A registered callback URL that exactly matches `X_REDIRECT_URI`.
- Purchased credits and, ideally, a **spending limit** (pay-per-use).
- Whether a new app's access level can call the bookmarks endpoint at all **can't be verified without credentials.**

## Not verified without credentials

- That a newly created app has access to `GET /2/users/{id}/bookmarks` at its default access level.
- Whether `includes.users` returned through `expansions=author_id` is billed as "users returned" ($0.010 each). We assume it is (worst case), and expansion can be switched off with `X_EXPAND_AUTHORS=false`.
- Whether third-party users' bookmarks count as "Owned Reads" ($0.001). The docs describe owned reads as **your own data through your own app**, so we assume they don't, and use $0.005 per post.
- Error body shapes for every failure code. The client accepts both the `Error` and `Problem` shapes.

## Cost per scan

Confirmed prices (pay-per-use):

- **Posts:** $0.005 per post returned.
- **Users:** $0.010 per user returned.
- **Deduplication:** the same resource is billed once per 24 h UTC window (a "soft guarantee").

Estimates for one user's scans:

| Scenario | Posts | Unique authors (assumed) | `/users/me` | Estimated cost |
|---|---|---|---|---|
| Small collection, first scan | 50 | 35 | 1 | 50×0.005 + 35×0.01 + 0.01 = **$0.61** |
| Maximum collection, first scan | 800 | 300 | 1 | 4.00 + 3.00 + 0.01 = **$7.01** |
| Maximum, authors off | 800 | 0 | 1 | **$4.01** |
| Refresh (one page of 25, 3 new authors) | 25 | 3 | 0 | **$0.155** |
| Repeat within the same UTC day | — | — | — | ≈ $0 (deduplicated, not guaranteed) |

See `cost-model.md` for monthly projections.

## If X changes pricing or endpoint behaviour

- Price constants live in one place (`backend/app/config.py`, `X_PRICE_*`), and the estimate shown to operators is recomputed from them.
- The scan cap, page size, refresh page size and author expansion are environment settings.
- If the endpoint is removed or access is downgraded, scans fail with `missing_permissions` or `api_error`. The UI shows that error and demo mode still works.
- The client checks response shapes. If they don't match, the scan fails as `invalid_response` instead of storing malformed data.
