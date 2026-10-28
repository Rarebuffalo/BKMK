# One image: the API serves the built SPA from the same origin.

# ── frontend build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Public, non-secret build-time config only (Vite inlines VITE_* into the bundle).
ARG VITE_PUBLIC_URL=""
ENV VITE_PUBLIC_URL=${VITE_PUBLIC_URL}
RUN npm run build

# ── backend runtime ────────────────────────────────────────────────────────
FROM python:3.13-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1
COPY --from=ghcr.io/astral-sh/uv:0.8.4 /uv /usr/local/bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY --from=web /web/dist /app/static
RUN useradd --system --uid 10001 bkmk && chown -R bkmk /app
USER bkmk
ENV PATH="/opt/venv/bin:$PATH" FRONTEND_DIST=/app/static PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"
# Migrations run on boot; they're idempotent and transactional.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
