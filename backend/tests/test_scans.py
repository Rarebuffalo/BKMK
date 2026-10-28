from datetime import UTC, datetime

from sqlalchemy import func, select

from app.integrations.x_fixtures import FIXTURE_TOTAL
from app.models import Bookmark, Scan, UserAchievement

from .conftest import login, scan


def count(db, model, **where):
    stmt = select(func.count()).select_from(model)
    for k, v in where.items():
        stmt = stmt.where(getattr(model, k) == v)
    return db.scalar(stmt)


def test_full_scan_persists_classified_bookmarks_and_report(client, db):
    csrf = login(client)
    s = scan(client, csrf)
    assert s["status"] == "completed" and s["coverage"] == "complete" and s["stopReason"] == "end_of_collection"
    assert s["retrieved"] == FIXTURE_TOTAL and s["newBookmarks"] == FIXTURE_TOTAL and s["pages"] == 3
    assert s["apiRequests"] == 3 and s["estimatedCostUsd"] > 0
    types = [e["type"] for e in s["events"]]
    assert types[0] == "scan_started" and types[-1] == "scan_completed"
    assert {"bookmarks_received", "classifying", "calculating_stats", "evaluating_achievements"} <= set(types)
    assert count(db, Bookmark) == FIXTURE_TOTAL
    assert db.scalar(select(func.count()).select_from(Bookmark).where(Bookmark.rules_version.is_(None))) == 0

    report = client.get("/api/dashboard").json()
    assert report["stats"]["accessible"] == FIXTURE_TOTAL and report["isDemo"] is False
    assert report["archetype"]["primary"] and report["archetype"]["provisional"] is False
    assert 0 < report["score"]["total"] <= 100
    assert len(report["recent"]) == 5


def test_rescanning_identical_data_creates_no_duplicates_or_new_badges(client, db):
    csrf = login(client)
    scan(client, csrf, "full")
    badges_before = count(db, UserAchievement)
    second = scan(client, csrf, "full")
    assert second["status"] == "completed" and second["newBookmarks"] == 0
    assert count(db, Bookmark) == FIXTURE_TOTAL
    assert count(db, UserAchievement) == badges_before
    assert not any(e["type"] == "achievement_unlocked" for e in second["events"])


def test_refresh_stops_at_already_known_bookmarks(client):
    csrf = login(client)
    scan(client, csrf)
    s = scan(client, csrf)  # mode resolves to refresh once bookmarks exist
    assert s["mode"] == "refresh" and s["stopReason"] == "caught_up" and s["pages"] == 1
    assert s["retrieved"] <= 25 and s["status"] == "completed"


def test_rate_limited_scan_is_partial_and_keeps_what_it_got(client, db):
    csrf = login(client, "ratelimit")
    s = scan(client, csrf)
    assert s["status"] == "partial" and s["coverage"] == "partial" and s["errorCode"] == "rate_limited"
    assert s["retrieved"] == 100 and count(db, Bookmark) == 100
    report = client.get("/api/dashboard").json()
    assert report["coverage"] == "partial" and report["archetype"]["provisional"] is True
    assert "Scan stopped after 100" in report["coverageNote"]


def test_partial_scan_never_revokes_earned_badges(client, db):
    csrf = login(client)
    scan(client, csrf)
    earned_before = {a["id"] for a in client.get("/api/achievements").json() if a["earned"]}
    # Simulate a later scan that sees far fewer bookmarks.
    db.query(Bookmark).filter(Bookmark.x_post_id.notin_(select(Bookmark.x_post_id).limit(5).scalar_subquery())).delete(
        synchronize_session=False
    )
    db.commit()
    scan(client, csrf, "refresh")
    after = {a["id"]: a for a in client.get("/api/achievements").json()}
    assert earned_before <= {k for k, a in after.items() if a["earned"]}


def test_empty_account(client, db):
    csrf = login(client, "empty")
    s = scan(client, csrf)
    assert s["status"] == "completed" and s["retrieved"] == 0
    report = client.get("/api/dashboard").json()
    assert report["stats"]["accessible"] == 0 and report["archetype"]["primary"] == "collector"
    assert not any(a["earned"] for a in report["achievements"])


def test_revoked_authorization_fails_cleanly(client, db):
    csrf = login(client, "revoked")
    s = scan(client, csrf)
    assert s["status"] == "failed" and s["errorCode"] == "auth_expired"
    assert client.get("/api/auth/me").json()["connection"]["status"] == "expired"
    assert client.get("/api/dashboard").status_code == 404


def test_complete_full_scan_removes_bookmarks_no_longer_on_x(client, db):
    csrf = login(client)
    scan(client, csrf)
    user_id = db.scalar(select(Bookmark.user_id).limit(1))
    db.add(
        Bookmark(
            user_id=user_id,
            x_post_id="999",
            text="deleted on X",
            author_x_id="1",
            url="u",
            links=[],
            content_hash="h",
            x_created_at=datetime.now(UTC),
        )
    )
    db.commit()
    s = scan(client, csrf, "full")
    assert s["removedBookmarks"] == 1
    assert count(db, Bookmark, x_post_id="999") == 0


def test_one_active_scan_per_user_and_cooldown(client, db, monkeypatch):
    csrf = login(client)
    s = scan(client, csrf)
    from app.config import get_settings

    monkeypatch.setenv("SCAN_COOLDOWN_SECONDS", "600")
    get_settings.cache_clear()
    r = client.post("/api/scans", json={}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 429 and r.json()["code"] == "scan_cooldown"
    # An active scan is returned instead of starting a second one.
    row = db.get(Scan, __import__("uuid").UUID(s["id"]))
    row.status = "running"
    db.commit()
    r = client.post("/api/scans", json={}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 202 and r.json()["id"] == s["id"]


def test_interrupted_scans_are_failed_on_startup(client, db):
    csrf = login(client)
    s = scan(client, csrf)
    row = db.get(Scan, __import__("uuid").UUID(s["id"]))
    row.status = "running"
    db.commit()
    from app.services.scan_service import fail_interrupted_scans

    assert fail_interrupted_scans(db) == 1
    assert client.get(f"/api/scans/{s['id']}").json()["errorCode"] == "interrupted"


def test_users_cannot_see_each_others_data(client):
    from fastapi.testclient import TestClient

    from app.main import create_app

    csrf_a = login(client)
    scan_a = scan(client, csrf_a)
    bm_a = client.get("/api/bookmarks?limit=1").json()["items"][0]["id"]

    with TestClient(create_app()) as other:
        csrf_b = login(other, "other", handle="bkmk_other")
        assert other.get(f"/api/scans/{scan_a['id']}").status_code == 404
        assert other.get(f"/api/bookmarks/{bm_a}").status_code == 404
        assert other.get("/api/dashboard").status_code == 404
        scan(other, csrf_b)
        ids_b = {b["id"] for b in other.get("/api/bookmarks?limit=100").json()["items"]}
        assert bm_a not in ids_b
        assert other.get("/api/dashboard").json()["handle"] == "bkmk_other"
    assert client.get("/api/dashboard").json()["handle"] == "bkmk_fixture"
