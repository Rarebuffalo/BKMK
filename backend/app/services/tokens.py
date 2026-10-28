"""Encrypted OAuth token storage and refresh."""

import logging
from datetime import timedelta

from cryptography.exceptions import InvalidTag
from sqlalchemy.orm import Session

from ..config import Settings
from ..integrations.x_client import TokenSet, XApiError, XClient
from ..models import OAuthAccount, User, utcnow
from ..security import TokenCipher

log = logging.getLogger("bkmk.tokens")
REFRESH_MARGIN = timedelta(seconds=90)


def cipher_for(settings: Settings) -> TokenCipher:
    _, key = settings.require_secrets()
    return TokenCipher(key)


def _aad(kind: str, user: User) -> str:
    return f"{kind}:{user.id}"


def store_tokens(db: Session, user: User, tokens: TokenSet, cipher: TokenCipher) -> OAuthAccount:
    acct = user.oauth_account or OAuthAccount(user_id=user.id)
    acct.access_token_enc = cipher.encrypt(tokens.access_token, _aad("access", user))
    if tokens.refresh_token:
        acct.refresh_token_enc = cipher.encrypt(tokens.refresh_token, _aad("refresh", user))
    acct.expires_at = tokens.expires_at
    acct.scopes = tokens.scope
    acct.status = "active"
    if user.oauth_account is None:
        db.add(acct)
        user.oauth_account = acct
    return acct


def decrypt_tokens(user: User, cipher: TokenCipher) -> tuple[str | None, str | None]:
    acct = user.oauth_account
    if acct is None:
        return None, None
    access = cipher.decrypt(acct.access_token_enc, _aad("access", user))
    refresh = cipher.decrypt(acct.refresh_token_enc, _aad("refresh", user)) if acct.refresh_token_enc else None
    return access, refresh


def valid_access_token(
    db: Session, user: User, client: XClient, cipher: TokenCipher, *, force_refresh: bool = False
) -> str:
    """Returns a usable access token, refreshing it when it's near expiry."""
    acct = user.oauth_account
    if acct is None or acct.status == "revoked":
        raise XApiError("auth_expired", "Connect your X account to scan.")
    try:
        access, refresh = decrypt_tokens(user, cipher)
    except InvalidTag:
        # Stored under a previous TOKEN_ENCRYPTION_KEY: unusable, so ask for a reconnect.
        log.warning("stored tokens unreadable; encryption key changed?", extra={"user_id": str(user.id)})
        acct.status = "expired"
        db.commit()
        raise XApiError("auth_expired", "Your X authorization needs renewing. Reconnect to continue.") from None
    expiring = acct.expires_at is not None and acct.expires_at - REFRESH_MARGIN <= utcnow()
    if not (force_refresh or expiring or acct.status == "expired"):
        return access  # type: ignore[return-value]
    if not refresh:
        acct.status = "expired"
        db.commit()
        raise XApiError("auth_expired", "Your X authorization expired. Reconnect to continue.")
    try:
        tokens = client.refresh(refresh)
    except XApiError as exc:
        acct.status = "expired"
        db.commit()
        raise XApiError("auth_expired", "Your X authorization expired. Reconnect to continue.") from exc
    store_tokens(db, user, tokens, cipher)
    db.commit()
    log.info("access token refreshed", extra={"user_id": str(user.id)})
    return tokens.access_token
