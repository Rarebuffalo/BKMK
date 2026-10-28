import re

import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.database import get_db
from app.models import OAuthAccount, OAuthState, User

from .conftest import login

PRIVATE = [
    ("GET", "/api/dashboard"),
    ("GET", "/api/topics"),
    ("GET", "/api/topics/ai/bookmarks"),
    ("GET", "/api/bookmarks"),
    ("GET", "/api/bookmarks/00000000-0000-0000-0000-000000000000"),
    ("GET", "/api/achievements"),
    ("GET", "/api/export"),
    ("GET", "/api/scans/latest"),
    ("GET", "/api/scans/00000000-0000-0000-0000-000000000000"),
    ("POST", "/api/scans"),
    ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/disconnect"),
    ("DELETE", "/api/account"),
]


def _start(client, **params):
    r = client.get("/api/auth/x/start", params=params, follow_redirects=False)
    return r, re.search(r"state=([^&]+)", r.headers["location"]).group(1)


@pytest.mark.parametrize(("method", "path"), PRIVATE)
def test_private_endpoints_require_a_session(client, method, path):
    r = client.request(method, path)
    assert r.status_code == 401
    assert r.json()["code"] == "not_authenticated"


def test_health_reports_database_without_secrets(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["database"] == "ok"
    assert "secret" not in str(body).lower()


def test_health_degrades_when_database_is_down_and_liveness_never_touches_it(client):
    class DownDb:
        def execute(self, *_):
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    client.app.dependency_overrides[get_db] = lambda: DownDb()
    try:
        r = client.get("/api/health")
        assert r.status_code == 503 and r.json()["database"] == "unavailable"
        assert "connection refused" not in r.text
        live = client.get("/api/health/live")
        assert live.status_code == 200 and live.json() == {"status": "ok"}
    finally:
        client.app.dependency_overrides.clear()


def test_start_sets_state_cookie_and_stores_only_hashes(client, db):
    r, state = _start(client, handle="bkmk_fixture")
    assert r.status_code == 303
    cookie = r.headers["set-cookie"]
    assert "bkmk_oauth_state=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    row = db.scalar(select(OAuthState))
    assert row.state_hash != state and state.encode() not in row.code_verifier_enc


def test_invalid_handle_is_rejected_before_redirecting_to_x(client):
    r = client.get("/api/auth/x/start", params={"handle": "bad handle!"}, follow_redirects=False)
    assert r.status_code in (303, 422)
    if r.status_code == 303:
        assert "invalid_handle" in r.headers["location"]


def test_full_login_creates_user_with_encrypted_tokens_and_session(client, db):
    csrf = login(client)
    user = db.scalar(select(User))
    assert user.x_user_id == "1000000000000000001" and user.handle == "bkmk_fixture"
    acct = db.scalar(select(OAuthAccount))
    assert b"fixture-token" not in acct.access_token_enc and acct.status == "active"
    me = client.get("/api/auth/me").json()
    assert me["user"]["handle"] == "bkmk_fixture" and me["csrfToken"] == csrf
    assert "token" not in str(me["connection"]).lower().replace("csrftoken", "")


def test_callback_rejects_state_mismatch_and_reuse(client):
    _, state = _start(client)
    r = client.get(
        "/api/auth/x/callback", params={"state": "forged", "code": "fixture-code-normal"}, follow_redirects=False
    )
    assert "state_mismatch" in r.headers["location"]
    # Any failed callback clears the state cookie; restore it to prove the real state still works once.
    client.cookies.set("bkmk_oauth_state", state, path="/api/auth/x")
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": "fixture-code-normal"}, follow_redirects=False
    )
    assert "auth=success" in r.headers["location"]
    client.cookies.set("bkmk_oauth_state", state, path="/api/auth/x")
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": "fixture-code-normal"}, follow_redirects=False
    )
    assert "state_mismatch" in r.headers["location"]


def test_callback_requires_the_browser_state_cookie(client):
    _, state = _start(client)
    client.cookies.clear()
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": "fixture-code-normal"}, follow_redirects=False
    )
    assert "state_mismatch" in r.headers["location"]
    assert not client.get("/api/auth/me").json()["authenticated"]


def test_user_cancelling_on_x_is_reported_as_cancelled(client):
    _, state = _start(client)
    r = client.get("/api/auth/x/callback", params={"state": state, "error": "access_denied"}, follow_redirects=False)
    assert r.headers["location"].startswith("http://frontend.test/connect?auth=cancelled")


def test_failed_code_exchange_is_reported(client):
    _, state = _start(client)
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": "not-a-fixture-code"}, follow_redirects=False
    )
    assert "auth=failed" in r.headers["location"] and "exchange_failed" in r.headers["location"]


def test_account_mismatch_is_flagged_not_silently_accepted(client):
    _, state = _start(client, handle="someone_else")
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": "fixture-code-normal"}, follow_redirects=False
    )
    loc = r.headers["location"]
    assert loc.startswith("http://frontend.test/connect?") and "requested=someone_else" in loc


def test_handle_change_keeps_the_same_account(client, db):
    login(client)
    user = db.scalar(select(User))
    user.handle = "old_name"
    db.commit()
    login(client)
    db.expire_all()
    users = db.scalars(select(User)).all()
    assert len(users) == 1 and users[0].handle == "bkmk_fixture"


def test_state_changing_requests_need_csrf(client):
    login(client)
    assert client.post("/api/scans", json={}).status_code == 403
    assert client.post("/api/scans", json={}, headers={"X-CSRF-Token": "nope"}).json()["code"] == "csrf_failed"


def test_allowlist_refuses_other_x_accounts_without_storing_them(client, db, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("ALLOWED_X_USERNAMES", "@someone_else")
    get_settings.cache_clear()
    _, state = _start(client)
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": "fixture-code-normal"}, follow_redirects=False
    )
    assert r.status_code == 303 and "reason=not_invited" in r.headers["location"]
    assert db.scalar(select(User)) is None and db.scalar(select(OAuthAccount)) is None
    assert client.get("/api/auth/me").json()["authenticated"] is False

    monkeypatch.setenv("ALLOWED_X_USERNAMES", "someone_else, BKMK_Fixture")
    get_settings.cache_clear()
    login(client)


def test_state_changing_requests_from_a_foreign_origin_are_refused(client):
    csrf = login(client)
    evil = client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"})
    assert evil.status_code == 403 and evil.json()["code"] == "origin_rejected"
    assert client.get("/api/auth/me").json()["authenticated"] is True
    ok = client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": "http://frontend.test"})
    assert ok.status_code == 204


def test_logout_ends_session(client):
    csrf = login(client)
    assert client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    assert client.get("/api/auth/me").json()["authenticated"] is False


def test_auth_endpoints_are_rate_limited(client):
    codes = [client.get("/api/auth/x/start", follow_redirects=False).status_code for _ in range(25)]
    assert 429 in codes


def test_mass_assignment_is_rejected(client):
    csrf = login(client)
    r = client.post("/api/scans", json={"mode": "full", "userId": "someone"}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 422


def test_oversized_requests_are_refused(client):
    csrf = login(client)
    r = client.post(
        "/api/scans",
        content=b"{" + b" " * 70_000 + b"}",
        headers={"X-CSRF-Token": csrf, "content-type": "application/json"},
    )
    assert r.status_code == 413


def test_security_headers_and_no_store(client):
    r = client.get("/api/auth/me")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "no-store"
