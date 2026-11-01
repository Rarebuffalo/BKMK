import { expect, test, type Page } from '@playwright/test'
import { syntheticRecords } from '../src/import/mockBridge'

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

// ── import journeys (free, local, no X API) ────────────────────────────────

const LIKES = [
  ['1650000000000000001', 'Building LLM agents: an evaluation harness for RAG pipelines https://github.com/example/evals'],
  ['1650000000000000002', 'Postgres indexing deep dive — why your btree is slow https://t.co/abc'],
  ['1650000000000000003', 'Figma design system tokens, typography and color scales'],
  ['1650000000000000004', 'Startup fundraising: what a seed round actually looks like'],
]
const likeJs = `window.YTD.like.part0 = ${JSON.stringify(LIKES.map(([id, text]) => ({ like: { tweetId: id, fullText: text, expandedUrl: `https://twitter.com/i/web/status/${id}` } })))}`

test('import archive likes → local analysis → reveal → library, with no X API calls', async ({ page }) => {
  const apiCalls: string[] = []
  page.on('request', (r) => {
    const url = r.url()
    if (url.includes('/api/scans') || url.includes('/api/auth/x') || url.includes('api.x.com')) apiCalls.push(url)
  })
  await page.goto('/import?via=files')
  await expect(page.getByRole('heading', { name: /analyse your saves for free/i })).toBeVisible()
  await page.locator('#import-files').setInputFiles([
    { name: 'like.js', mimeType: 'text/javascript', buffer: Buffer.from(likeJs) },
    { name: 'list.txt', mimeType: 'text/plain', buffer: Buffer.from(`https://x.com/ada/status/${LIKES[0][0]}\nhttps://example.com/not-a-post`) },
  ])
  await page.getByRole('button', { name: /read 2 files/i }).click()
  await expect(page.getByText(/found 4/i)).toBeVisible()
  await expect(page.getByText(/1 duplicates merged · 1 non-post entries skipped/)).toBeVisible()
  await page.locator('#import-handle').fill('ada_builds')
  await page.getByRole('button', { name: /analyse 4 posts/i }).click()
  await expect(page).toHaveURL(/\/scan$/)
  await expect(page.getByText('IMPORTED').first()).toBeVisible()
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 20_000 })
  await page.getByRole('button', { name: /skip/i }).click().catch(() => {})
  await expect(page.getByText(/import analysed/i).first()).toBeVisible()

  await page.goto('/app/library')
  await page.getByLabel('Search bookmarks').pressSequentially('postgres', { delay: 30 })
  await expect(page.getByText(/btree is slow/)).toBeVisible()
  await page.goto('/app/settings')
  await expect(page.getByText(/nothing was uploaded, and no x api call was made/i)).toBeVisible()
  expect(apiCalls).toEqual([])
})

/** x.com-shaped clipboard HTML for a screenful of bookmarks (synthetic content). */
const pastedScreen = (posts: [string, string, string][]) =>
  posts
    .map(
      ([id, handle, text]) => `<article data-testid="tweet"><div data-testid="User-Name"><a href="/${handle}">${handle} name</a><a href="/${handle}">@${handle}</a>` +
        `<a href="https://x.com/${handle}/status/${id}"><time datetime="2026-09-01T10:00:00.000Z">Sep 1</time></a></div><div data-testid="tweetText" lang="en">${text}</div></article>`,
    )
    .join('')

async function paste(page: Page, html: string) {
  await page.locator('#paste-target').evaluate((el, h) => {
    const dt = new DataTransfer()
    dt.setData('text/html', h)
    dt.setData('text/plain', 'copied')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, html)
}

test('copy from X → paste screens → instant reveal, with no X or API calls', async ({ page }) => {
  const calls: string[] = []
  page.on('request', (r) => {
    if (/\/api\/(scans|auth\/x)|x\.com|twitter\.com/.test(r.url())) calls.push(r.url())
  })
  await page.goto('/import')
  await expect(page.getByRole('link', { name: /x\.com\/i\/bookmarks/i })).toHaveAttribute('href', 'https://x.com/i/bookmarks')
  await paste(page, pastedScreen([
    ['1850000000000000001', 'ada', 'Evaluating LLM agents with RAG benchmarks'],
    ['1850000000000000002', 'grace', 'Postgres query planner internals and indexing'],
  ]))
  await expect(page.getByText(/\+2 new/)).toBeVisible()
  await paste(page, pastedScreen([
    ['1850000000000000002', 'grace', 'Postgres query planner internals and indexing'],
    ['1850000000000000003', 'linus', 'Figma design tokens and typography scales'],
  ]))
  await expect(page.getByText(/\+1 new · 1 already captured/)).toBeVisible()
  await expect(page.getByText(/bookmarks captured/)).toContainText('3')
  await paste(page, '<p>not a post</p>')
  await expect(page.getByText(/no x posts in that paste/i)).toBeVisible()

  await page.locator('#paste-handle').fill('ada_builds')
  await page.getByRole('button', { name: /analyse 3 bookmarks/i }).click()
  await expect(page.getByText('IMPORTED').first()).toBeVisible()
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 20_000 })
  await page.goto('/app/library')
  await expect(page.getByText(/query planner internals/)).toBeVisible()
  await expect(page.getByRole('button', { name: '@grace' })).toBeVisible()
  expect(calls).toEqual([])
})

test('with live sync off, Connect with X says import isn’t enabled and the demo still works', async ({ page }) => {
  const xCalls: string[] = []
  page.on('request', (r) => {
    if (/\/\/([a-z]+\.)?(x|twitter)\.com\//.test(r.url()) || r.url().includes('/api/auth/x')) xCalls.push(r.url())
  })
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { authenticated: false, xConfigured: false, liveSyncEnabled: false, apiMode: 'live', dataRetentionDays: 90, user: null, connection: null, csrfToken: null } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /x bookmark import isn’t enabled yet/i })).toBeVisible()
  await expect(page.getByText(/asking x for guidance and permission/i)).toBeVisible()
  await expect(page.locator('#hero-handle')).toHaveCount(0)
  await page.getByRole('link', { name: /try the demo/i }).first().click()
  await expect(page).toHaveURL(/\/connect$/)
  await expect(page.getByText(/demo identity/i)).toBeVisible()
  expect(xCalls).toEqual([])
})

// ── direct import (dev harness, synthetic source; nothing contacts X) ─────

test('direct import: mock source → progress → analysis → reveal → searchable library', async ({ page }) => {
  const xCalls: string[] = []
  page.on('request', (r) => {
    if (/\/\/([a-z]+\.)?(x|twitter)\.com\//.test(r.url()) || r.url().includes('/api/auth/x') || r.url().includes('/api/scans')) xCalls.push(r.url())
  })
  const first = syntheticRecords(40)[0]
  await page.goto('/dev/import-harness')
  await expect(page.getByText(/nothing here contacts x/i)).toBeVisible()
  await page.getByLabel('Scenario').selectOption('small')
  await page.getByLabel('Batch size').selectOption('10')
  await page.getByRole('button', { name: /start import/i }).click()
  await expect(page.getByRole('progressbar', { name: 'Import progress' })).toBeVisible()
  await expect(page.getByText(/complete import: the source sent everything/i)).toBeVisible()
  await expect(page.getByText('4 batches')).toBeVisible()
  await page.getByRole('button', { name: /analyse 40 bookmarks/i }).click()
  await expect(page).toHaveURL(/\/scan$/)
  await expect(page.getByText('IMPORTED').first()).toBeVisible()
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 20_000 })
  await page.getByRole('button', { name: /skip/i }).click().catch(() => {})
  await page.goto('/app/library')
  const term = first.text!.split(/\s+/).slice(0, 3).join(' ')
  await page.getByLabel('Search bookmarks').pressSequentially(term, { delay: 20 })
  await expect(page.getByText(term, { exact: false }).first()).toBeVisible()
  expect(xCalls).toEqual([])
})

test('direct import: duplicates and invalid records are counted, not imported', async ({ page }) => {
  await page.goto('/dev/import-harness')
  await page.getByLabel('Scenario').selectOption('invalid')
  await page.getByRole('button', { name: /start import/i }).click()
  await expect(page.getByText(/complete import/i)).toBeVisible()
  const counts = page.locator('dl')
  await expect(counts.getByText('Invalid rejected').locator('..')).toContainText('8')
  await expect(counts.getByText('Valid', { exact: true }).locator('..')).toContainText('100')
  await page.getByText(/why 8 records were rejected/i).click()
  await expect(page.getByText(/unexpected field "extra"/)).toBeVisible()

  await page.getByLabel('Scenario').selectOption('duplicates')
  await page.getByRole('button', { name: /start import/i }).click()
  await expect(counts.getByText('Duplicates skipped').locator('..')).toContainText('40')
  await expect(page.getByRole('button', { name: /analyse 150 bookmarks/i })).toBeVisible()
})

test('direct import: an interrupted import is labelled partial all the way to the reveal', async ({ page }) => {
  await page.goto('/dev/import-harness')
  await page.getByLabel('Scenario').selectOption('interrupted')
  await page.getByRole('button', { name: /start import/i }).click()
  await expect(page.getByText(/partial import\./i)).toBeVisible()
  await expect(page.getByText(/connection to the import source was lost/i)).toBeVisible()
  await page.getByRole('button', { name: /analyse partial import \(150\)/i }).click()
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 20_000 })
  await expect(page.getByText(/partial import: it stopped early/i).first()).toBeVisible()
})

test('direct import: a source on the wrong schema version is refused', async ({ page }) => {
  await page.goto('/dev/import-harness')
  await page.getByLabel('Scenario').selectOption('wrong_version')
  await page.getByRole('button', { name: /start import/i }).click()
  await expect(page.getByText(/the import didn’t start/i)).toBeVisible()
  await expect(page.getByText(/format version bkmk\.exe doesn’t support/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /analyse/i })).toHaveCount(0)
})

test('import: malformed and empty files show clear errors and recover', async ({ page }) => {
  await page.goto('/import?via=files')
  await page.locator('#import-files').setInputFiles([{ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{oops') }])
  await page.getByRole('button', { name: /read import/i }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'broken.json' })).toContainText(/isn’t valid JSON/)
  await expect(page.getByText(/no x posts found/i)).toBeVisible()
  await page.getByRole('button', { name: /start over/i }).click()
  await page.getByPlaceholder(/x\.com\/someone\/status/).fill(`https://x.com/ada/status/${LIKES[1][0]}`)
  await page.getByRole('button', { name: /read import/i }).click()
  await expect(page.getByText(/found 1/i)).toBeVisible()
  await expect(page.getByText(/no post text in this import/i)).toBeVisible()
})

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
  // Typed key by key, like a person: earlier builds dropped characters here.
  await page.getByLabel('Search bookmarks').pressSequentially('postgres', { delay: 30 })
  await expect(page).toHaveURL(/q=postgres/)
  await expect(page.getByLabel('Search bookmarks')).toHaveValue('postgres')
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

test('live sign-out ends the session but keeps the library for the next sign-in', async ({ page }) => {
  await liveSignIn(page, /^approve$/i)
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 25_000 })
  await page.goto('/app/settings')
  await expect(page.getByText(/library stays saved/i)).toBeVisible()
  await expect(page.getByText(/don’t sign in or scan for 90 days/i)).toBeVisible()
  await page.getByRole('button', { name: /^sign out$/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(/signed out/i)).toBeVisible()
  expect((await page.request.get('/api/dashboard')).status()).toBe(401)

  await liveSignIn(page, /^approve$/i)
  await expect(page).toHaveURL(/\/scan|\/reveal/)
  expect((await page.request.get('/api/dashboard')).status()).toBe(200)

  // Leave no library behind for the journeys that follow.
  await expect(page).toHaveURL(/\/reveal$/, { timeout: 25_000 })
  await page.goto('/app/settings')
  await page.getByRole('button', { name: /^disconnect$/i }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^disconnect$/i }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('X refusing for billing (402) shows an owner-side, non-retryable error', async ({ page }) => {
  await liveSignIn(page, /credit used up/i)
  await expect(page).toHaveURL(/\/scan/)
  await expect(page.getByRole('heading', { name: /scanning is paused: x api credit ran out/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/nothing is wrong with your x account/i)).toBeVisible()
  await expect(page.getByText(/usually temporary/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /retry scan/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /reconnect x/i })).toHaveCount(0)
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
