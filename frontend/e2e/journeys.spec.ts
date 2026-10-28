import { expect, test, type Page } from '@playwright/test'

// ── helpers ────────────────────────────────────────────────────────────────

async function runDemoScan(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: /try the demo profile/i }).click()
  await page.getByRole('button', { name: /yes, that’s me/i }).click()
  await page.getByRole('button', { name: /connect x & scan/i }).click()
  await expect(page).toHaveURL(/\/scan$/)
  await expect(page.getByText('Report ready.')).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 10_000 })
  await page.getByRole('button', { name: /skip/i }).click().catch(() => {})
}

async function liveSignIn(page: Page, consent: RegExp, handle = 'bkmk_fixture') {
  await page.goto('/')
  await expect(page.getByText('BUILD 001', { exact: true })).toBeVisible() // live sign-in is available
  await page.locator('#hero-handle').fill(handle)
  await page.locator('#hero-handle').press('Enter')
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /that’s me/i }).click()
  await page.getByRole('button', { name: /connect x & scan/i }).click()
  await expect(page.getByRole('heading', { name: 'FIXTURE X AUTHORIZATION' })).toBeVisible()
  await page.getByRole('link', { name: consent }).click()
}

// ── demo journeys ──────────────────────────────────────────────────────────

test('1–2 landing → demo scan → Bookmark DNA reveal', async ({ page }) => {
  await runDemoScan(page)
  await expect(page.getByText('DEMO', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/the builder/i)
  await expect(page.getByText(/bookmarks decoded/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /share my dna/i })).toBeVisible()
})

test('3 reveal → share card → PNG download', async ({ page }) => {
  await runDemoScan(page)
  await page.getByRole('button', { name: /share my dna/i }).click()
  await expect(page).toHaveURL(/\/share/)
  await page.getByRole('radio', { name: /collector id/i }).click()
  await expect(page).toHaveURL(/variant=identity/)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /download png/i }).click()])
  expect(download.suggestedFilename()).toBe('bkmk-dna-demo-identity.png')
  const path = await download.path()
  const { statSync, readFileSync } = await import('node:fs')
  expect(statSync(path!).size).toBeGreaterThan(20_000)
  expect(readFileSync(path!).subarray(1, 4).toString()).toBe('PNG')
})

test('4–7 dashboard → topics, library search, achievements', async ({ page }) => {
  await runDemoScan(page)
  await page.getByRole('button', { name: /^dashboard$/i }).click()
  await expect(page.getByText('ARCHIVE OVERVIEW')).toBeVisible()

  await page.getByRole('link', { name: /explore topics/i }).click()
  await expect(page.getByRole('heading', { name: /topic clusters/i })).toBeVisible()
  await page.getByRole('link', { name: /software engineering/i }).first().click()
  await expect(page.getByRole('heading', { name: 'Software Engineering' })).toBeVisible()

  await page.getByRole('link', { name: /all bookmarks/i }).click()
  await page.getByLabel('Search bookmarks').fill('postgres')
  await expect(page).toHaveURL(/q=postgres/)
  await expect(page.locator('mark').first()).toHaveText(/postgres/i)
  await page.getByLabel('Search bookmarks').fill('zzzz-no-match')
  await expect(page.getByText(/nothing matches/i)).toBeVisible()
  await page.getByRole('button', { name: /clear search & filters/i }).click()

  await page.getByRole('link', { name: /achievements/i }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/of 8 unlocked/)
  await page.getByRole('heading', { name: 'First Scan' }).click()
  await expect(page.getByRole('dialog')).toContainText(/complete a successful scan/i)
})

test('8–9 settings → export and deletion confirmation', async ({ page }) => {
  await runDemoScan(page)
  await page.goto('/app/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /export json/i }).click()])
  expect(download.suggestedFilename()).toBe('bkmk-export-demo.json')

  await page.getByRole('button', { name: /^delete$/i }).click()
  await expect(page.getByRole('dialog')).toContainText(/can’t be undone/i)
  await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click()
  await expect(page).toHaveURL(/\/app\/settings/)
  await page.getByRole('button', { name: /^delete$/i }).click()
  await page.getByRole('dialog').getByRole('button', { name: /delete everything/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/$/) // nothing left to show
})

test('demo error state recovers on retry', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /try the demo profile/i }).click()
  await page.getByRole('button', { name: /demo lab/i }).click()
  await page.getByLabel(/api error/i).check()
  await page.getByRole('button', { name: /^done$/i }).click()
  await page.getByRole('button', { name: /yes, that’s me/i }).click()
  await page.getByRole('button', { name: /connect x & scan/i }).click()
  await expect(page.getByText(/the scan hit a problem/i)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /retry scan/i }).click()
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 20_000 })
})

// ── live journeys against the fixture X API ─────────────────────────────────

test('10 OAuth cancellation on X is handled', async ({ page }) => {
  await liveSignIn(page, /^cancel$/i)
  await expect(page).toHaveURL(/\/connect\?auth=cancelled/)
  await expect(page.getByText(/nothing was shared/i)).toBeVisible()
})

test('OAuth state tampering is rejected', async ({ page }) => {
  await page.goto('/api/auth/x/callback?state=forged&code=fixture-code-normal')
  await expect(page).toHaveURL(/auth=failed&reason=state_mismatch/)
  await expect(page.getByText(/sign-in didn’t complete/i)).toBeVisible()
})

test('live sign-in → real scan → reveal → server-backed library → disconnect', async ({ page }) => {
  await liveSignIn(page, /^approve$/i)
  await expect(page).toHaveURL(/\/scan/)
  await expect(page.getByText('Report ready.')).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/reveal$/)
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible()
  await expect(page.getByText('230', { exact: true })).toBeVisible()

  const bookmarksRequest = page.waitForRequest((r) => r.url().includes('/api/bookmarks') && r.url().includes('q=postgres'))
  await page.goto('/app/library')
  await page.getByLabel('Search bookmarks').fill('postgres')
  await bookmarksRequest
  await expect(page.getByText(/^\d+ bookmarks$/)).toBeVisible()

  await page.goto('/app/settings')
  await expect(page.getByText(/connected via x oauth/i)).toBeVisible()
  await page.getByRole('button', { name: /^disconnect$/i }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^disconnect$/i }).click()
  await expect(page).toHaveURL(/\/$/)
  expect((await page.request.get('/api/dashboard')).status()).toBe(401)
})

test('live rate-limited scan is partial and labelled provisional', async ({ page }) => {
  await liveSignIn(page, /rate-limited/i)
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 25_000 })
  await expect(page.getByText('PROVISIONAL')).toBeVisible()
  await expect(page.getByText(/partial scan/i)).toBeVisible()
  await expect(page.getByText(/scan stopped after 100 bookmarks/i)).toBeVisible()
})

test('signing in as a different account than typed is surfaced', async ({ page }) => {
  await liveSignIn(page, /^approve$/i, 'someone_else')
  await expect(page).toHaveURL(/\/connect\?auth=success&requested=someone_else/)
  await expect(page.getByRole('heading', { name: /you signed in as @bkmk_fixture/i })).toBeVisible()
  await page.getByRole('button', { name: /continue as @bkmk_fixture/i }).click()
  await expect(page).toHaveURL(/\/scan|\/reveal/)
})

test('mobile: demo journey and bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await runDemoScan(page)
  await page.getByRole('button', { name: /^dashboard$/i }).click()
  const tabs = page.getByRole('navigation', { name: 'Dashboard' }).last()
  await tabs.getByRole('link', { name: /library/i }).click()
  await expect(page).toHaveURL(/\/app\/library/)
  // No horizontal page scroll anywhere in the dashboard at phone width.
  for (const path of ['/app', '/app/topics', '/app/topics/engineering', '/app/library', '/app/achievements', '/app/settings', '/reveal', '/share']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(375)
  }
})
