import json
import time

import httpx
import pytest

from app.config import Settings
from app.integrations.x_client import UsageCounter, XApiError, XClient, parse_post
from app.integrations.x_fixtures import FIXTURE_TOTAL, FIXTURE_USER, transport

S = Settings(_env_file=None, x_client_id="cid", x_client_secret="csecret", x_max_rate_limit_wait_seconds=5)


def client_with(handler, sleeps: list | None = None) -> XClient:
    return XClient(S, transport=httpx.MockTransport(handler), sleep=(sleeps.append if sleeps is not None else lambda _s: None))


def test_parse_post_prefers_note_tweet_and_drops_x_links():
    p = parse_post(
        {
            "id": "1",
            "text": "short",
            "note_tweet": {"text": "the long version"},
            "author_id": "9",
            "created_at": "2026-01-02T03:04:05.000Z",
            "entities": {
                "urls": [
                    {"expanded_url": "https://github.com/a/b"},
                    {"expanded_url": "https://x.com/someone/status/2/photo/1"},
                    {"expanded_url": "https://github.com/a/b"},
                ]
            },
        }
    )
    assert p.text == "the long version" and p.is_long_form
    assert p.links == ["https://github.com/a/b"]
    assert p.created_at.year == 2026


@pytest.mark.parametrize("bad", [None, [], {"id": 1, "text": "x"}, {"id": "1"}])
def test_parse_post_rejects_invalid_shapes(bad):
    with pytest.raises(XApiError) as e:
        parse_post(bad)
    assert e.value.code == "invalid_response"


def test_pagination_through_fixture_collects_every_post_once():
    c = XClient(S, transport=transport(), sleep=lambda _s: None)
    usage = UsageCounter()
    token, ids, cursor = "fixture-token-normal", [], None
    while True:
        page = c.get_bookmarks_page(token, FIXTURE_USER["id"], max_results=100, pagination_token=cursor, expand_authors=True, usage=usage)
        ids += [p.id for p in page.posts]
        cursor = page.next_token
        if not cursor:
            break
    assert len(ids) == len(set(ids)) == FIXTURE_TOTAL
    assert usage.requests == 3 and usage.posts == FIXTURE_TOTAL and usage.users == 10


def test_authorize_url_uses_pkce_s256_and_registered_redirect():
    url = httpx.URL(XClient(S).authorize_url("st", "ch"))
    assert url.host == "x.com" and url.path == "/i/oauth2/authorize"
    q = url.params
    assert q["code_challenge_method"] == "S256" and q["state"] == "st" and q["code_challenge"] == "ch"
    assert set(q["scope"].split()) == {"tweet.read", "users.read", "bookmark.read", "offline.access"}


def test_token_exchange_sends_basic_auth_and_verifier():
    seen = {}

    def handler(req: httpx.Request):
        seen["auth"] = req.headers["authorization"]
        seen["body"] = req.content.decode()
        return httpx.Response(200, json={"access_token": "a", "refresh_token": "r", "expires_in": 7200, "scope": "bookmark.read"})

    t = client_with(handler).exchange_code("the-code", "the-verifier")
    assert seen["auth"].startswith("Basic ") and "code_verifier=the-verifier" in seen["body"]
    assert t.refresh_token == "r" and t.expires_at is not None


def test_retries_server_errors_with_backoff_then_succeeds():
    calls, sleeps = [], []

    def handler(req):
        calls.append(1)
        return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json={"data": {"id": "1", "username": "u", "name": "U"}})

    assert client_with(handler, sleeps).get_me("t").id == "1"
    assert len(calls) == 3 and len(sleeps) == 2 and all(s <= 8 for s in sleeps)


def test_gives_up_after_bounded_server_errors():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(502)

    with pytest.raises(XApiError) as e:
        client_with(handler).get_me("t")
    assert e.value.code == "api_error" and len(calls) == 3


def test_short_rate_limit_waits_for_reset_once():
    calls, sleeps = [], []
    reset = str(int(time.time()) + 2)

    def handler(req):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"x-rate-limit-reset": reset})
        return httpx.Response(200, json={"data": {"id": "1", "username": "u"}})

    client_with(handler, sleeps).get_me("t")
    assert len(calls) == 2 and 0 < sleeps[0] <= 3.5


def test_long_rate_limit_fails_fast_with_retry_after():
    def handler(req):
        return httpx.Response(429, headers={"x-rate-limit-reset": str(int(time.time()) + 900)})

    with pytest.raises(XApiError) as e:
        client_with(handler).get_me("t")
    assert e.value.code == "rate_limited" and e.value.retry_after > 800


@pytest.mark.parametrize(("status", "code"), [(401, "auth_expired"), (403, "missing_permissions"), (404, "api_error")])
def test_error_normalisation_does_not_retry_permanent_errors(status, code):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(status, json={"title": "x"})

    with pytest.raises(XApiError) as e:
        client_with(handler).get_me("t")
    assert e.value.code == code and len(calls) == 1


def test_network_errors_are_retried_then_normalised():
    def handler(req):
        raise httpx.ConnectError("boom")

    with pytest.raises(XApiError) as e:
        client_with(handler).get_me("t")
    assert e.value.code == "network"


def test_non_json_response_is_invalid():
    with pytest.raises(XApiError) as e:
        client_with(lambda req: httpx.Response(200, content=b"<html>")).get_me("t")
    assert e.value.code == "invalid_response"


def test_bookmarks_rejects_non_numeric_user_id_and_bad_data_shape():
    c = client_with(lambda req: httpx.Response(200, content=json.dumps({"data": {"not": "a list"}})))
    with pytest.raises(XApiError):
        c.get_bookmarks_page("t", "../me", max_results=10, pagination_token=None, expand_authors=False)
    with pytest.raises(XApiError) as e:
        c.get_bookmarks_page("t", "123", max_results=10, pagination_token=None, expand_authors=False)
    assert e.value.code == "invalid_response"
