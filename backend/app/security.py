"""Cryptographic helpers: token encryption, PKCE, opaque identifiers."""

import base64
import hashlib
import hmac
import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE_BYTES = 12


class TokenCipher:
    """AES-256-GCM authenticated encryption for OAuth tokens at rest.

    The associated data binds a ciphertext to its purpose (e.g. "access:<user>"),
    so a token copied into another row or field fails to decrypt.
    """

    def __init__(self, key_b64: str):
        key = base64.urlsafe_b64decode(key_b64.encode())
        if len(key) != 32:
            raise ValueError("encryption key must be 32 bytes")
        self._aead = AESGCM(key)

    def encrypt(self, plaintext: str, aad: str) -> bytes:
        nonce = os.urandom(NONCE_BYTES)
        return nonce + self._aead.encrypt(nonce, plaintext.encode(), aad.encode())

    def decrypt(self, blob: bytes, aad: str) -> str:
        nonce, ct = blob[:NONCE_BYTES], blob[NONCE_BYTES:]
        return self._aead.decrypt(nonce, ct, aad.encode()).decode()


def generate_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


def new_opaque_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def keyed_hash(secret: str, value: str) -> str:
    """HMAC-SHA256 so a leaked database can't be used to forge session cookies."""
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


# ── PKCE (RFC 7636) ──────────────────────────────────────────────────────────


def pkce_verifier() -> str:
    """43–128 chars from the unreserved set. token_urlsafe(64) yields 86."""
    return secrets.token_urlsafe(64)


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
