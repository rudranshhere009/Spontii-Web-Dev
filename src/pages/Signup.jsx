import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PhoneInput, { getCountryCallingCode } from 'react-phone-number-input'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

const countryFlags = import.meta.glob(
  '../../node_modules/country-flag-icons/3x2/*.svg',
  { eager: true, query: '?url&no-inline', import: 'default' },
)

function flagUrl(countryCode) {
  return countryFlags[
    `../../node_modules/country-flag-icons/3x2/${countryCode}.svg`
  ]
}

function CountrySearchSelect({
  value,
  onChange,
  options,
  disabled,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const searchRef = useRef(null)
  const triggerRef = useRef(null)

  const countries = useMemo(
    () =>
      options
        .filter((option) => /^[A-Z]{2}$/.test(option.value))
        .map((option) => ({
          ...option,
          callingCode: getCountryCallingCode(option.value),
        })),
    [options],
  )

  const filteredCountries = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()

    if (!search) return countries

    return countries.filter(
      ({ label, callingCode }) =>
        label.toLocaleLowerCase().includes(search) ||
        callingCode.includes(search.replace(/^\+/, '')),
    )
  }, [countries, query])

  const selectedFlag = value ? flagUrl(value) : null

  useEffect(() => {
    if (!open) return undefined

    searchRef.current?.focus()

    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () =>
      document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  function chooseCountry(countryCode) {
    onChange(countryCode)
    close()
  }

  return (
    <div
      ref={containerRef}
      className="signup-country-picker"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || 'Choose country calling code'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="signup-country-trigger"
      >
        {selectedFlag
          ? <img
              src={selectedFlag}
              alt=""
              className="signup-country-trigger-flag"
            />
          : <span aria-hidden="true">🌐</span>}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className={`signup-country-chevron${open ? ' is-open' : ''}`}
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      <div
        role="dialog"
        aria-label="Choose a country"
        aria-hidden={!open}
        className={`signup-country-popover${open ? ' is-open' : ''}`}
      >
        <label className="signup-country-search-wrap">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="signup-country-search-icon"
          >
            <circle cx="8.75" cy="8.75" r="5.75" />
            <path d="m13 13 4 4" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search countries..."
            aria-label="Search countries"
            tabIndex={open ? 0 : -1}
            className="signup-country-search"
          />
          {query && (
            <span className="signup-country-result-count" aria-live="polite">
              {filteredCountries.length}
            </span>
          )}
        </label>

        <div className="signup-country-results" role="listbox" aria-label="Countries">
          {filteredCountries.length ? (
            filteredCountries.map((country) => (
              <button
                key={country.value}
                type="button"
                role="option"
                aria-selected={country.value === value}
                tabIndex={open ? 0 : -1}
                onClick={() => chooseCountry(country.value)}
                className="signup-country-option"
              >
                <CountryFlag country={country} />
                <span className="signup-country-option-name">
                  {country.label}
                </span>
                <span className="signup-country-option-code">
                  +{country.callingCode}
                </span>
              </button>
            ))
          ) : (
            <p className="signup-country-empty">No matching countries</p>
          )}
        </div>
      </div>
    </div>
  )
}

function CountryFlag({ country }) {
  const src = flagUrl(country.value)

  if (!src) {
    return (
      <span className="signup-country-option-flag-fallback" aria-hidden="true">
        {country.value}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      className="signup-country-option-flag"
    />
  )
}

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

export default function Signup() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signup } = useAuth()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] =
    useState('')

  const [showPassword, setShowPassword] =
    useState(false)

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      await signup({
        name,
        phone,
        email,
        password,
      })
      navigate('/login', {
        replace: true,
        state: {
          notice: 'Your account was created. Please log in to continue.',
        },
      })
    } catch (submitError) {
      setError(submitError.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link
            to="/signup"
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
              Welcome to Spontii
            </p>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Meet people.
              <br />
              Make plans.
            </h1>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">
              Create your account and start finding
              people and plans that match your vibe.
            </p>
          </div>

          {/* Why the visitor was sent here (e.g. joining a private plan) */}
          {location.state?.notice && (
            <p
              role="status"
              className="mb-6 rounded-xl border border-mint/30 bg-mint-soft px-4 py-3 text-sm leading-relaxed text-text"
            >
              {location.state.notice}
            </p>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-semibold"
              >
                Full name
              </label>

              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Your full name"
                autoComplete="name"
                required
                className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-text outline-none transition focus:border-mint"
              />
            </div>

            <div>
              <label
                htmlFor="signup-phone"
                className="mb-2 block text-sm font-semibold"
              >
                Phone number
              </label>

              <PhoneInput
                defaultCountry="IN"
                value={phone}
                onChange={setPhone}
                placeholder="Enter phone number"
                countrySelectComponent={CountrySearchSelect}
                countrySelectProps={{
                  'aria-label': 'Country calling code',
                }}
                numberInputProps={{
                  id: 'signup-phone',
                  autoComplete: 'tel',
                  required: true,
                }}
                className="signup-phone-input w-full rounded-xl border border-border bg-surface px-4 text-sm text-text outline-none transition focus-within:border-mint"
              />
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="mb-2 block text-sm font-semibold"
              >
                Email
              </label>

              <input
                id="signup-email"
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
                htmlFor="signup-password"
                className="mb-2 block text-sm font-semibold"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="signup-password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 pr-12 text-sm text-text outline-none transition focus:border-mint"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (previous) => !previous,
                    )
                  }
                  className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:text-text"
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

            <div>
              <label
                htmlFor="confirm-password"
                className="mb-2 block text-sm font-semibold"
              >
                Confirm password
              </label>

              <div className="relative">
                <input
                  id="confirm-password"
                  type={
                    showConfirmPassword
                      ? 'text'
                      : 'password'
                  }
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value,
                    )
                  }
                  placeholder="Enter your password again"
                  autoComplete="new-password"
                  required
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 pr-12 text-sm text-text outline-none transition focus:border-mint"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(
                      (previous) => !previous,
                    )
                  }
                  className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:text-text"
                  aria-label={
                    showConfirmPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >
                  <EyeIcon
                    open={showConfirmPassword}
                  />
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
                ? 'Creating account...'
                : 'Create account'}
            </button>
          </form>

          {/* Login */}
          <p className="mt-7 text-center text-sm text-muted">
            Already have an account?{' '}
            <Link
              to="/login"
              state={location.state}
              className="font-bold text-mint transition hover:underline"
            >
              Log in
            </Link>
          </p>

          <p className="mt-8 text-center text-xs leading-5 text-muted-2">
            By creating an account, you agree to
            Spontii's terms and community guidelines.
          </p>
        </div>
      </div>
    </div>
  )
}