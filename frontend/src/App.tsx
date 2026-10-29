import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom'
import { AppShell } from './components/dashboard/AppShell'
import { ToastProvider } from './components/ui/Toast'
import { AchievementsPage } from './pages/AchievementsPage'
import { ConnectPage } from './pages/ConnectPage'
import { ImportPage } from './pages/ImportPage'
import { LandingPage } from './pages/LandingPage'
import { LibraryPage } from './pages/LibraryPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OverviewPage } from './pages/OverviewPage'
import { RevealPage } from './pages/RevealPage'
import { ScanPage } from './pages/ScanPage'
import { SettingsPage } from './pages/SettingsPage'
import { SharePage } from './pages/SharePage'
import { TopicDetailPage } from './pages/TopicDetailPage'
import { TopicsPage } from './pages/TopicsPage'
import { LiveProvider, useLive } from './state/live'
import { SessionProvider, useSession } from './state/session'

/** Routes that need a completed scan send visitors back to the start (or to their first scan). */
function RequireResult() {
  const { state } = useSession()
  const live = useLive()
  if (state.mode !== 'live') return state.result ? <Outlet /> : <Navigate to="/" replace />
  if (live.report) return <Outlet />
  if (live.status === 'checking' || live.reportState === 'loading' || (live.status === 'authenticated' && live.reportState === 'idle')) {
    return (
      <div className="grid min-h-dvh place-items-center font-mono text-sm text-paper-dim" role="status">
        loading your archive…
      </div>
    )
  }
  if (live.status === 'authenticated' && live.reportState === 'none') return <Navigate to="/scan" replace />
  if (live.reportState === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-paper-dim">Couldn’t load your archive. The server may be busy.</p>
          <button type="button" className="mt-4 font-mono text-sm text-phosphor underline" onClick={() => live.loadReport()}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  return <Navigate to="/" replace />
}

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/connect', element: <ConnectPage /> },
      { path: '/import', element: <ImportPage /> },
      { path: '/scan', element: <ScanPage /> },
      {
        element: <RequireResult />,
        children: [
          { path: '/reveal', element: <RevealPage /> },
          { path: '/share', element: <SharePage /> },
          {
            path: '/app',
            element: <AppShell />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'topics', element: <TopicsPage /> },
              { path: 'topics/:topicId', element: <TopicDetailPage /> },
              { path: 'library', element: <LibraryPage /> },
              { path: 'achievements', element: <AchievementsPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return (
    <LiveProvider>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </LiveProvider>
  )
}
