from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_serves_spa_with_fallback_and_blocks_traversal(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("<title>BKMK.exe</title>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    settings = Settings(frontend_dist=str(tmp_path))
    with TestClient(create_app(settings)) as c:
        assert "BKMK.exe" in c.get("/app/library").text  # client-side route
        assert c.head("/").status_code == 200
        js = c.get("/assets/app.js")
        assert js.text == "console.log(1)" and "immutable" in js.headers["cache-control"]
        assert "nope" not in c.get("/../secret.txt").text
        assert "nope" not in c.get("/%2e%2e/secret.txt").text
        assert c.get("/api/does-not-exist").status_code == 404  # API 404s never fall back to HTML
