import base64

import pytest
from cryptography.exceptions import InvalidTag
from pydantic import ValidationError

from app.config import Settings
from app.security import TokenCipher, generate_key, keyed_hash, pkce_challenge, pkce_verifier


def test_token_cipher_round_trip_and_unique_nonces():
    c = TokenCipher(generate_key())
    a, b = c.encrypt("secret-token", "access:u1"), c.encrypt("secret-token", "access:u1")
    assert a != b
    assert b"secret-token" not in a
    assert c.decrypt(a, "access:u1") == "secret-token"


def test_token_cipher_rejects_wrong_context_and_tampering():
    c = TokenCipher(generate_key())
    blob = c.encrypt("secret-token", "access:u1")
    with pytest.raises(InvalidTag):
        c.decrypt(blob, "access:u2")  # copied into another user's row
    tampered = blob[:-1] + bytes([blob[-1] ^ 1])
    with pytest.raises(InvalidTag):
        c.decrypt(tampered, "access:u1")
    with pytest.raises(InvalidTag):
        TokenCipher(generate_key()).decrypt(blob, "access:u1")


def test_pkce_matches_rfc7636_appendix_b():
    assert (
        pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    )


def test_pkce_verifier_length_and_charset():
    v = pkce_verifier()
    assert 43 <= len(v) <= 128
    assert set(v) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")


def test_keyed_hash_depends_on_secret():
    assert keyed_hash("a" * 32, "x") != keyed_hash("b" * 32, "x")


def test_production_refuses_missing_secrets_and_fixture_mode():
    with pytest.raises(ValidationError, match="Missing required production settings"):
        Settings(environment="production", _env_file=None)
    good = {
        "environment": "production",
        "x_client_id": "id",
        "x_client_secret": "secret",
        "session_secret": "s" * 40,
        "token_encryption_key": generate_key(),
        "frontend_url": "https://bkmk.example",
        "backend_url": "https://bkmk.example",
        "x_redirect_uri": "https://bkmk.example/api/auth/x/callback",
        "x_api_mode": "live",
        "_env_file": None,
    }
    assert Settings(**good).secure_cookies
    with pytest.raises(ValidationError, match="fixture"):
        Settings(**{**good, "x_api_mode": "fixture"})
    with pytest.raises(ValidationError, match="https"):
        Settings(**{**good, "frontend_url": "http://bkmk.example"})


def test_settings_validate_key_and_origins():
    with pytest.raises(ValidationError, match="32 bytes"):
        Settings(token_encryption_key=base64.urlsafe_b64encode(b"short").decode(), _env_file=None)
    with pytest.raises(ValidationError, match=r"\*"):
        Settings(allowed_origins="*", _env_file=None)


def test_database_url_scheme_is_normalised_for_psycopg():
    assert (
        Settings(database_url="postgres://u:p@h:5432/d", _env_file=None).database_url
        == "postgresql+psycopg://u:p@h:5432/d"
    )
    assert Settings(database_url="postgresql://u@h/d", _env_file=None).database_url == "postgresql+psycopg://u@h/d"
