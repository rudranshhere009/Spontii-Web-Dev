import { useEffect, useState } from 'react'
import logo from '../assets/logo.png'
import { MAINTENANCE_EVENT, apiRequest } from '../lib/api'
import { CloseIcon } from './NavIcons'

export default function SiteStatus({ children }) {
  const [config, setConfig] = useState(null)
  const [dismissed, setDismissed] = useState('')

  useEffect(() => {
    let active = true
    const load = () => {
      apiRequest('/app-config')
        .then((result) => {
          if (active) setConfig(result)
        })
        .catch((error) => {
          console.error('Failed to load app configuration:', error)
        })
    }

    load()
    const timer = setInterval(load, 60 * 1000)
    window.addEventListener(MAINTENANCE_EVENT, load)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener(MAINTENANCE_EVENT, load)
    }
  }, [])

  if (config?.maintenance?.enabled) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-6 text-center text-text">
        <div className="max-w-md">
          <img src={logo} alt="Spontii" className="mx-auto mb-8 h-12 w-auto" />
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-mint">Back soon</p>
          <h1 className="text-3xl font-extrabold tracking-tight">We're doing some maintenance</h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            {config.maintenance.message || 'Spontii is briefly unavailable while we make improvements. Please check back in a little while.'}
          </p>
        </div>
      </div>
    )
  }

  const banner = config?.banner
  const showBanner = banner && dismissed !== banner.message

  return (
    <>
      {showBanner && (
        <div
          role="status"
          className={`relative z-[60] flex items-start justify-center gap-3 border-b px-10 py-2.5 text-center text-sm font-medium ${
            banner.level === 'warning' ? 'border-warning/30 bg-warning/15 text-text' : 'border-mint/30 bg-mint-soft text-text'
          }`}
        >
          <span>{banner.message}</span>
          <button
            type="button"
            onClick={() => setDismissed(banner.message)}
            aria-label="Dismiss announcement"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-text"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {children}
    </>
  )
}
