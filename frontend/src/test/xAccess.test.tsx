/// <reference types="node" />
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accessUpdatesUrl } from '../lib/xAccess'
import { ConnectPage } from '../pages/ConnectPage'
import { LandingPage } from '../pages/LandingPage'
import { renderRoutes } from './render'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('accessUpdatesUrl', () => {
  it('shows only https: and mailto: links the owner configured', () => {
    expect(accessUpdatesUrl(undefined)).toBeNull()
    expect(accessUpdatesUrl('  ')).toBeNull()
    expect(accessUpdatesUrl('https://example.com/updates')).toBe('https://example.com/updates')
    expect(accessUpdatesUrl('mailto:owner@example.com')).toBe('mailto:owner@example.com')
    expect(accessUpdatesUrl('javascript:alert(1)')).toBeNull()
    expect(accessUpdatesUrl('http://example.com')).toBeNull()
    expect(accessUpdatesUrl('not a url')).toBeNull()
  })
})

describe('Connect with X while import is off', () => {
  it('the landing page says import isn’t enabled and leads to the demo, not a sign-in or paste flow', async () => {
    const user = userEvent.setup()
    const { router, container } = renderRoutes([{ path: '/', element: <LandingPage /> }], '/')
    expect(await screen.findByRole('heading', { name: /x bookmark import isn’t enabled yet/i })).toBeInTheDocument()
    expect(screen.getByText(/asking x for guidance and permission/i)).toBeInTheDocument()
    expect(screen.queryByText(/x approved|approved by x/i)).toBeNull()
    expect(container.querySelector('#hero-handle')).toBeNull()
    expect(screen.queryByText(/copy your x bookmarks/i)).toBeNull()
    // No updates link unless the owner configured one.
    expect(screen.queryByRole('link', { name: /request access updates/i })).toBeNull()

    await user.click(screen.getAllByRole('link', { name: /try the demo/i })[0])
    await waitFor(() => expect(router.state.location.pathname).toBe('/connect'))
    expect(router.state.location.state).toEqual({ handle: 'demo', mode: 'demo' })
  })

  it('shows "Request access updates" when the owner sets a link', async () => {
    vi.stubEnv('VITE_ACCESS_UPDATES_URL', 'https://example.com/updates')
    renderRoutes([{ path: '/', element: <LandingPage /> }], '/')
    const link = await screen.findByRole('link', { name: /request access updates/i })
    expect(link).toHaveAttribute('href', 'https://example.com/updates')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('the sign-in redirect for a server with import off shows the same honest state', async () => {
    renderRoutes([{ path: '/connect', element: <ConnectPage /> }], '/connect?auth=failed&reason=not_configured')
    expect(await screen.findByRole('heading', { level: 1, name: /x bookmark import isn’t enabled yet/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /try the demo/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    expect(screen.queryByText('LIVE')).toBeNull()
  })
})

describe('X permission-request draft', () => {
  // Vitest runs from frontend/; the draft lives in the repo's docs/.
  const draft = readFileSync(resolve(process.cwd(), '../docs/x-permission-request.md'), 'utf8')

  it('covers what X needs to answer, with the questions and safeguards', () => {
    for (const section of ['What BKMK.exe is', "The experience I'd like to offer", "Why I'm asking about a browser extension", 'Safeguards I would commit to', 'Questions for X', 'Willing to adapt']) {
      expect(draft).toContain(`### ${section}`)
    }
    for (const topic of ['**Policy and permission**', '**Technical**', '**Commercial use and access**', '**Approval**']) expect(draft).toContain(topic)
    expect(draft).toMatch(/never ask for, store or transmit X passwords/)
  })

  it('invents no contact details or approval: every personal field is a placeholder', () => {
    expect(draft).toContain('[Your name]')
    expect(draft).toContain('[Contact email you control]')
    expect(draft.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).toEqual([])
    expect(draft).not.toMatch(/X (has )?approved/i)
    expect(draft).toMatch(/draft, not sent/)
  })
})
