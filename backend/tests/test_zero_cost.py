"""The zero-cost guarantee: with LIVE_SYNC_ENABLED off, nothing reaches X's billed API."""

import re

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.integrations.x_client import XClient
from app.models import OAuthState, Scan, User

from .conftest import login


@pytest.fixture
def x_calls():
    return []


def _off(monkeypatch, calls: list[str], mode: str = "live"):
    """Switches live sync off and turns any X request into a recorded test failure."""

    def record(self, method, path, **_kw):
        calls.append(f"{method} {path}")
        raise AssertionError(f"X API called with live sync off: {method} {path}")

    monkeypatch.setattr(XClient, "_request", record)
    monkeypatch.setenv("LIVE_SYNC_ENABLED", "false")
    monkeypatch.setenv("X_API_MODE", mode)
    monkeypatch.setenv("X_CLIENT_ID", "cid")
    monkeypatch.setenv("X_CLIENT_SECRET", "csecret")
    get_settings.cache_clear()


@pytest.mark.parametrize("mode", ["live", "fixture"])
def test_live_sync_off_makes_no_x_calls_anywhere(db, monkeypatch, x_calls, mode):
    from fastapi.testclient import TestClient

    from app.main import create_app

    _off(monkeypatch, x_calls, mode)
    client = TestClient(create_app())
    me = client.get("/api/auth/me").json()
    assert me["xConfigured"] is False and me["liveSyncEnabled"] is False
    health = client.get("/api/health").json()
    assert health["xConfigured"] is False

    r = client.get("/api/auth/x/start", params={"handle": "ada"}, follow_redirects=False)
    assert r.status_code == 303 and "reason=not_configured" in r.headers["location"]
    assert db.scalar(select(OAuthState)) is None

    # A callback with a crafted code is refused before any token exchange or /users/me read.
    r = client.get("/api/auth/x/callback", params={"state": "s", "code": "c"}, follow_redirects=False)
    assert r.status_code == 303 and "auth=failed" in r.headers["location"]
    assert x_calls == []


def test_callback_for_a_pending_sign_in_skips_x_once_live_sync_is_switched_off(client, db, monkeypatch, x_calls):
    r = client.get("/api/auth/x/start", follow_redirects=False)
    state = re.search(r"state=([^&]+)", r.headers["location"]).group(1)
    _off(monkeypatch, x_calls)
    r = client.get("/api/auth/x/callback", params={"state": state, "code": "anything"}, follow_redirects=False)
    assert "reason=not_configured" in r.headers["location"]
    assert db.scalar(select(User)) is None and x_calls == []


def test_existing_users_cannot_start_paid_scans_when_live_sync_is_off(client, db, monkeypatch, x_calls):
    csrf = login(client)  # signed in while live sync was on (fixture)
    _off(monkeypatch, x_calls)
    r = client.post("/api/scans", json={}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 409 and r.json()["code"] == "live_sync_disabled"
    assert db.scalar(select(Scan)) is None and x_calls == []


def test_a_queued_scan_fails_without_calling_x_if_live_sync_turns_off(client, db, monkeypatch, x_calls):
    from app.database import get_sessionmaker
    from app.integrations import make_x_client
    from app.services.scan_service import create_scan, run_scan

    login(client)
    user = db.scalar(select(User))
    scan, _ = create_scan(db, user, get_settings(), None)
    _off(monkeypatch, x_calls)
    run_scan(scan.id, get_sessionmaker(), get_settings(), lambda: make_x_client(get_settings()))
    db.expire_all()
    assert db.get(Scan, scan.id).error_code == "live_sync_disabled" and x_calls == []


def test_production_starts_without_x_credentials_when_live_sync_is_off(monkeypatch):
    from app.config import Settings

    env = {
        "ENVIRONMENT": "production",
        "LIVE_SYNC_ENABLED": "false",
        "X_API_MODE": "live",
        "X_CLIENT_ID": "",
        "X_CLIENT_SECRET": "",
        "FRONTEND_URL": "https://bkmk.example",
        "X_REDIRECT_URI": "https://bkmk.example/api/auth/x/callback",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    assert Settings().x_configured is False
    monkeypatch.setenv("LIVE_SYNC_ENABLED", "true")
    with pytest.raises(ValueError, match="X_CLIENT_ID"):
        Settings()
