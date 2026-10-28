"""Validated configuration. Secrets come only from the environment.

Non-sensitive settings have local defaults; secrets never do. Production
refuses to start with missing or unsafe values.
"""

import base64
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # backend/.env is read regardless of the working directory; real env vars win.
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://bkmk@localhost:54329/bkmk"

    # The browser-facing origin (Vercel in production). OAuth redirects go here and
    # state-changing requests must come from it.
    frontend_url: str = "http://localhost:5173"
    # Only needed when the SPA is served from a different origin than the API.
    # Comma-separated in the environment (NoDecode: not parsed as JSON).
    allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    # Absolute path to the built SPA. When set, the API serves it (same-origin deploy).
    frontend_dist: str | None = None

    # ── X OAuth 2.0 (Authorization Code + PKCE, confidential client) ──
    x_client_id: str | None = None
    x_client_secret: str | None = None
    x_redirect_uri: str = "http://localhost:5173/api/auth/x/callback"
    x_scopes: str = "tweet.read users.read bookmark.read offline.access"
    x_authorize_url: str = "https://x.com/i/oauth2/authorize"
    x_api_base: str = "https://api.x.com"
    # "fixture" serves recorded responses for tests/E2E only. Refused in production.
    x_api_mode: Literal["live", "fixture"] = "live"

    # ── Secrets (no defaults) ──
    session_secret: str | None = None
    token_encryption_key: str | None = None

    # ── Sessions ──
    session_ttl_hours: int = 24
    cookie_secure: bool | None = None  # defaults to True outside development/test

    # ── Scan behaviour and cost control ──
    scan_max_bookmarks: int = 800
    scan_page_size: int = 100
    scan_refresh_page_size: int = 25
    scan_cooldown_seconds: int = 300
    x_expand_authors: bool = True
    x_max_rate_limit_wait_seconds: int = 20
    x_request_timeout_seconds: float = 15.0

    # ── Pricing used for cost estimates (USD, pay-per-use, verified 2026-10-28) ──
    x_price_post_read: Decimal = Decimal("0.005")
    x_price_user_read: Decimal = Decimal("0.010")
    # Global cap on estimated X spend per UTC day, across all users. 0 disables live scans.
    x_daily_budget_usd: Decimal = Decimal("5.00")

    # ── Abuse protection ──
    auth_rate_limit_per_minute: int = 20
    max_request_bytes: int = 64_000

    @field_validator("database_url", mode="after")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        # Managed Postgres (Render, Fly, Neon…) hands out postgres:// URLs; use psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        if self.token_encryption_key is not None:
            try:
                key = base64.urlsafe_b64decode(self.token_encryption_key.encode())
            except Exception as exc:  # noqa: BLE001
                raise ValueError("TOKEN_ENCRYPTION_KEY must be url-safe base64") from exc
            if len(key) != 32:
                raise ValueError("TOKEN_ENCRYPTION_KEY must decode to 32 bytes (AES-256)")
        if self.session_secret is not None and len(self.session_secret) < 32:
            raise ValueError("SESSION_SECRET must be at least 32 characters")
        if "*" in self.allowed_origins:
            raise ValueError("ALLOWED_ORIGINS cannot contain '*' with credentialed requests")

        if self.environment == "production":
            missing = [
                name
                for name in ("x_client_id", "x_client_secret", "session_secret", "token_encryption_key")
                if not getattr(self, name)
            ]
            if missing:
                raise ValueError(f"Missing required production settings: {', '.join(n.upper() for n in missing)}")
            if self.x_api_mode != "live":
                raise ValueError("X_API_MODE=fixture is not allowed in production")
            for name in ("frontend_url", "x_redirect_uri"):
                if not getattr(self, name).startswith("https://"):
                    raise ValueError(f"{name.upper()} must use https in production")
        return self

    @property
    def secure_cookies(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.environment == "production"

    @property
    def trusted_origins(self) -> set[str]:
        return {self.frontend_url.rstrip("/"), *(o.rstrip("/") for o in self.allowed_origins)}

    @property
    def x_configured(self) -> bool:
        return self.x_api_mode == "fixture" or bool(self.x_client_id and self.x_client_secret)

    def require_secrets(self) -> tuple[str, str]:
        if not self.session_secret or not self.token_encryption_key:
            raise RuntimeError(
                "SESSION_SECRET and TOKEN_ENCRYPTION_KEY are required. "
                "Generate them with: uv run python -m app.cli gen-secrets"
            )
        return self.session_secret, self.token_encryption_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
