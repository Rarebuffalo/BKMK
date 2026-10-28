import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// E2E runs its own backend in fixture mode (no X credentials, no network to X)
// against an isolated database, plus a Vite dev server proxying /api to it.
// Ports differ from the normal dev servers so both can run at once.
const API_PORT = 8001
const WEB_PORT = 5174
const chromium = process.env.PW_CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: chromium ? { executablePath: chromium } : undefined,
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } }],
  webServer: [
    {
      // Fresh schema on every run: downgrade + upgrade also exercises the migrations.
      command: `sh -c "cd ../backend && .venv/bin/alembic downgrade base && .venv/bin/alembic upgrade head && .venv/bin/uvicorn app.main:app --port ${API_PORT}"`,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ENVIRONMENT: 'test',
        X_API_MODE: 'fixture',
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg://bkmk@localhost:54329/bkmk_e2e',
        SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-000000',
        TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
        FRONTEND_URL: `http://localhost:${WEB_PORT}`,
        SCAN_COOLDOWN_SECONDS: '0',
        AUTH_RATE_LIMIT_PER_MINUTE: '1000',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { BKMK_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
})
