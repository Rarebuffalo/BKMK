import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsernameForm } from '../components/landing/UsernameForm'
import { AchievementsPage } from '../pages/AchievementsPage'
import { LibraryPage } from '../pages/LibraryPage'
import { SettingsPage } from '../pages/SettingsPage'
import { SharePage } from '../pages/SharePage'
import { renderRoutes, seedDemoSession } from './render'

afterEach(() => vi.unstubAllGlobals())

describe('UsernameForm', () => {
  it('shows validation errors and passes the chosen mode to the connect step', async () => {
    const user = userEvent.setup()
    const { router } = renderRoutes([{ path: '/', element: <UsernameForm id="h" mode="live" /> }], '/')
    await user.click(screen.getByRole('button', { name: /scan my bookmark dna/i }))
    expect(screen.getByText(/enter your x handle/i)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox'), 'bad handle!')
    await user.click(screen.getByRole('button', { name: /scan my bookmark dna/i }))
    expect(screen.getByText(/only letters, numbers and underscores/i)).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'https://x.com/ada_builds')
    expect(screen.getByText(/looks good/i)).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/connect'))
    expect(router.state.location.state).toEqual({ handle: 'ada_builds', mode: 'live' })
  })
})

describe('Achievement cabinet', () => {
  it('shows earned and locked badges with progress, and opens details', async () => {
    seedDemoSession()
    const user = userEvent.setup()
    renderRoutes([{ path: '/app/achievements', element: <AchievementsPage /> }], '/app/achievements')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/of 8 unlocked/)
    expect(screen.getAllByRole('img', { name: /badge, earned/ }).length).toBeGreaterThan(0)
    const locked = screen.queryAllByRole('img', { name: /badge, locked/ })
    await user.click(screen.getByRole('heading', { name: 'First Scan' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/complete a successful scan/i)).toBeInTheDocument()
    expect(within(dialog).getByText('1 / 1')).toBeInTheDocument()
    expect(locked.length + screen.getAllByRole('img', { name: /badge, earned/ }).length).toBeGreaterThanOrEqual(8)
  })
})

describe('Share page', () => {
  it('switches card variants and copies the caption with the product link', async () => {
    seedDemoSession()
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { router } = renderRoutes([{ path: '/share', element: <SharePage /> }], '/share')
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: /achievements/i }))
    expect(router.state.location.search).toBe('?variant=badges')
    expect(screen.getByRole('radio', { name: /achievements/i })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: /copy caption/i }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/I'm The Builder.*\?ref=dna$/))
    expect(await screen.findByText('Caption copied')).toBeInTheDocument()
  })

  it('opens the X composer in a new tab and never posts by itself', async () => {
    seedDemoSession()
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderRoutes([{ path: '/share', element: <SharePage /> }], '/share')
    await user.click(screen.getByRole('button', { name: /open x composer/i }))
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/x\.com\/intent\/post\?text=.+&url=/), '_blank', 'noopener,noreferrer')
  })
})

describe('Settings', () => {
  it('asks for confirmation before deleting data, then clears the session', async () => {
    seedDemoSession()
    const user = userEvent.setup()
    const { router } = renderRoutes(
      [
        { path: '/app/settings', element: <SettingsPage /> },
        { path: '/', element: <div>home</div> },
      ],
      '/app/settings',
    )
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/can’t be undone/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(JSON.parse(localStorage.getItem('bkmk.session.v2')!).result).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /delete everything/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(JSON.parse(localStorage.getItem('bkmk.session.v2')!).result).toBeNull()
  })
})

describe('Library search', () => {
  it('keeps every keystroke when typing quickly, then syncs the URL', async () => {
    seedDemoSession()
    const user = userEvent.setup({ delay: 5 })
    const { router } = renderRoutes([{ path: '/app/library', element: <LibraryPage /> }], '/app/library')
    const input = screen.getByLabelText('Search bookmarks')
    await user.type(input, 'agent')
    expect(input).toHaveValue('agent')
    await waitFor(() => expect(router.state.location.search).toBe('?q=agent'))
    expect(input).toHaveValue('agent')
    await user.click(screen.getByRole('button', { name: /clear search/i }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(input).toHaveValue('')
  })
})

describe('Live starter scan display', () => {
  it('labels a capped scan as a sample of the newest bookmarks, not as partial or failed', async () => {
    const { render } = await import('@testing-library/react')
    const { CoverageLine } = await import('../components/reveal/ReportParts')
    const { sampleResult } = await import('../data/sample')
    const base = sampleResult()
    const result = { ...base, isDemo: false, source: 'live' as const, coverage: 'sample' as const, coverageNote: 'Your Bookmark DNA is based on your 30 most recent bookmarks.' }
    render(<CoverageLine result={result} />)
    expect(screen.getByText(/starter scan · newest/i)).toBeInTheDocument()
    expect(screen.getByText('Your Bookmark DNA is based on your 30 most recent bookmarks.')).toBeInTheDocument()
    expect(screen.queryByText(/partial scan/i)).not.toBeInTheDocument()
  })

  it('shows the API’s “Author not loaded” instead of a fake handle', async () => {
    const { BookmarkCard } = await import('../components/library/BookmarkCard')
    const b = { id: '1', author: { handle: '', name: 'Author not loaded' }, text: 'Rust tips', createdAt: '2026-09-01T00:00:00Z', url: 'https://x.com/i/status/1', links: [], accessible: true, topic: 'engineering' as const, contentType: 'post' as const, matched: [] }
    renderRoutes([{ path: '/', element: <BookmarkCard bookmark={b} isDemo={false} /> }], '/')
    expect(screen.getByText('Author not loaded')).toBeInTheDocument()
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument()
  })
})
