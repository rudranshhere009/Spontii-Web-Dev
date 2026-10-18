import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import Navbar from './components/Navbar'

import Home from './pages/Home'
import Explore from './pages/Explore'
import ActivityDetail from './pages/ActivityDetail'
import Inbox from './pages/Inbox'
import Profile from './pages/Profile'
import CreatePlan from './pages/CreatePlan'
import JoinRequests from './pages/JoinRequests'
import ApplicantProfile from './pages/ApplicantProfile'
import People from './pages/People'

import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'

const Signup = lazy(() => import('./pages/Signup'))

import { useAuth } from './context/AuthContext'
import { redirectTarget } from './lib/auth'
import { apiRequest } from './lib/api'

const PROFILE_REMINDER_SNOOZE_MS = 60 * 60 * 1000

function profileReminderSnoozedUntil(userId) {
  try {
    const snoozedUntil = Number(
      localStorage.getItem(`spontii_profile_reminder_snooze_v1_${userId}`),
    )
    return Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()
      ? snoozedUntil
      : null
  } catch (error) {
    console.error('Failed to check profile reminder snooze:', error)
    return null
  }
}

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
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="min-h-screen bg-bg" aria-busy="true" />
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-24">
        <Home />
      </main>

      {isAuthenticated &&
        typeof user?.profileCompletion === 'number' &&
        user.profileCompletion < 100 && (
          <ProfileCompletionReminder
            key={location.key}
            user={user}
          />
        )}
    </div>
  )
}

function ProfileCompletionReminder({ user }) {
  const navigate = useNavigate()
  const [snoozedUntil, setSnoozedUntil] = useState(
    () => profileReminderSnoozedUntil(user.id),
  )
  const [reminderOpen, setReminderOpen] = useState(() => snoozedUntil === null)
  const [snoozeReminder, setSnoozeReminder] = useState(false)
  const [welcomeSpin, setWelcomeSpin] = useState(0)
  const [displayId, setDisplayId] = useState(() => window.crypto.randomUUID())

  useEffect(() => {
    if (!reminderOpen) return

    apiRequest('/notifications/profile-reminder-shown', {
      method: 'POST',
      body: { displayId },
    }).then(({ notification }) => {
      if (notification) {
        window.dispatchEvent(new CustomEvent('spontii:notification-created', {
          detail: notification,
        }))
      }
    }).catch((error) => {
      console.error('Failed to register profile reminder notification:', error)
    })
  }, [displayId, reminderOpen])

  useEffect(() => {
    if (snoozedUntil === null) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setDisplayId(window.crypto.randomUUID())
      setReminderOpen(true)
      setSnoozedUntil(null)
    }, Math.max(0, snoozedUntil - Date.now()))

    return () => window.clearTimeout(timeoutId)
  }, [snoozedUntil])

  function dismissReminder() {
    if (snoozeReminder) {
      const nextReminderAt = Date.now() + PROFILE_REMINDER_SNOOZE_MS
      try {
        localStorage.setItem(
          `spontii_profile_reminder_snooze_v1_${user.id}`,
          String(nextReminderAt),
        )
      } catch (error) {
        console.error('Failed to save profile reminder snooze:', error)
      }
      setSnoozedUntil(nextReminderAt)
    }

    setReminderOpen(false)
  }

  if (!reminderOpen) {
    return null
  }

  return (
    <div
      className="profile-reminder-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      onMouseDown={(event) =>
        event.target === event.currentTarget && dismissReminder()
      }
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-reminder-title"
        className="profile-reminder-card relative my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-border bg-surface-2 p-6 sm:p-8"
      >
        <div className="mb-7 flex justify-center">
          <button
            key={welcomeSpin}
            type="button"
            onClick={() => setWelcomeSpin((spin) => spin + 1)}
            aria-label="Welcome"
            className="profile-reminder-welcome whitespace-nowrap text-[26px] font-extrabold uppercase tracking-[0.16em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
          >
            <span className="text-mint">WEL</span><span className="text-text">COME</span>
          </button>
        </div>

        <h2
          id="profile-reminder-title"
          className="whitespace-nowrap text-[clamp(0.875rem,4.5vw,1.125rem)] font-extrabold tracking-tight"
        >
          Make your profile <span className="text-mint">feel like you.</span>
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          You’re off to a great start. Add a few more details so people can
          get to know you and feel confident making plans together.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-4">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold text-muted">PROFILE COMPLETION</p>
              <p className="mt-1 text-sm font-bold text-text">Your profile journey</p>
            </div>
            <span className="text-2xl font-extrabold tabular-nums text-mint">
              {user.profileCompletion}<span className="text-sm">%</span>
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Profile completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={user.profileCompletion}
          >
            <div
              className="profile-reminder-progress h-full rounded-full bg-mint"
              style={{ width: `${user.profileCompletion}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            A photo, city, short bio, and interests help your profile shine.
          </p>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 px-3.5 py-3 text-xs font-medium text-muted transition-colors hover:border-mint/40 hover:text-text">
          <input
            type="checkbox"
            checked={snoozeReminder}
            onChange={(event) => setSnoozeReminder(event.target.checked)}
            className="h-4 w-4 shrink-0 accent-mint"
          />
          Don’t remind me again for 1 hour
        </label>

        <button
          type="button"
          onClick={() =>
            navigate('/profile', { state: { openProfileEditor: true } })
          }
          className="profile-reminder-cta mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 text-sm font-extrabold text-bg transition-colors hover:bg-mint/90"
        >
          Complete my profile
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          onClick={dismissReminder}
          className="mt-2 flex h-10 w-full items-center justify-center text-xs font-semibold text-muted transition-colors hover:text-text"
        >
          Maybe later
        </button>
      </section>
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

      <Route
        path="/forgot-password"
        element={
          <PublicPage>
            <ForgotPassword />
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
          <ProtectedPage>
            <ActivityDetail />
          </ProtectedPage>
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
        path="/people/:id"
        element={
          <ProtectedPage>
            <People />
          </ProtectedPage>
        }
      />

      <Route
        path="/people"
        element={
          <ProtectedPage>
            <People />
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