import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { redirectTarget } from '../lib/auth'
import logo from '../assets/logo.png'

export default function ForgotPassword() {
  const location = useLocation()
  const navigate = useNavigate()
  const { sendLoginCode, loginWithCode } = useAuth()
  const [email, setEmail] = useState(location.state?.email || '')
  const [otp, setOtp] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(0)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!codeSent) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [codeSent])

  const cleanEmail = email.trim().toLowerCase()
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const timeLeft = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

  function updateTimers(result) {
    const currentTime = Date.now()
    setNow(currentTime)
    setExpiresAt(currentTime + result.expiresInSeconds * 1000)
    setResendAt(currentTime + result.resendInSeconds * 1000)
  }

  async function handleSendCode(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const result = await sendLoginCode({ email: cleanEmail })
      setCodeSent(true)
      setOtp('')
      updateTimers(result)
      setInfo(result.message)
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault()
    setError('')

    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    if (secondsLeft === 0) {
      setError('This code has expired. Request a new one.')
      return
    }

    setLoading(true)
    try {
      const user = await loginWithCode({ email: cleanEmail, otp })
      const target = redirectTarget(location.state)

      if (user.profileCompletion < 100 && target === '/') {
        navigate('/profile', {
          replace: true,
          state: { showProfileWelcome: true },
        })
      } else {
        navigate(target, { replace: true })
      }
    } catch (verifyError) {
      setError(verifyError.message)
      setLoading(false)
    }
  }

  async function handleResendCode() {
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const result = await sendLoginCode({ email: cleanEmail })
      setOtp('')
      updateTimers(result)
      setInfo(result.message)
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setLoading(false)
    }
  }

  function changeEmail() {
    setCodeSent(false)
    setOtp('')
    setError('')
    setInfo('')
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/login" state={location.state} className="mb-10 flex justify-center">
            <img src={logo} alt="Spontii" className="h-10 w-auto" />
          </Link>

          <div className="mb-8 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-mint">
              Secure email login
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {codeSent ? 'Check your email.' : 'Forgot your password?'}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">
              {codeSent
                ? `Enter the 6-digit code sent to ${cleanEmail}.`
                : 'Enter your account email and we’ll send you a one-time code to log in.'}
            </p>
          </div>

          <form
            onSubmit={codeSent ? handleVerifyCode : handleSendCode}
            className="space-y-5"
          >
            {!codeSent ? (
              <div>
                <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold">
                  Email
                </label>
                <input
                  id="recovery-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={254}
                  required
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-text outline-none transition focus:border-mint"
                />
                <p className="mt-2 text-xs text-muted">
                  If an account exists for that email, we’ll send a login code.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="recovery-code" className="mb-2 block text-sm font-semibold">
                    6-digit login code
                  </label>
                  <input
                    id="recovery-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    required
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-center text-lg tracking-[0.5em] text-text outline-none transition focus:border-mint"
                  />
                  <p className="mt-2 text-xs text-muted" aria-live="polite">
                    {secondsLeft > 0
                      ? `This code expires in ${timeLeft}.`
                      : 'This code has expired. Request a new one to continue.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading || resendIn > 0}
                  className="w-full text-sm font-semibold text-mint transition hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </button>
              </>
            )}

            {info && (
              <p role="status" className="rounded-xl border border-mint/30 bg-mint-soft px-4 py-3 text-sm text-text">
                {info}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || (codeSent && (otp.length !== 6 || secondsLeft === 0))}
              className="w-full rounded-xl bg-mint px-5 py-3.5 text-sm font-bold text-bg transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? codeSent ? 'Verifying code...' : 'Sending code...'
                : codeSent ? 'Log in' : 'Send login code'}
            </button>

            {codeSent && (
              <button
                type="button"
                onClick={changeEmail}
                disabled={loading}
                className="w-full text-sm font-semibold text-muted transition hover:text-text disabled:opacity-50"
              >
                Use a different email
              </button>
            )}
          </form>

          <p className="mt-7 text-center text-sm text-muted">
            Remembered your password?{' '}
            <Link to="/login" state={{ ...location.state, email }} className="font-bold text-mint transition hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
