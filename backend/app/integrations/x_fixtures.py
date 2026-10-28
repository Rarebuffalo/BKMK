"""Fixture X API for tests and local E2E (X_API_MODE=fixture). Never used in production.

Responses follow the documented v2 shapes. The scenario is carried in the
fixture token (``fixture-token-<scenario>``) so one process can serve
several behaviours: normal | empty | ratelimit | revoked | servererror | other.
All posts are synthetic and authored by fictional accounts.
"""

import json
import random
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs

import httpx

FIXTURE_USER = {"id": "1000000000000000001", "username": "bkmk_fixture", "name": "BKMK Fixture"}
# A second account, used to test that users never see each other's data.
OTHER_USER = {"id": "1000000000000000002", "username": "bkmk_other", "name": "Other Fixture"}
FIXTURE_TOTAL = 230

_AUTHORS = [
    {"id": f"20000000000000000{i:02d}", "username": u, "name": n}
    for i, (u, n) in enumerate(
        [
            ("tensor_tess", "Tess Okafor"),
            ("postgres_priya", "Priya Raman"),
            ("cli_crafter", "Ines Duarte"),
            ("zero_to_mrr", "Mira Holt"),
            ("copy_corner", "Noor Haddad"),
            ("kerning_kat", "Kat Moreau"),
            ("cve_cass", "Cass Novak"),
            ("arxiv_anya", "Anya Volkova"),
            ("deepwork_dom", "Dom Fischer"),
            ("just_vibes_jo", "Jo Park"),
        ]
    )
]

_TEMPLATES = [
    ("Evals for our support agent: the model was fine, the prompt was the bug. 🧵", None, True),
    (
        "Minimal transformer implementation to understand attention.",
        "https://github.com/example-ml/tiny-transformer",
        False,
    ),
    ("Postgres tip: partial indexes cut our query latency 10x.", None, False),
    (
        "Architecture doc template we use before any backend service.",
        "https://blog.example-eng.dev/architecture",
        False,
    ),
    ("This open-source CLI replaced four tools in my terminal.", "https://github.com/example-cli/swiss", False),
    ("We hit $10k MRR bootstrapped. Every pricing experiment, in order. 1/", None, True),
    (
        "Launch day playbook: 0 to 4,000 signups with no ad spend.",
        "https://example-growth.substack.com/p/launch",
        False,
    ),
    ("Typography pairing guide for interfaces.", "https://example-type.design/pairings", False),
    ("OAuth mistakes I see in almost every security review. Thread.", None, True),
    ("New paper on how sleep consolidates memory.", "https://arxiv.org/abs/2609.01234", False),
    ("Deep work routine that finally stuck.", None, False),
    ("Talk recording: shipping diffusion models to production.", "https://youtube.com/watch?v=fixture", False),
    ("Saving this for later.", None, False),
]


def fixture_posts(total: int = FIXTURE_TOTAL) -> list[dict]:
    rng = random.Random(42)  # noqa: S311 - deterministic fixtures, not security
    base = datetime(2026, 10, 20, tzinfo=UTC)
    posts = []
    for i in range(total):
        text, link, threadish = _TEMPLATES[rng.randrange(len(_TEMPLATES))]
        author = _AUTHORS[rng.randrange(len(_AUTHORS))]
        pid = str(1_800_000_000_000_000_000 + total - i)
        post: dict = {
            "id": pid,
            "text": f"{text} #{i}",
            "author_id": author["id"],
            "created_at": (base - timedelta(hours=i * 7)).isoformat().replace("+00:00", "Z"),
            "conversation_id": pid if threadish else str(int(pid) - 1),
        }
        if link:
            post["entities"] = {"urls": [{"url": "https://t.co/x", "expanded_url": f"{link}?n={i}"}]}
        posts.append(post)
    return posts


def _scenario(request: httpx.Request) -> str:
    auth = request.headers.get("authorization", "")
    return auth.removeprefix("Bearer fixture-token-") if auth.startswith("Bearer fixture-token-") else "invalid"


def _json(status: int, body: dict, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status, content=json.dumps(body), headers={"content-type": "application/json", **(headers or {})}
    )


def handler(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/2/oauth2/token":
        form = parse_qs(request.content.decode())
        code = (form.get("code") or form.get("refresh_token") or [""])[0]
        if not code.startswith("fixture-"):
            return _json(400, {"error": "invalid_grant"})
        scenario = code.removeprefix("fixture-code-").removeprefix("fixture-refresh-")
        return _json(
            200,
            {
                "token_type": "bearer",
                "expires_in": 7200,
                "access_token": f"fixture-token-{scenario}",
                "refresh_token": f"fixture-refresh-{scenario}",
                "scope": "tweet.read users.read bookmark.read offline.access",
            },
        )
    if path == "/2/oauth2/revoke":
        return _json(200, {"revoked": True})

    scenario = _scenario(request)
    if scenario in {"invalid", "revoked"}:
        return _json(401, {"title": "Unauthorized", "status": 401})
    user = OTHER_USER if scenario == "other" else FIXTURE_USER
    if path == "/2/users/me":
        return _json(200, {"data": user})
    if path.startswith("/2/users/") and path.endswith("/bookmarks"):
        if path != f"/2/users/{user['id']}/bookmarks":
            # X only serves the authenticated user's own bookmarks.
            return _json(403, {"title": "Forbidden", "status": 403})
        if scenario == "servererror":
            return _json(503, {"title": "Service Unavailable", "status": 503})
        posts = [] if scenario == "empty" else fixture_posts()
        size = int(request.url.params.get("max_results", "100"))
        start = int(request.url.params.get("pagination_token", "0") or 0)
        if scenario == "ratelimit" and start > 0:
            return _json(
                429, {"title": "Too Many Requests"}, {"x-rate-limit-reset": "9999999999", "x-rate-limit-remaining": "0"}
            )
        page = posts[start : start + size]
        body: dict = {"meta": {"result_count": len(page)}}
        if page:
            body["data"] = page
            if "author_id" in request.url.params.get("expansions", ""):
                ids = {p["author_id"] for p in page}
                body["includes"] = {"users": [a for a in _AUTHORS if a["id"] in ids]}
        if start + size < len(posts):
            body["meta"]["next_token"] = str(start + size)
        return _json(200, body, {"x-rate-limit-remaining": "179", "x-rate-limit-limit": "180"})
    return _json(404, {"title": "Not Found", "status": 404})


def transport() -> httpx.MockTransport:
    return httpx.MockTransport(handler)
