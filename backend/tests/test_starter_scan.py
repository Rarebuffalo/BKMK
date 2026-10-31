"""The low-cost starter scan (code defaults): 30 newest bookmarks, no author lookups,
one-post refresh probe. Every request to the (fixture) X API is recorded, so the
request count, parameters and billed resources are asserted exactly."""

from decimal import Decimal

import httpx
import pytest
from sqlalchemy import delete, func, select

from app.config import Settings, get_settings
from app.integrations import x_fixtures
from app.models import ApiUsageDaily, Bookmark, User

from .conftest import login, scan


@pytest.fixture
def x_requests(monkeypatch):
    seen: list[httpx.Request] = []

    def recording(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return x_fixtures.handler(request)

    monkeypatch.setattr(x_fixtures, "transport", lambda: httpx.MockTransport(recording))
    return seen


@pytest.fixture
def starter(monkeypatch):
    """The starter-scan values (the code defaults, asserted separately), set explicitly so a
    developer's backend/.env can't change what these tests measure."""
    for key, value in {
        "SCAN_MAX_BOOKMARKS": "30",
        "X_EXPAND_AUTHORS": "false",
        "SCAN_REFRESH_PROBE_SIZE": "1",
        "SCAN_REFRESH_PAGE_SIZE": "10",
    }.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()


def _bookmark_calls(reqs: list[httpx.Request]) -> list[httpx.Request]:
    return [r for r in reqs if r.url.path.endswith("/bookmarks")]


def _ledger(db) -> ApiUsageDaily:
    db.expire_all()
    return db.scalar(select(ApiUsageDaily))


def test_defaults_are_the_cheap_starter_scan_and_live_sync_is_off():
    # Field defaults (the test suite's env overrides don't apply to these).
    d = {k: f.default for k, f in Settings.model_fields.items()}
    assert d["live_sync_enabled"] is False
    assert (d["scan_max_bookmarks"], d["scan_refresh_probe_size"], d["x_expand_authors"]) == (30, 1, False)
    assert d["scan_cooldown_seconds"] == 3600


def test_first_scan_reads_30_posts_in_one_request_with_no_author_lookups(client, db, starter, x_requests):
    csrf = login(client)
    s = scan(client, csrf)

    (call,) = _bookmark_calls(x_requests)
    assert call.url.params["max_results"] == "30"
    assert "expansions" not in call.url.params and "user.fields" not in call.url.params
    assert [r.url.path for r in x_requests] == ["/2/oauth2/token", "/2/users/me", call.url.path]

    assert s["retrieved"] == 30 and s["apiRequests"] == 1
    assert s["status"] == "completed" and s["coverage"] == "sample" and s["stopReason"] == "scan_limit"
    assert s["coverageNote"] == "Your Bookmark DNA is based on your 30 most recent bookmarks."
    # Sign-in (1 user read) + 30 post reads = $0.010 + $0.150.
    ledger = _ledger(db)
    assert (ledger.requests, ledger.posts_read, ledger.users_read) == (2, 30, 1)
    assert ledger.estimated_cost_usd == Decimal("0.1600")

    report = client.get("/api/dashboard").json()
    assert report["archetype"]["provisional"] is False  # a labelled sample, not a failed scan
    assert report["stats"]["accessible"] == 30 and report["stats"]["authorCount"] == 0
    assert report["stats"]["topAuthors"] == []
    b = client.get("/api/bookmarks?limit=1").json()["items"][0]
    assert b["author"] == {"handle": "", "name": "Author not loaded"}
    assert b["url"].startswith("https://x.com/i/status/")


def test_refresh_stops_after_one_read_when_the_newest_bookmark_is_known(client, db, starter, x_requests):
    csrf = login(client)
    scan(client, csrf)
    x_requests.clear()
    before = _ledger(db).posts_read

    s = scan(client, csrf, "refresh")
    (call,) = _bookmark_calls(x_requests)
    assert call.url.params["max_results"] == "1"
    assert s["stopReason"] == "caught_up" and s["retrieved"] == 1 and s["newBookmarks"] == 0
    assert _ledger(db).posts_read - before == 1  # $0.005
    assert db.scalar(select(func.count()).select_from(Bookmark)) == 30


def test_refresh_fetches_only_until_it_reaches_known_bookmarks(client, db, starter, x_requests):
    csrf = login(client)
    scan(client, csrf)
    # Pretend the 3 newest were bookmarked after the first scan.
    newest = [p["id"] for p in x_fixtures.fixture_posts()[:3]]
    db.execute(delete(Bookmark).where(Bookmark.x_post_id.in_(newest)))
    db.commit()
    x_requests.clear()

    s = scan(client, csrf, "refresh")
    sizes = [c.url.params["max_results"] for c in _bookmark_calls(x_requests)]
    assert sizes == ["1", "10"]  # probe, then one small page that reaches known posts
    assert s["newBookmarks"] == 3 and s["retrieved"] == 11 and s["stopReason"] == "caught_up"
    assert db.scalar(select(func.count()).select_from(Bookmark)) == 30


def test_refresh_never_reads_past_the_scan_limit(client, db, starter, monkeypatch, x_requests):
    csrf = login(client)
    scan(client, csrf)
    db.execute(delete(Bookmark))  # every post now looks new
    db.commit()
    x_requests.clear()
    s = scan(client, csrf, "refresh")
    assert s["retrieved"] == 30 and s["stopReason"] == "scan_limit"
    assert sum(int(c.url.params["max_results"]) for c in _bookmark_calls(x_requests)) == 30


def test_budget_is_checked_before_any_billable_request(client, db, starter, monkeypatch, x_requests):
    monkeypatch.setenv("X_DAILY_BUDGET_USD", "0.12")  # sign-in fits, a 30-post scan ($0.15) doesn't
    get_settings.cache_clear()
    csrf = login(client)
    x_requests.clear()
    r = client.post("/api/scans", json={}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 429 and r.json()["code"] == "daily_budget"
    assert x_requests == []


def test_sign_in_is_refused_before_the_billed_users_me_read_when_the_budget_is_spent(
    client, db, starter, monkeypatch, x_requests
):
    monkeypatch.setenv("X_DAILY_BUDGET_USD", "0.005")
    get_settings.cache_clear()
    r = client.get("/api/auth/x/start", follow_redirects=False)
    state = r.headers["location"].split("state=")[1].split("&")[0]
    r = client.get(
        "/api/auth/x/callback", params={"state": state, "code": "fixture-code-normal"}, follow_redirects=False
    )
    assert "reason=daily_budget" in r.headers["location"]
    assert x_requests == [] and db.scalar(select(User)) is None


def test_402_on_a_starter_scan_is_one_request_and_never_retried(client, db, starter, x_requests):
    csrf = login(client, "credits")
    s = scan(client, csrf)
    assert len(_bookmark_calls(x_requests)) == 1
    assert s["status"] == "failed" and s["errorCode"] == "x_payment_required"
    assert _ledger(db).posts_read == 0


def test_cooldown_blocks_back_to_back_refreshes(client, db, starter, monkeypatch, x_requests):
    monkeypatch.setenv("SCAN_COOLDOWN_SECONDS", "3600")
    get_settings.cache_clear()
    csrf = login(client)
    scan(client, csrf)
    x_requests.clear()
    r = client.post("/api/scans", json={"mode": "refresh"}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 429 and r.json()["code"] == "scan_cooldown" and x_requests == []


def test_me_reports_the_scan_size_for_the_ui(client, starter):
    assert client.get("/api/auth/me").json()["scanLimit"] == 30
