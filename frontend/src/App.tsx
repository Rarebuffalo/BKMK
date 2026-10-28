import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom'
import { AppShell } from './components/dashboard/AppShell'
import { ToastProvider } from './components/ui/Toast'
import { AchievementsPage } from './pages/AchievementsPage'
import { ConnectPage } from './pages/ConnectPage'
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
import { SessionProvider, useSession } from './state/session'

/** Routes that need a completed scan send visitors back to the start. */
function RequireResult() {
  const { state } = useSession()
  return state.result ? <Outlet /> : <Navigate to="/" replace />
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
    <SessionProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </SessionProvider>
  )
}
