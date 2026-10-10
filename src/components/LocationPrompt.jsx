import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  geolocationPermission,
  getLocationPref,
  requestCity,
  setLocationPref,
} from '../lib/location'
import { CheckIcon, CloseIcon, MapPinIcon } from './NavIcons'

const SEEN_KEY = 'spontii_location_prompt_seen_v1'

/*
 * Landing-page only. Shown once per session until the user chooses:
 * - already granted in the browser → use it silently, no prompt
 * - blocked in the browser         → never ask
 * - "Not now"                      → remembered, never shown again
 */
export default function LocationPrompt() {
  const { city, setCity } = useApp()
  const { isAuthenticated } = useAuth()

  // 'hidden' | 'ask' | 'locating' | 'done' | 'denied' | 'error'
  const [phase, setPhase] = useState('hidden')
  const [message, setMessage] = useState('')
  const hideTimer = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function decide() {
      const permission = await geolocationPermission()
      if (cancelled) return

      if (permission === 'granted') {
        const result = await requestCity()
        if (cancelled) return
        if (result.ok && result.city) setCity(result.city)
        setLocationPref('granted')
        return
      }

      if (permission === 'denied') {
        setLocationPref('denied')
        return
      }

      let seen = false
      try {
        seen = sessionStorage.getItem(SEEN_KEY) === '1'
        sessionStorage.setItem(SEEN_KEY, '1')
      } catch {
        // sessionStorage unavailable: fall back to the saved choice only.
      }

      if (!getLocationPref() && !seen) {
        setPhase('ask')
      }
    }

    decide()

    return () => {
      cancelled = true
      clearTimeout(hideTimer.current)
    }
  }, [setCity])

  function close() {
    clearTimeout(hideTimer.current)
    setPhase('hidden')
  }

  function notNow() {
    setLocationPref('dismissed')
    close()
  }

  async function share() {
    setPhase('locating')
    const result = await requestCity()

    if (result.ok) {
      setLocationPref('granted')

      if (result.city) {
        setCity(result.city)
        setMessage(`Showing plans near ${result.city}.`)
      } else {
        setMessage(
          `Spontii isn't in your area yet, so you're seeing plans in ${city}.`
        )
      }

      setPhase('done')
      hideTimer.current = setTimeout(close, 5000)
      return
    }

    if (result.reason === 'denied') {
      setLocationPref('denied')
      setMessage(
        isAuthenticated
          ? `No problem. You're seeing plans in ${city}; you can pick a city from the menu anytime.`
          : `No problem. You're seeing plans in ${city} and can still browse everything.`
      )
      setPhase('denied')
      return
    }

    setMessage("We couldn't get your location right now.")
    setPhase('error')
  }

  if (phase === 'hidden') {
    return null
  }

  const resolved = phase === 'done' || phase === 'denied'

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="location-prompt-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') (resolved ? close : notNow)()
      }}
      className="mb-5 rounded-2xl border border-border bg-surface-2 p-4 shadow-xl shadow-black/20 xl:fixed xl:right-6 xl:top-[104px] xl:z-30 xl:mb-0 xl:w-[360px]"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            phase === 'done' ? 'bg-mint text-bg' : 'bg-mint-soft text-mint'
          }`}
        >
          {phase === 'done' ? (
            <CheckIcon className="h-5 w-5" />
          ) : (
            <MapPinIcon className="h-5 w-5" />
          )}
        </span>

        <div className="min-w-0 flex-1" role={resolved ? 'status' : undefined}>
          <h2 id="location-prompt-title" className="text-[15px] font-bold leading-snug">
            {phase === 'done'
              ? 'Location enabled'
              : phase === 'denied'
                ? 'Location not shared'
                : 'Find plans happening near you'}
          </h2>

          <p className="mt-1 text-sm leading-relaxed text-muted">
            {phase === 'ask' || phase === 'locating'
              ? 'Share your location to discover public activities, people and plans around you.'
              : message}
          </p>
        </div>

        {resolved && (
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {!resolved && (
        <div className="mt-4 flex items-center gap-2 pl-[52px]">
          <button
            type="button"
            onClick={share}
            disabled={phase === 'locating'}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-bold text-bg transition-[background-color,transform] duration-150 hover:bg-mint/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:cursor-wait disabled:opacity-70"
          >
            {phase === 'locating' && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />
            )}
            {phase === 'locating'
              ? 'Locating…'
              : phase === 'error'
                ? 'Try again'
                : 'Share location'}
          </button>

          <button
            type="button"
            onClick={notNow}
            disabled={phase === 'locating'}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      )}
    </section>
  )
}
