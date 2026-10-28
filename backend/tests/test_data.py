from sqlalchemy import func, select

from app.models import Bookmark, OAuthAccount, Scan, User, UserAchievement

from .conftest import login, scan


def scanned(client):
    csrf = login(client)
    scan(client, csrf)
    return csrf


def test_bookmark_pagination_is_stable_and_complete(client):
    scanned(client)
    seen, offset = [], 0
    while True:
        page = client.get("/api/bookmarks", params={"limit": 40, "offset": offset}).json()
        seen += [b["id"] for b in page["items"]]
        offset += 40
        if offset >= page["total"]:
            break
    assert len(seen) == len(set(seen)) == page["total"]
    dates = [b["createdAt"] for b in client.get("/api/bookmarks", params={"limit": 100}).json()["items"]]
    assert dates == sorted(dates, reverse=True)


def test_filters_search_and_facets(client):
    scanned(client)
    repos = client.get("/api/bookmarks", params={"type": "repo", "limit": 100}).json()
    assert repos["total"] > 0 and all(b["contentType"] == "repo" for b in repos["items"])
    topic = client.get("/api/bookmarks", params={"topic": "research"}).json()
    assert all(b["topic"] == "research" for b in topic["items"])
    q = client.get("/api/bookmarks", params={"q": "postgres partial"}).json()
    assert q["total"] > 0 and all("partial" in b["text"].lower() for b in q["items"])
    author = client.get("/api/bookmarks", params={"author": "kerning_kat"}).json()
    assert all(b["author"]["handle"] == "kerning_kat" for b in author["items"])
    assert {"types", "topics", "authors"} <= set(repos["facets"])
    old = client.get("/api/bookmarks", params={"sort": "oldest", "limit": 3}).json()["items"]
    assert old[0]["createdAt"] <= old[-1]["createdAt"]


def test_search_treats_wildcards_literally(client):
    scanned(client)
    assert client.get("/api/bookmarks", params={"q": "%"}).json()["total"] == 0
    assert client.get("/api/bookmarks", params={"q": "' OR 1=1 --"}).json()["total"] == 0


def test_invalid_query_params_are_rejected(client):
    scanned(client)
    assert client.get("/api/bookmarks", params={"limit": 1000}).status_code == 422
    assert client.get("/api/bookmarks", params={"sort": "drop table"}).status_code == 422


def test_topics_and_topic_bookmarks(client):
    scanned(client)
    topics = client.get("/api/topics").json()
    assert topics and all(t["count"] > 0 for t in topics)
    first = topics[0]["id"]
    page = client.get(f"/api/topics/{first}/bookmarks").json()
    assert page["total"] == topics[0]["count"]
    assert client.get("/api/topics/nope/bookmarks").status_code == 404


def test_post_text_is_returned_as_data_not_html(client, db):
    scanned(client)
    b = db.scalar(select(Bookmark).limit(1))
    b.text = "<script>alert(1)</script>"
    db.commit()
    body = client.get(f"/api/bookmarks/{b.id}")
    assert body.headers["content-type"].startswith("application/json")
    assert body.json()["text"] == "<script>alert(1)</script>"


def test_export_contains_only_the_users_data_and_no_tokens(client):
    scanned(client)
    r = client.get("/api/export")
    assert r.headers["content-disposition"].startswith("attachment;")
    payload = r.json()
    assert payload["account"]["handle"] == "bkmk_fixture" and len(payload["bookmarks"]) == 230
    text = r.text.lower()
    assert "fixture-token" not in text and "access_token" not in text and "refresh" not in text


def test_disconnect_revokes_and_deletes_everything(client, db):
    csrf = scanned(client)
    r = client.post("/api/auth/disconnect", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200 and r.json() == {"deleted": True, "revoked": True}
    for model in (User, OAuthAccount, Bookmark, Scan, UserAchievement):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    assert client.get("/api/auth/me").json()["authenticated"] is False


def test_account_delete_requires_csrf_and_removes_data(client, db):
    csrf = scanned(client)
    assert client.delete("/api/account").status_code == 403
    assert client.delete("/api/account", headers={"X-CSRF-Token": csrf}).json()["deleted"] is True
    assert db.scalar(select(func.count()).select_from(Bookmark)) == 0
    assert client.get("/api/dashboard").status_code == 401


def test_dashboard_before_first_scan(client):
    login(client)
    r = client.get("/api/dashboard")
    assert r.status_code == 404 and r.json()["code"] == "no_scan"
