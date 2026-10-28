# API-only image (frontend on Vercel). Build context: backend/.
# The root Dockerfile is the single-origin alternative that also serves the SPA.
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1
COPY --from=ghcr.io/astral-sh/uv:0.8.4 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY app/ ./app/
RUN useradd --system --uid 10001 bkmk && chown -R bkmk /app
USER bkmk
# Render supplies PORT (10000 by default); 8000 is the local fallback.
ENV PATH="/opt/venv/bin:$PATH" PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health/live', timeout=4)"
# Render free has no pre-deploy step, so migrations run on boot. They're
# transactional and idempotent, and free services run a single instance.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
