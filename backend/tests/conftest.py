"""Test harness: isolated Postgres test database, fixture X API, fresh tables per test.

Never point TEST_DATABASE_URL at a database you care about: tables are truncated.
"""

import os
import re

os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://bkmk@localhost:54329/bkmk_test"),
        "X_API_MODE": "fixture",
        "LIVE_SYNC_ENABLED": "true",
        "SESSION_SECRET": "test-session-secret-test-session-secret-0000",
        "TOKEN_ENCRYPTION_KEY": "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "FRONTEND_URL": "http://frontend.test",
        "SCAN_COOLDOWN_SECONDS": "0",
        # Most tests exercise the full-collection engine (still supported by config).
        # test_starter_scan.py covers the code defaults: 30 newest, no author lookups.
        "SCAN_MAX_BOOKMARKS": "800",
        "X_EXPAND_AUTHORS": "true",
        "X_DAILY_BUDGET_USD": "1000",
        "X_CLIENT_ID": "",
        "X_CLIENT_SECRET": "",
    }
)

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import get_engine, get_sessionmaker  # noqa: E402
from app.main import create_app  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

assert "test" in os.environ["DATABASE_URL"], "refusing to run tests against a non-test database"

TABLES = "api_usage_daily, bookmark_tags, bookmarks, user_achievements, profile_stats, scans, sessions, oauth_accounts, oauth_states, users"


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_tables():
    with get_engine().begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} CASCADE"))
    limiter.reset()
    get_settings.cache_clear()
    yield


@pytest.fixture
def db():
    s = get_sessionmaker()()
    yield s
    s.close()


@pytest.fixture
def client():
    with TestClient(create_app(), base_url="http://testserver") as c:
        yield c


def login(client: TestClient, scenario: str = "normal", handle: str | None = "bkmk_fixture") -> str:
    """Runs the fixture OAuth flow and returns the CSRF token for the new session."""
    params = {"handle": handle} if handle else {}
    r = client.get("/api/auth/x/start", params=params, follow_redirects=False)
    assert r.status_code == 303, r.text
    state = re.search(r"state=([^&]+)", r.headers["location"]).group(1)
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": f"fixture-code-{scenario}"}, follow_redirects=False
    )
    assert r.status_code == 303, r.text
    me = client.get("/api/auth/me").json()
    assert me["authenticated"], me
    return me["csrfToken"]


def scan(client: TestClient, csrf: str, mode: str | None = None) -> dict:
    body = {"mode": mode} if mode else {}
    r = client.post("/api/scans", json=body, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 202, r.text
    # TestClient runs background tasks before returning, so the scan is finished.
    return client.get(f"/api/scans/{r.json()['id']}").json()
