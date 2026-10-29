"""Official X API v2 client: OAuth 2.0 (PKCE, confidential client) and bookmarks.

Endpoints and behaviour follow docs/x-api-integration.md. Tokens, codes and
verifiers are never logged. All responses are shape-checked before use.
"""

import base64
import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx

from ..config import Settings

log = logging.getLogger("bkmk.x")

RETRYABLE_STATUS = {500, 502, 503, 504}
MAX_ATTEMPTS = 3
TWEET_FIELDS = "created_at,entities,conversation_id,note_tweet,author_id"
USER_FIELDS = "name,username,profile_image_url"


class XApiError(Exception):
    """Normalised failure. `code` is safe to show; `detail` is for logs only."""

    def __init__(self, code: str, message: str, *, status: int | None = None, retry_after: float | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retry_after = retry_after


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    scope: str


@dataclass
class XUser:
    id: str
    username: str
    name: str
    profile_image_url: str | None = None


@dataclass
class XPost:
    id: str
    text: str
    author_id: str
    created_at: datetime | None
    conversation_id: str | None
    links: list[str]
    is_long_form: bool


@dataclass
class BookmarkPage:
    posts: list[XPost]
    users: dict[str, XUser]
    next_token: str | None
    result_count: int
    unavailable: int
    rate_limit_remaining: int | None = None
    requests: int = 1


@dataclass
class UsageCounter:
    requests: int = 0
    posts: int = 0
    users: int = 0
    rate_limit_remaining: int | None = None
    seen_users: set[str] = field(default_factory=set)


def _parse_dt(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_x_link(url: str) -> bool:
    host = httpx.URL(url).host if url.startswith("http") else ""
    return host.removeprefix("www.") in {"x.com", "twitter.com", "t.co", "pic.x.com", "pic.twitter.com"}


def parse_post(raw: object) -> XPost:
    if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not isinstance(raw.get("text"), str):
        raise XApiError("invalid_response", "X returned a post in an unexpected format.")
    note = raw.get("note_tweet")
    text = note["text"] if isinstance(note, dict) and isinstance(note.get("text"), str) else raw["text"]
    urls = (raw.get("entities") or {}).get("urls") or []
    links: list[str] = []
    for u in urls if isinstance(urls, list) else []:
        href = u.get("unwound_url") or u.get("expanded_url") if isinstance(u, dict) else None
        if isinstance(href, str) and href.startswith("http") and not _is_x_link(href) and href not in links:
            links.append(href[:500])
    return XPost(
        id=raw["id"],
        text=text,
        author_id=str(raw.get("author_id") or ""),
        created_at=_parse_dt(raw.get("created_at")),
        conversation_id=raw.get("conversation_id") if isinstance(raw.get("conversation_id"), str) else None,
        links=links,
        is_long_form=isinstance(note, dict),
    )


def parse_user(raw: object) -> XUser:
    if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not isinstance(raw.get("username"), str):
        raise XApiError("invalid_response", "X returned a user in an unexpected format.")
    return XUser(raw["id"], raw["username"], str(raw.get("name") or raw["username"]), raw.get("profile_image_url"))


class XClient:
    def __init__(
        self,
        settings: Settings,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.s = settings
        self._sleep = sleep
        self._http = httpx.Client(
            base_url=settings.x_api_base,
            timeout=settings.x_request_timeout_seconds,
            transport=transport,
            headers={"User-Agent": "BKMK.exe/0.1"},
        )

    def close(self) -> None:
        self._http.close()

    # ── OAuth ────────────────────────────────────────────────────────────────

    def authorize_url(self, state: str, code_challenge: str) -> str:
        params = {
            "response_type": "code",
            "client_id": self.s.x_client_id or "fixture-client",
            "redirect_uri": self.s.x_redirect_uri,
            "scope": self.s.x_scopes,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{self.s.x_authorize_url}?{urlencode(params)}"

    def _basic_auth(self) -> dict[str, str]:
        raw = f"{self.s.x_client_id}:{self.s.x_client_secret}".encode()
        return {"Authorization": f"Basic {base64.b64encode(raw).decode()}"}

    def _token_request(self, data: dict[str, str]) -> TokenSet:
        resp = self._request("POST", "/2/oauth2/token", data=data, headers=self._basic_auth(), retry=False)
        body = self._json(resp)
        token = body.get("access_token")
        if not isinstance(token, str):
            raise XApiError("invalid_response", "X returned no access token.")
        expires_in = body.get("expires_in")
        return TokenSet(
            access_token=token,
            refresh_token=body.get("refresh_token") if isinstance(body.get("refresh_token"), str) else None,
            expires_at=datetime.now(UTC) + timedelta(seconds=int(expires_in)) if isinstance(expires_in, int) else None,
            scope=str(body.get("scope") or ""),
        )

    def exchange_code(self, code: str, verifier: str) -> TokenSet:
        return self._token_request(
            {
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.s.x_redirect_uri,
                "code_verifier": verifier,
            }
        )

    def refresh(self, refresh_token: str) -> TokenSet:
        return self._token_request({"refresh_token": refresh_token, "grant_type": "refresh_token"})

    def revoke(self, token: str) -> bool:
        try:
            resp = self._request(
                "POST", "/2/oauth2/revoke", data={"token": token}, headers=self._basic_auth(), retry=False
            )
            return resp.status_code == 200
        except XApiError as exc:
            log.warning("token revoke failed", extra={"code": exc.code, "status": exc.status})
            return False

    # ── Data ─────────────────────────────────────────────────────────────────

    def get_me(self, access_token: str, usage: UsageCounter | None = None) -> XUser:
        resp = self._request("GET", "/2/users/me", params={"user.fields": USER_FIELDS}, token=access_token)
        body = self._json(resp)
        user = parse_user(body.get("data"))
        if usage:
            usage.requests += 1
            usage.users += 1
        return user

    def get_bookmarks_page(
        self,
        access_token: str,
        user_id: str,
        *,
        max_results: int,
        pagination_token: str | None,
        expand_authors: bool,
        usage: UsageCounter | None = None,
    ) -> BookmarkPage:
        if not user_id.isdigit():
            raise XApiError("invalid_request", "Invalid X user id.")
        params: dict[str, str | int] = {"max_results": max(1, min(100, max_results)), "tweet.fields": TWEET_FIELDS}
        if expand_authors:
            params["expansions"] = "author_id"
            params["user.fields"] = USER_FIELDS
        if pagination_token:
            params["pagination_token"] = pagination_token
        resp = self._request("GET", f"/2/users/{user_id}/bookmarks", params=params, token=access_token)
        body = self._json(resp)

        data = body.get("data", [])
        if not isinstance(data, list):
            raise XApiError("invalid_response", "X returned bookmarks in an unexpected format.")
        posts = [parse_post(p) for p in data]
        includes = body.get("includes") or {}
        users = {u.id: u for u in (parse_user(u) for u in includes.get("users", []) if isinstance(includes, dict))}
        meta = body.get("meta") or {}
        next_token = meta.get("next_token") if isinstance(meta.get("next_token"), str) else None
        errors = body.get("errors") or []
        remaining = resp.headers.get("x-rate-limit-remaining")
        page = BookmarkPage(
            posts=posts,
            users=users,
            next_token=next_token,
            result_count=int(meta.get("result_count", len(posts))),
            unavailable=len(errors) if isinstance(errors, list) else 0,
            rate_limit_remaining=int(remaining) if remaining and remaining.isdigit() else None,
        )
        if usage:
            usage.requests += 1
            usage.posts += len(posts)
            new_users = set(users) - usage.seen_users
            usage.users += len(new_users)
            usage.seen_users |= new_users
            usage.rate_limit_remaining = page.rate_limit_remaining
        return page

    # ── Transport with bounded retries ────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        params: dict | None = None,
        data: dict | None = None,
        headers: dict | None = None,
        retry: bool = True,
    ) -> httpx.Response:
        hdrs = dict(headers or {})
        if token:
            hdrs["Authorization"] = f"Bearer {token}"
        attempt = 0
        rate_waited = False
        while True:
            attempt += 1
            try:
                resp = self._http.request(method, path, params=params, data=data, headers=hdrs)
            except httpx.TransportError as exc:
                if retry and attempt < MAX_ATTEMPTS:
                    self._backoff(attempt)
                    continue
                raise XApiError("network", "Couldn't reach X. Check your connection and try again.") from exc

            if resp.status_code < 400:
                return resp
            if resp.status_code == 429:
                reset = resp.headers.get("x-rate-limit-reset")
                wait = max(0.0, float(reset) - time.time()) if reset and reset.isdigit() else None
                if retry and not rate_waited and wait is not None and wait <= self.s.x_max_rate_limit_wait_seconds:
                    rate_waited = True
                    self._sleep(wait + 0.5)
                    continue
                raise XApiError("rate_limited", "X's rate limit was reached.", status=429, retry_after=wait)
            if resp.status_code in RETRYABLE_STATUS and retry and attempt < MAX_ATTEMPTS:
                self._backoff(attempt)
                continue
            raise self._error_for(resp)

    def _backoff(self, attempt: int) -> None:
        # Exponential backoff with full jitter, capped at 8 s.
        self._sleep(random.uniform(0, min(8.0, 0.5 * 2**attempt)))  # noqa: S311

    @staticmethod
    def _json(resp: httpx.Response) -> dict:
        try:
            body = resp.json()
        except ValueError as exc:
            raise XApiError("invalid_response", "X returned a response that isn't JSON.") from exc
        if not isinstance(body, dict):
            raise XApiError("invalid_response", "X returned an unexpected response.")
        return body

    @staticmethod
    def _problem(resp: httpx.Response) -> dict[str, str]:
        """X's RFC 7807-style problem fields, trimmed. They describe the failure and
        carry no tokens or post content, so they are safe to log."""
        try:
            body = resp.json()
        except ValueError:
            body = None
        out: dict[str, str] = {}
        if isinstance(body, dict):
            for key in ("type", "title", "detail", "error"):
                if isinstance(body.get(key), str):
                    out[key] = body[key][:160]
            errors = body.get("errors")
            if "type" not in out and isinstance(errors, list) and errors and isinstance(errors[0], dict):
                for key in ("type", "title", "detail"):
                    if isinstance(errors[0].get(key), str):
                        out[key] = errors[0][key][:160]
        if tx := resp.headers.get("x-transaction-id"):
            out["transaction_id"] = tx[:64]
        return out

    @classmethod
    def _error_for(cls, resp: httpx.Response) -> XApiError:
        status = resp.status_code
        problem = cls._problem(resp)
        # Status, X's problem type and transaction id: enough to diagnose or quote to X support.
        log.warning(
            "x api error",
            extra={"status": status, "path": resp.request.url.path, **{f"x_{k}": v for k, v in problem.items()}},
        )
        kind = problem.get("type", "").rsplit("/", 1)[-1]
        if status == 401:
            return XApiError("auth_expired", "Your X authorization expired or was revoked.", status=status)
        if status == 402:
            # Pay-per-use billing: the developer account behind this app has no usable
            # credit (X's problem type is usually "credits-depleted"). Not the user's
            # fault, not temporary, and retrying only repeats the refusal.
            return XApiError(
                "x_payment_required",
                "X refused the request because BKMK.exe's X API credit has run out. "
                "Scanning is paused until the app owner adds credit.",
                status=status,
            )
        if status == 403:
            if kind in ("client-forbidden", "client-not-enrolled"):
                return XApiError(
                    "x_access_restricted",
                    "X says this app's API access level doesn't include bookmarks. The app owner needs to fix this.",
                    status=status,
                )
            return XApiError(
                "missing_permissions", "X refused access. The app may lack bookmark permissions.", status=status
            )
        if status == 400:
            # OAuth token endpoint returns 400 with error=invalid_grant for bad/expired codes.
            if problem.get("error") == "invalid_grant":
                return XApiError("invalid_grant", "The authorization code or token is no longer valid.", status=status)
            return XApiError("invalid_request", "X rejected the request.", status=status)
        if status >= 500:
            return XApiError("api_error", f"X returned a server error (HTTP {status}).", status=status)
        return XApiError("x_request_rejected", f"X rejected the request (HTTP {status}).", status=status)
