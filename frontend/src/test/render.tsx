import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '../components/ui/Toast'
import { generateDemoBookmarks } from '../data/demoProfile'
import { analyze } from '../domain/analyze'
import { LiveProvider } from '../state/live'
import { SessionProvider } from '../state/session'

export const demoResult = () =>
  analyze({ handle: 'demo', displayName: 'demo', isDemo: true, source: 'demo', raw: generateDemoBookmarks('demo', 'builder'), coverage: 'complete', scannedAt: '2026-10-28T10:00:00Z' })

/** Seeds a finished demo session, as if the user had just run the demo scan. */
export function seedDemoSession() {
  localStorage.setItem(
    'bkmk.session.v2',
    JSON.stringify({
      mode: 'demo',
      identity: { handle: 'demo', displayName: 'demo', isDemo: true },
      authorized: true,
      result: demoResult(),
      revealSeen: true,
      demo: { scenario: 'normal', persona: 'auto' },
    }),
  )
}

/** Renders routes with every provider. No backend: /api calls fail like static hosting. */
export function renderRoutes(routes: { path: string; element: ReactElement }[], initial: string) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('no backend in tests')))
  const router = createMemoryRouter([...routes, { path: '*', element: <div data-testid="elsewhere" /> }], { initialEntries: [initial] })
  const utils = render(
    <LiveProvider>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </LiveProvider>,
  )
  return { ...utils, router }
}
