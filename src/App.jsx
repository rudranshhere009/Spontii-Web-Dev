import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import Navbar from './components/Navbar'

import Home from './pages/Home'
import Explore from './pages/Explore'
import ActivityDetail from './pages/ActivityDetail'
import Inbox from './pages/Inbox'
import Profile from './pages/Profile'
import CreatePlan from './pages/CreatePlan'
import JoinRequests from './pages/JoinRequests'
import ApplicantProfile from './pages/ApplicantProfile'

import Login from './pages/Login'

const Signup = lazy(() => import('./pages/Signup'))

import { useAuth } from './context/AuthContext'
import { redirectTarget } from './lib/auth'

/* Bottom padding keeps the last content clear of the mobile bottom bar and the floating Create button. */
function ProtectedPage({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return null
  }

  if (!isAuthenticated) {
    /*
     * Remember where the user was going so Login can send them back.
     */
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-24">{children}</main>
    </div>
  )
}

/*
 * Open to everyone (logged in or not), with the normal app chrome.
 * What a logged-out visitor can see inside is decided by AppContext
 * (public plans only) and the page's own locked states.
 */
function OpenPage({ children }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-24">{children}</main>
    </div>
  )
}

function PublicPage({ children }) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return null
  }

  if (isAuthenticated) {
    const onboardingAfterLogin =
      location.pathname === '/login' &&
      user?.profileCompletion < 100 &&
      !location.state?.from

    return (
      <Navigate
        to={onboardingAfterLogin ? '/profile' : redirectTarget(location.state)}
        replace
        state={onboardingAfterLogin ? { showProfileWelcome: true } : undefined}
      />
    )
  }

  return children
}

function PublicHome() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-24">
        <Home />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>

      {/* ================= LANDING PAGE ================= */}

      <Route
        path="/"
        element={<PublicHome />}
      />

      {/* ================= AUTH ================= */}

      <Route
        path="/signup"
        element={
          <PublicPage>
            <Suspense fallback={null}>
              <Signup />
            </Suspense>
          </PublicPage>
        }
      />

      <Route
        path="/login"
        element={
          <PublicPage>
            <Login />
          </PublicPage>
        }
      />

      {/* ================= PROTECTED PAGES ================= */}

      <Route
        path="/explore"
        element={
          <OpenPage>
            <Explore />
          </OpenPage>
        }
      />

      <Route
        path="/activities/:id"
        element={
          <OpenPage>
            <ActivityDetail />
          </OpenPage>
        }
      />

      <Route
        path="/inbox"
        element={
          <ProtectedPage>
            <Inbox />
          </ProtectedPage>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedPage>
            <Profile />
          </ProtectedPage>
        }
      />

      <Route
        path="/create"
        element={
          <ProtectedPage>
            <CreatePlan />
          </ProtectedPage>
        }
      />

      <Route
        path="/join-requests"
        element={
          <ProtectedPage>
            <JoinRequests />
          </ProtectedPage>
        }
      />

      <Route
        path="/people/request/:requestId"
        element={
          <ProtectedPage>
            <ApplicantProfile />
          </ProtectedPage>
        }
      />

      {/* ================= FALLBACK ================= */}

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />

    </Routes>
  )
}