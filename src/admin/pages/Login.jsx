import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import logo from '../../assets/logo.png'
import { LockIcon } from '../../components/NavIcons'
import { useAdminAuth } from '../AdminAuthContext'
import { Button, ErrorNotice, Field, Input, Notice } from '../components/ui'

export default function AdminLogin() {
  const { admin, login, verify, resend, endedReason } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [resendIn, setResendIn] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  if (admin) {
    const from = location.state?.from
    return <Navigate to={admin.mustChangePassword ? '/admin/account' : from || '/admin'} replace />
  }

  async function submitPassword(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await login(email.trim(), password)
      setChallenge(result)
      setResendIn(result.resendInSeconds)
      setPassword('')
      setStep('otp')
    } catch (loginError) {
      setError(loginError)
    } finally {
      setBusy(false)
    }
  }

  async function submitOtp(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const signedIn = await verify(challenge.challengeId, otp.trim())
      navigate(signedIn.mustChangePassword ? '/admin/account' : location.state?.from || '/admin', { replace: true })
    } catch (verifyError) {
      setError(verifyError)
      setBusy(false)
    }
  }

  async function resendCode() {
    setError(null)
    setInfo('')
    try {
      const result = await resend(challenge.challengeId)
      setResendIn(result.resendInSeconds)
      setInfo('A new code is on its way.')
    } catch (resendError) {
      setError(resendError)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10 text-text">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src={logo} alt="Spontii" className="mx-auto mb-6 h-12 w-auto" />
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-mint">
            <LockIcon className="h-3.5 w-3.5" /> Admin portal
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {step === 'password' ? 'Sign in to Spontii Admin' : 'Check your email'}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">
            {step === 'password'
              ? 'Restricted to the Spontii team. Every action here is recorded.'
              : `We sent a 6-digit code to ${challenge?.sentTo}. It expires in 5 minutes.`}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface-2 p-6">
          {endedReason && step === 'password' && (
            <div className="mb-5"><Notice tone="warning">{endedReason}</Notice></div>
          )}

          {step === 'password' ? (
            <form onSubmit={submitPassword} className="space-y-5">
              <Field label="Email" htmlFor="admin-email">
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  required
                  className="h-12"
                />
              </Field>
              <Field label="Password" htmlFor="admin-password">
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-12"
                />
              </Field>
              <ErrorNotice error={error} />
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Checking…' : 'Continue'}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitOtp} className="space-y-5">
              <Field label="Login code" htmlFor="admin-otp">
                <Input
                  id="admin-otp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  className="h-14 text-center text-2xl font-extrabold tracking-[0.5em]"
                />
              </Field>
              {info && <Notice>{info}</Notice>}
              <ErrorNotice error={error} />
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || otp.length !== 6}>
                {busy ? 'Verifying…' : 'Verify and sign in'}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep('password')
                    setOtp('')
                    setError(null)
                  }}
                  className="font-semibold text-muted hover:text-text"
                >
                  Use a different account
                </button>
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={resendIn > 0}
                  className="font-semibold text-mint hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
