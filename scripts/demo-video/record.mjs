// Drives the real BKMK.exe UI and captures CDP screencast frames with timestamps.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const DIR = new URL('.', import.meta.url).pathname
const FRAMES = `${DIR}frames`
// A frontend with no backend behind it, so the app runs in its labelled demo mode:
//   cd frontend && BKMK_API_URL=http://127.0.0.1:9 npx vite --port 5175
const APP = process.env.APP_URL ?? 'http://localhost:5175'
rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--hide-scrollbars', '--force-color-profile=srgb'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, acceptDownloads: true, colorScheme: 'dark' })
// The "Demo lab" button is a prototype control for reviewers, not part of the product story.
await context.addInitScript(() => {
  const hide = () => document.querySelectorAll('button').forEach((b) => { if (b.textContent?.trim() === 'Demo lab') b.style.display = 'none' })
  new MutationObserver(hide).observe(document, { childList: true, subtree: true })
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)

const frames = []
// CDP screencast: smooth (~60 fps on change) frames at the CSS viewport size, 1280×720.
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const n = frames.length
  writeFileSync(`${FRAMES}/${String(n).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'))
  frames.push({ n, t: metadata.timestamp })
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
const markers = {}
const mark = (name) => { markers[name] = Date.now() / 1000; console.log('mark', name) }
const wait = (ms) => page.waitForTimeout(ms)
const startCast = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 98, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 })
// Keeps a tiny repaint going so static holds still produce frames (no visual change).
const keepalive = () => page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none;z-index:99999'; document.body.appendChild(d); let on = 0; setInterval(() => { d.style.background = (on ^= 1) ? '#0a0c0b' : '#0a0c0a' }, 33) })

// Clean state
await page.goto(APP)
await page.evaluate(() => localStorage.clear())

// ── intro card
await page.goto(`file://${DIR}intro.html`)
await page.evaluate(() => document.fonts.ready)
await keepalive()
await startCast()
mark('intro')
await wait(3400)

// ── landing
await page.goto(APP)
await page.evaluate(() => document.fonts.ready)
await page.waitForSelector('canvas')
await keepalive()
await wait(900)
mark('landing')
await wait(1100)
await page.locator('#hero-handle').click()
mark('typing')
await page.locator('#hero-handle').pressSequentially('krishnassinghh', { delay: 85 })
await wait(700)
mark('typed')
await page.locator('#hero-handle').press('Enter')

// ── connect (demo flow)
await page.getByRole('button', { name: /yes, that’s me/i }).waitFor()
mark('confirm')
await wait(900)
await page.getByRole('button', { name: /yes, that’s me/i }).click()
await page.getByRole('button', { name: /connect x & scan/i }).waitFor()
await wait(900)
await page.getByRole('button', { name: /connect x & scan/i }).click()
mark('authorizing')

// ── scan
await page.waitForURL(/\/scan$/)
mark('scan')
await page.getByText('Report ready.').waitFor({ timeout: 30000 })
mark('ready')

// ── reveal
await page.waitForURL(/\/reveal$/, { timeout: 15000 })
mark('reveal')
await wait(3600)
mark('revealDone')
await page.evaluate(() => window.scrollTo({ top: 430, behavior: 'smooth' }))
await wait(1900)
mark('revealScrolled')
const facts = await page.evaluate(() => ({
  archetype: document.querySelector('h1')?.textContent,
  decoded: [...document.querySelectorAll('.eyebrow')].find((e) => /decoded/i.test(e.textContent))?.nextElementSibling?.textContent,
  score: document.querySelector('.text-6xl')?.textContent,
  badges: document.querySelector('main')?.innerText.match(/(\d)\/8 unlocked/)?.[1],
}))
console.log('facts', JSON.stringify(facts))

// ── dashboard
await page.getByRole('button', { name: /^dashboard$/i }).click()
await page.getByText('ARCHIVE OVERVIEW').waitFor()
mark('dashboard')
await wait(1800)
await page.getByRole('link', { name: /explore topics/i }).click()
await page.getByRole('heading', { name: /topic clusters/i }).waitFor()
mark('topics')
await wait(1500)
await page.getByRole('link', { name: /all bookmarks/i }).click()
await page.getByLabel('Search bookmarks').waitFor()
mark('library')
await wait(500)
await page.getByLabel('Search bookmarks').pressSequentially('agent', { delay: 110 })
await wait(1500)
mark('searched')

// ── share
await page.getByRole('button', { name: /share my dna/i }).first().click()
await page.waitForURL(/\/share/)
await wait(700)
mark('share')
await wait(1300)
await page.getByRole('radio', { name: /collector id/i }).click()
mark('identity')
await wait(1500)
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /download png/i }).click()])
mark('download')
await download.saveAs(`${DIR}card.png`)
await wait(1500)
mark('shareEnd')

// ── outro
await page.goto(`file://${DIR}outro.html`)
await page.evaluate(() => document.fonts.ready)
await keepalive()
mark('outro')
await wait(3800)
mark('end')

await cdp.send('Page.stopScreencast')
writeFileSync(`${DIR}frames.json`, JSON.stringify({ frames, markers }))
console.log('frames', frames.length)
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))])
process.exit(0)
