"""X OAuth 2.0 (Authorization Code + PKCE) and session endpoints."""

import html
import logging
import re
from datetime import timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..integrations import make_x_client
from ..integrations.x_client import XApiError
from ..models import AppSession, OAuthState, User, utcnow
from ..ratelimit import enforce
from ..schemas import ConnectionOut, MeOut, UserOut
from ..security import TokenCipher, constant_time_equals, keyed_hash, new_opaque_token, pkce_challenge, pkce_verifier
from ..services.budget import can_afford_cost, record_usage
from ..services.library import delete_account
from ..services.tokens import store_tokens
from ..sessions import CurrentSession, clear_session_cookie, create_session, optional_session, require_csrf

log = logging.getLogger("bkmk.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

STATE_COOKIE = "bkmk_oauth_state"
STATE_TTL = timedelta(minutes=10)
HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{1,15}$")
# Fixed allowlist: the post-login destination can only be one of these paths.
RETURN_PATHS = {"scan": "/scan", "settings": "/app/settings"}


def _frontend(settings: Settings, path: str, **params: str) -> RedirectResponse:
    query = f"?{urlencode(params)}" if params else ""
    resp = RedirectResponse(f"{settings.frontend_url.rstrip('/')}{path}{query}", status_code=303)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@router.get("/x/start", include_in_schema=True)
def start(
    request: Request,
    handle: str | None = Query(default=None, max_length=15),
    return_to: str = Query(default="scan", alias="returnTo"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    enforce(request, "auth", settings.auth_rate_limit_per_minute)
    if not settings.x_configured:
        return _frontend(settings, "/connect", auth="failed", reason="not_configured")
    if handle is not None and not HANDLE_RE.match(handle):
        return _frontend(settings, "/connect", auth="failed", reason="invalid_handle")

    secret, key = settings.require_secrets()
    state = new_opaque_token()
    verifier = pkce_verifier()
    state_hash = keyed_hash(secret, state)
    db.execute(delete(OAuthState).where(OAuthState.expires_at <= utcnow()))
    db.add(
        OAuthState(
            state_hash=state_hash,
            code_verifier_enc=TokenCipher(key).encrypt(verifier, f"pkce:{state_hash}"),
            requested_handle=handle,
            return_to=RETURN_PATHS.get(return_to, "/scan"),
            expires_at=utcnow() + STATE_TTL,
        )
    )
    db.commit()

    client = make_x_client(settings)
    try:
        url = client.authorize_url(state, pkce_challenge(verifier))
    finally:
        client.close()
    if settings.x_api_mode == "fixture":
        url = f"/api/auth/x/fixture-authorize?{urlencode({'state': state})}"
    resp = RedirectResponse(url, status_code=303)
    # Binds the authorization to this browser. Lax so it survives the top-level redirect back from X.
    resp.set_cookie(
        STATE_COOKIE,
        state,
        max_age=int(STATE_TTL.total_seconds()),
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/api/auth/x",
    )
    resp.headers["Cache-Control"] = "no-store"
    return resp


@router.get("/x/callback")
def callback(
    request: Request,
    state: str = Query(default="", max_length=128),
    code: str | None = Query(default=None, max_length=2048),
    error: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    enforce(request, "auth", settings.auth_rate_limit_per_minute)
    secret, key = settings.require_secrets()
    cookie_state = request.cookies.get(STATE_COOKIE, "")

    row = db.get(OAuthState, keyed_hash(secret, state)) if state else None
    if row is not None:
        db.delete(row)  # single use, whatever happens next
        db.commit()

    def fail(reason: str, **extra: str) -> RedirectResponse:
        resp = _frontend(
            settings, "/connect", auth="cancelled" if reason == "cancelled" else "failed", reason=reason, **extra
        )
        resp.delete_cookie(STATE_COOKIE, path="/api/auth/x")
        return resp

    if (
        not state
        or not cookie_state
        or not constant_time_equals(state, cookie_state)
        or row is None
        or row.expires_at <= utcnow()
    ):
        log.warning("oauth state rejected")
        return fail("state_mismatch")
    if error:
        return fail("cancelled" if error == "access_denied" else "provider_error")
    if not code:
        return fail("provider_error")

    if not settings.x_configured:
        return fail("not_configured")  # never spend a billed /users/me read with live sync off
    # Sign-in costs one billed user read (/2/users/me: X's token response carries no user id).
    if not can_afford_cost(db, settings, settings.x_price_user_read):
        return fail("daily_budget")
    verifier = TokenCipher(key).decrypt(row.code_verifier_enc, f"pkce:{row.state_hash}")
    client = make_x_client(settings)
    try:
        tokens = client.exchange_code(code, verifier)
        me = client.get_me(tokens.access_token)
        record_usage(db, settings, requests=1, posts=0, users=1)
        if not settings.x_username_allowed(me.username):
            # Private beta: hand the grant straight back rather than keep it.
            for t in (tokens.refresh_token, tokens.access_token):
                if t:
                    client.revoke(t)
            db.commit()
            log.info("sign-in refused: not on allowlist")
            return fail("not_invited")
    except XApiError as exc:
        log.warning("oauth exchange failed", extra={"code": exc.code, "status": exc.status})
        # Billing and access-level refusals are the app owner's to fix: say so, not "try again".
        if exc.code in ("x_payment_required", "x_access_restricted"):
            return fail(exc.code)
        return fail("exchange_failed")
    finally:
        client.close()

    # Stable X id is the identity; a renamed handle updates the same account.
    user = db.scalar(select(User).where(User.x_user_id == me.id))
    if user is None:
        user = User(x_user_id=me.id, handle=me.username)
        db.add(user)
        db.flush()
    user.handle, user.display_name, user.profile_image_url = me.username, me.name, me.profile_image_url
    store_tokens(db, user, tokens, TokenCipher(key))

    params = {"auth": "success"}
    if row.requested_handle and row.requested_handle.lower() != me.username.lower():
        params["requested"] = row.requested_handle
    resp = (
        _frontend(settings, row.return_to, **params)
        if "requested" not in params
        else _frontend(settings, "/connect", **params)
    )
    create_session(db, resp, user, settings)
    db.commit()
    resp.delete_cookie(STATE_COOKIE, path="/api/auth/x")
    log.info("x account connected", extra={"user_id": str(user.id)})
    return resp


@router.get("/x/fixture-authorize", include_in_schema=False)
def fixture_authorize(state: str = Query(max_length=128), settings: Settings = Depends(get_settings)) -> HTMLResponse:
    """Stand-in for X's consent screen. Only exists in fixture mode (tests / local E2E)."""
    if settings.x_api_mode != "fixture" or settings.environment == "production":
        return HTMLResponse("Not found", status_code=404)
    s = html.escape(state, quote=True)
    options = [
        ("normal", "Approve"),
        ("empty", "Approve — empty account"),
        ("ratelimit", "Approve — rate-limited"),
        ("revoked", "Approve — token revoked"),
        ("credits", "Approve — X API credit used up"),
    ]
    links = "".join(
        f'<p><a data-scenario="{k}" href="/api/auth/x/callback?state={s}&amp;code=fixture-code-{k}">{label}</a></p>'
        for k, label in options
    )
    body = f"""<!doctype html><meta charset=utf-8><title>Fixture X authorization</title>
<body style="font-family:monospace;background:#111;color:#eee;padding:2rem">
<h1>FIXTURE X AUTHORIZATION</h1><p>Test mode. No real X account is involved.</p>{links}
<p><a data-scenario="deny" href="/api/auth/x/callback?state={s}&amp;error=access_denied">Cancel</a></p></body>"""
    return HTMLResponse(body, headers={"Cache-Control": "no-store"})


@router.get("/me", response_model=MeOut)
def me(current: CurrentSession | None = Depends(optional_session), settings: Settings = Depends(get_settings)) -> MeOut:
    base = {
        "x_configured": settings.x_configured,
        "live_sync_enabled": settings.live_sync_enabled,
        "api_mode": settings.x_api_mode,
        "data_retention_days": settings.data_retention_days,
        "scan_limit": settings.scan_max_bookmarks,
    }
    if current is None:
        return MeOut(authenticated=False, **base)
    u, acct = current.user, current.user.oauth_account
    return MeOut(
        authenticated=True,
        user=UserOut(
            handle=u.handle,
            display_name=u.display_name,
            profile_image_url=u.profile_image_url,
            last_scan_at=u.last_scan_at,
        ),
        connection=ConnectionOut(status=acct.status, scopes=acct.scopes.split(), expires_at=acct.expires_at)
        if acct
        else None,
        csrf_token=current.session.csrf_token,
        **base,
    )


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    current: CurrentSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    db.execute(delete(AppSession).where(AppSession.id_hash == current.session.id_hash))
    db.commit()
    clear_session_cookie(response, settings)
    response.status_code = 204
    return response


@router.post("/disconnect")
def disconnect(
    response: Response,
    current: CurrentSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Revokes BKMK.exe's access at X and deletes everything stored for the account."""
    client = make_x_client(settings)
    try:
        revoked = delete_account(db, current.user, settings, client)
    finally:
        client.close()
    clear_session_cookie(response, settings)
    return {"deleted": True, "revoked": revoked}
