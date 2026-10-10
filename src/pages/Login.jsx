import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { redirectTarget } from '../lib/auth'
import logo from '../assets/logo.png'

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path d="m3 3 18 18" />
      <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a18 18 0 0 1-3.1 3.9" />
      <path d="M6.2 6.4C3.8 8.1 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.6-.3 3.7-.8" />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [showPassword, setShowPassword] =
    useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setLoading(true)

    const result = login({
      email,
      password,
    })

    if (!result.success) {
      setError(result.message)
      setLoading(false)
      return
    }

    navigate(redirectTarget(location.state), { replace: true })
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link
            to="/login"
            className="mb-10 flex justify-center"
          >
            <img
              src={logo}
              alt="Spontii"
              className="h-10 w-auto"
            />
          </Link>

          {/* Heading */}
          <div className="mb-8 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-mint">
              Welcome back
            </p>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Good to see you.
            </h1>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">
              Log in to discover plans, connect with
              people and pick up where you left off.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="login-email"
                className="mb-2 block text-sm font-semibold"
              >
                Email
              </label>

              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-text outline-none transition focus:border-mint"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-2 block text-sm font-semibold"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="login-password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 pr-12 text-sm text-text outline-none transition focus:border-mint"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (previous) => !previous,
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-text"
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-medium text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-mint px-5 py-3.5 text-sm font-bold text-bg transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? 'Logging in...'
                : 'Log in'}
            </button>
          </form>

          {/* Signup */}
          <p className="mt-7 text-center text-sm text-muted">
            Don't have an account?{' '}
            <Link
              to="/signup"
              state={location.state}
              className="font-bold text-mint transition hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}