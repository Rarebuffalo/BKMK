"""Server-side sessions in an HttpOnly cookie, with a per-session CSRF token."""

from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .models import AppSession, User, utcnow
from .security import constant_time_equals, keyed_hash, new_opaque_token

CSRF_HEADER = "X-CSRF-Token"


def cookie_name(settings: Settings) -> str:
    # __Host- prefix forces Secure, Path=/ and no Domain: the cookie can't be
    # set by a subdomain or sent over plain HTTP.
    return "__Host-bkmk_session" if settings.secure_cookies else "bkmk_session"


@dataclass
class CurrentSession:
    user: User
    session: AppSession


def create_session(db: Session, response: Response, user: User, settings: Settings) -> AppSession:
    secret, _ = settings.require_secrets()
    raw = new_opaque_token()
    row = AppSession(
        id_hash=keyed_hash(secret, raw),
        user_id=user.id,
        csrf_token=new_opaque_token(24),
        expires_at=utcnow() + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(row)
    user.last_seen_at = utcnow()
    response.set_cookie(
        cookie_name(settings),
        raw,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )
    return row


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        cookie_name(settings), path="/", secure=settings.secure_cookies, httponly=True, samesite="lax"
    )


def _lookup(request: Request, db: Session, settings: Settings) -> CurrentSession | None:
    raw = request.cookies.get(cookie_name(settings))
    if not raw or len(raw) > 128:
        return None
    secret, _ = settings.require_secrets()
    row = db.get(AppSession, keyed_hash(secret, raw))
    if row is None or row.expires_at <= utcnow():
        return None
    user = db.get(User, row.user_id)
    return CurrentSession(user=user, session=row) if user else None


def optional_session(
    request: Request, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> CurrentSession | None:
    return _lookup(request, db, settings)


def require_session(current: CurrentSession | None = Depends(optional_session)) -> CurrentSession:
    if current is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail={"code": "not_authenticated", "message": "Sign in with X to continue."}
        )
    return current


def require_csrf(
    request: Request,
    current: CurrentSession = Depends(require_session),
    settings: Settings = Depends(get_settings),
) -> CurrentSession:
    """For state-changing requests: SameSite=Lax blocks most CSRF; this closes the rest."""
    # Defence in depth: browsers always send Origin on POST/DELETE; a foreign one is refused.
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in settings.trusted_origins:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail={"code": "origin_rejected", "message": "Request origin not allowed."}
        )
    token = request.headers.get(CSRF_HEADER, "")
    if not token or not constant_time_equals(token, current.session.csrf_token):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"code": "csrf_failed", "message": "Security check failed. Reload and try again."},
        )
    return current


def purge_expired(db: Session) -> None:
    db.execute(delete(AppSession).where(AppSession.expires_at <= utcnow()))


def end_all_sessions(db: Session, user: User) -> None:
    db.execute(delete(AppSession).where(AppSession.user_id == user.id))
