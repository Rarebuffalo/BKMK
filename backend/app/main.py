import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from .api import auth, data, scans
from .config import Settings, get_settings
from .database import get_db, get_sessionmaker
from .integrations import make_x_client
from .logging_setup import configure_logging
from .services.retention import run_maintenance
from .services.scan_service import fail_interrupted_scans

log = logging.getLogger("bkmk")


class SecurityHeaders(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings):
        super().__init__(app)
        self.settings = settings

    async def dispatch(self, request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > self.settings.max_request_bytes:
            return JSONResponse({"code": "payload_too_large", "message": "Request too large."}, status_code=413)
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if self.settings.environment == "production":
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith("/api/"):
            h.setdefault("Cache-Control", "no-store")
        return response


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    def maintenance() -> None:
        db = get_sessionmaker()()
        try:
            run_maintenance(db, settings, lambda: make_x_client(settings))
        except Exception:  # noqa: BLE001 - housekeeping must never take the API down
            db.rollback()
            log.exception("maintenance failed")
        finally:
            db.close()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        settings.require_secrets()
        db = get_sessionmaker()()
        try:
            n = fail_interrupted_scans(db)
            db.commit()
            if n:
                log.warning("marked interrupted scans failed", extra={"count": n})
        except Exception:  # noqa: BLE001 - the app should still boot if the DB is briefly down
            log.exception("startup maintenance failed")
        finally:
            db.close()
        stop = threading.Event()
        if settings.environment != "test":
            # Free hosts restart often, so this also runs on every boot; the loop
            # covers long-lived instances. A plain thread: no scheduler service needed.
            def loop() -> None:
                while True:
                    maintenance()
                    if stop.wait(settings.maintenance_interval_hours * 3600):
                        return

            threading.Thread(target=loop, name="bkmk-maintenance", daemon=True).start()
        log.info("bkmk started", extra={"environment": settings.environment, "x_api_mode": settings.x_api_mode})
        yield
        stop.set()

    docs = settings.environment != "production"
    app = FastAPI(
        title="BKMK.exe API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        openapi_url="/api/openapi.json" if docs else None,
        redoc_url=None,
    )
    app.add_middleware(SecurityHeaders, settings=settings)
    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Content-Type", "X-CSRF-Token"],
        )

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
        return JSONResponse(detail, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        fields = [".".join(str(p) for p in e.get("loc", [])[1:]) for e in exc.errors()]
        return JSONResponse(
            {"code": "invalid_request", "message": "Invalid request.", "fields": fields}, status_code=422
        )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error", extra={"path": request.url.path})
        return JSONResponse({"code": "internal_error", "message": "Something went wrong."}, status_code=500)

    @app.get("/api/health/live", tags=["health"])
    def liveness() -> dict:
        # For the host's frequent health probes. Deliberately skips the database so the
        # probes don't keep a scale-to-zero Postgres (Neon) awake around the clock.
        return {"status": "ok"}

    @app.get("/api/health", tags=["health"])
    def health(db: Session = Depends(get_db)) -> JSONResponse:
        try:
            db.execute(text("SELECT 1"))
            database = "ok"
        except Exception:  # noqa: BLE001
            database = "unavailable"
        ok = database == "ok"
        return JSONResponse(
            {
                "status": "ok" if ok else "degraded",
                "database": database,
                "xApiMode": settings.x_api_mode,
                "xConfigured": settings.x_configured,
            },
            status_code=200 if ok else 503,
        )

    app.include_router(auth.router)
    app.include_router(scans.router)
    app.include_router(data.router)

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "DELETE", "PUT", "PATCH"], include_in_schema=False)
    def api_not_found(rest: str) -> JSONResponse:
        return JSONResponse({"code": "not_found", "message": "Not found."}, status_code=404)

    # Same-origin deployment: serve the built SPA, falling back to index.html for client routes.
    if settings.frontend_dist:
        dist = Path(settings.frontend_dist).resolve()
        index = dist / "index.html"

        @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
        def spa(path: str):
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and dist in candidate.parents:
                cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
                return FileResponse(candidate, headers={"Cache-Control": cache})
            return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
