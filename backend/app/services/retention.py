"""Housekeeping: expired sessions and OAuth states, and the inactivity retention policy.

Bookmark text is private data we only hold to serve the dashboard. Accounts nobody
has signed in to or scanned for `DATA_RETENTION_DAYS` are revoked at X and deleted.
"""

import logging
from collections.abc import Callable
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import Settings
from ..integrations.x_client import XClient
from ..models import OAuthState, User, utcnow
from ..sessions import purge_expired
from .library import delete_account

log = logging.getLogger("bkmk.retention")
BATCH = 50


def purge_inactive_accounts(db: Session, settings: Settings, client_factory: Callable[[], XClient]) -> int:
    if settings.data_retention_days <= 0:
        return 0
    cutoff = utcnow() - timedelta(days=settings.data_retention_days)
    stale = db.scalars(
        select(User).where(func.coalesce(User.last_seen_at, User.created_at) < cutoff).limit(BATCH)
    ).all()
    if not stale:
        return 0
    client = client_factory()
    try:
        for user in stale:
            delete_account(db, user, settings, client)
    finally:
        client.close()
    log.info("inactive accounts deleted", extra={"count": len(stale), "retention_days": settings.data_retention_days})
    return len(stale)


def run_maintenance(db: Session, settings: Settings, client_factory: Callable[[], XClient]) -> None:
    purge_expired(db)
    db.execute(delete(OAuthState).where(OAuthState.expires_at <= utcnow()))
    db.commit()
    purge_inactive_accounts(db, settings, client_factory)
