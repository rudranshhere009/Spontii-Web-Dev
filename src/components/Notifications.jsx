import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { BellIcon } from './NavIcons'
import logo from '../assets/logo.png'

const POLL_INTERVAL_MS = 30_000
const TOAST_DURATION_MS = 6500
const EMPTY_NOTIFICATIONS = []

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState(null)
  const [toasts, setToasts] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [points, setPoints] = useState(null)
  const [claimingPoints, setClaimingPoints] = useState(false)
  const removingIdsInFlight = useRef(new Set())
  const knownIds = useRef(new Set())
  const toastedIds = useRef(new Set())
  const initialized = useRef(false)
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const timers = useRef(new Map())
  const showToast = useCallback((item) => {
    const id = String(item.id)
    if (toastedIds.current.has(id)) return
    toastedIds.current.add(id)
    setToasts((previous) => [item, ...previous].slice(0, 3))
    if (item.type === 'hosted_event') return
    const previousTimer = timers.current.get(id)
    if (previousTimer) window.clearTimeout(previousTimer)
    timers.current.set(id, window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => String(toast.id) !== id))
      timers.current.delete(id)
    }, TOAST_DURATION_MS))
  }, [])

  const loadPoints = useCallback(async () => {
    try {
      const result = await apiRequest('/points')
      setPoints(result)
      setError('')
    } catch (loadError) {
      console.error('Failed to load Spontii points:', loadError)
      setError('Spontii points could not be loaded. Please try again.')
    }
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const result = await apiRequest('/notifications')
      const items = result.notifications
      const itemIds = new Set(items.map((item) => String(item.id)))

      setNotifications(items)
      setError('')

      const createdIds = new Set(result.createdIds.map(String))
      const newItems = initialized.current
        ? items.filter((item) => !knownIds.current.has(String(item.id)))
        : items.filter((item) => createdIds.has(String(item.id)))
      newItems.forEach(showToast)

      knownIds.current = itemIds
      initialized.current = true
    } catch (loadError) {
      console.error('Failed to load notifications:', loadError)
      setError('Notifications could not be loaded. Please try again.')
    }
  }, [showToast])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadPoints, 0)
    window.addEventListener('spontii:points-updated', loadPoints)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener('spontii:points-updated', loadPoints)
    }
  }, [loadPoints])

  useEffect(() => {
    const timeoutHandles = timers.current
    const initialLoad = window.setTimeout(loadNotifications, 0)
    const interval = window.setInterval(loadNotifications, POLL_INTERVAL_MS)

    function onNotificationCreated(event) {
      const notification = event.detail
      if (notification?.id) showToast(notification)
      loadNotifications()
    }
    function onNotificationRemoved(event) {
      const id = String(event.detail?.id ?? '')
      setNotifications((previous) =>
        previous?.filter((item) => String(item.id) !== id) ?? previous,
      )
      setToasts((previous) => previous.filter((item) => String(item.id) !== id))
      const timer = timers.current.get(id)
      if (timer) window.clearTimeout(timer)
      timers.current.delete(id)
    }

    window.addEventListener('spontii:notification-created', onNotificationCreated)
    window.addEventListener('spontii:notification-removed', onNotificationRemoved)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      window.removeEventListener('spontii:notification-created', onNotificationCreated)
      window.removeEventListener('spontii:notification-removed', onNotificationRemoved)
      for (const timer of timeoutHandles.values()) window.clearTimeout(timer)
      timeoutHandles.clear()
    }
  }, [loadNotifications, showToast])

  const notificationList = notifications ?? EMPTY_NOTIFICATIONS
  const visibleNotificationLimit = 4
  const hasScrollableNotifications = notificationList.length > visibleNotificationLimit

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event) {
      if (
        !panelRef.current?.contains(event.target) &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function removeNotification(id) {
    const key = String(id)
    if (removingIdsInFlight.current.has(key)) return
    removingIdsInFlight.current.add(key)

    try {
      await apiRequest(`/notifications/${id}`, { method: 'DELETE' })
      setNotifications((previous) => previous.filter((item) => item.id !== id))
      setToasts((previous) => previous.filter((item) => item.id !== id))
      const timer = timers.current.get(id)
      if (timer) window.clearTimeout(timer)
      timers.current.delete(id)
    } catch (removeError) {
      console.error('Failed to remove notification:', removeError)
      setError('Could not remove this notification. Please try again.')
    } finally {
      removingIdsInFlight.current.delete(key)
    }
  }

  async function claimDailyPoints() {
    if (claimingPoints) return
    setClaimingPoints(true)
    setError('')
    try {
      const result = await apiRequest('/points/daily-claim', { method: 'POST' })
      setPoints((previous) => previous ? {
        ...previous,
        balance: result.balance,
        dailyClaimAvailable: false,
      } : previous)
      setNotifications((previous) =>
        previous?.filter((item) => item.type !== 'daily_points_claim') ?? previous,
      )
      setToasts((previous) => previous.filter((item) => item.type !== 'daily_points_claim'))
      window.dispatchEvent(new Event('spontii:points-updated'))
    } catch (claimError) {
      console.error('Failed to claim daily Spontii points:', claimError)
      setError(claimError.message || 'Could not claim daily Spontii points.')
      loadNotifications()
      loadPoints()
    } finally {
      setClaimingPoints(false)
    }
  }

  async function openNotification(item) {
    try {
      await apiRequest(`/notifications/${item.id}/read`, { method: 'PATCH' })
      setNotifications((previous) =>
        previous.map((notification) =>
          notification.id === item.id
            ? { ...notification, readAt: notification.readAt || new Date().toISOString() }
            : notification,
        ),
      )
      setOpen(false)
      setToasts((previous) => previous.filter((toast) => toast.id !== item.id))
      const timer = timers.current.get(item.id)
      if (timer) window.clearTimeout(timer)
      timers.current.delete(item.id)
      if (item.route) navigate(item.route)
    } catch (openError) {
      console.error('Failed to open notification:', openError)
      setError('Could not open this notification. Please try again.')
    }
  }

  function dismissToast(id) {
    const item = toasts.find((notification) => String(notification.id) === String(id))
    if (item?.type === 'hosted_event') return
    setToasts((previous) => previous.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }

  const unreadCount = notificationList.filter((item) => !item.readAt).length

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:bg-surface-3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <BellIcon className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-mint px-1 text-[9px] font-extrabold text-bg">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {open && createPortal(
          <div className="notification-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-4 py-6">
            <section
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="notifications-title"
              className="flex h-[34.375rem] max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-surface-2 shadow-2xl"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="notification-logo-frame flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface p-1.5">
                    <img src={logo} alt="" className="h-full w-full object-contain" />
                  </span>
                  <h2 id="notifications-title" className="min-w-0 text-sm font-extrabold sm:text-base">
                    Notifications <span className="font-medium text-muted">- {unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</span>
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {points && (
                    <span className="rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1.5 text-[10px] font-bold text-mint">
                      {points.balance} points
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close notifications"
                    className="notification-close-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-mint/50 hover:bg-mint/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
                  >
                    <span aria-hidden="true" className="notification-close-icon text-lg leading-none">×</span>
                  </button>
                </div>
              </header>

              <div
                className={`notification-list-scroll h-[29.5rem] min-h-0 space-y-2.5 overflow-y-auto p-3 sm:p-4 ${
                  hasScrollableNotifications ? 'is-scrollable' : ''
                }`}
              >
                {error && (
                  <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-danger">
                    {error}
                  </p>
                )}
                {notifications === null && !error && (
                  <p className="py-8 text-center text-sm text-muted">Loading notifications…</p>
                )}
                {notifications !== null && notificationList.length === 0 && !error && (
                  <div className="flex min-h-full translate-y-3 flex-col items-center justify-center text-center">
                    <span className="notification-logo-frame flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface p-2">
                      <img src={logo} alt="" className="h-full w-full object-contain opacity-80" />
                    </span>
                    <p className="mt-3 text-sm font-semibold">You’re all caught up.</p>
                    <p className="mt-1 text-xs text-muted">Your Spontii updates will appear here.</p>
                  </div>
                )}
                {notificationList.map((item) => (
                  <article
                    key={item.id}
                    data-notification-card
                    className={`${item.type === 'hosted_event' ? 'min-h-[8rem]' : 'min-h-[7.25rem]'} rounded-2xl border p-3 transition-colors sm:p-3.5 ${
                      item.readAt
                        ? 'border-border bg-surface'
                        : 'border-mint/25 bg-mint/[0.06]'
                    }`}
                  >
                    <div className="flex items-stretch gap-3">
                      <span className="notification-logo-frame mt-0.5 flex h-10 w-10 shrink-0 self-start items-center justify-center rounded-xl border border-border bg-surface p-1.5">
                        <img src={logo} alt="" className="h-full w-full object-contain" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="line-clamp-1 min-w-0 flex-1 text-sm font-bold text-text">{item.title}</h3>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {item.route && item.type !== 'hosted_event' && (
                              <button
                                type="button"
                                onClick={() => openNotification(item)}
                                className="rounded-md bg-mint px-2.5 py-1.5 text-xs font-bold leading-4 text-bg transition hover:bg-mint/90"
                              >
                                Open
                              </button>
                            )}
                            {item.type === 'daily_points_claim' && (
                              <button
                                type="button"
                                onClick={claimDailyPoints}
                                disabled={claimingPoints}
                                className="rounded-md bg-mint px-2.5 py-1.5 text-xs font-bold leading-4 text-bg transition hover:bg-mint/90 disabled:cursor-wait disabled:opacity-60"
                              >
                                {claimingPoints ? 'Claiming…' : 'Claim +20'}
                              </button>
                            )}
                            {!['hosted_event', 'daily_points_claim'].includes(item.type) && (
                              <button
                                type="button"
                                onClick={() => removeNotification(item.id)}
                                aria-label={`Close ${item.title}`}
                                className="rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-bold leading-4 text-white transition hover:bg-red-600"
                              >
                                Close
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 break-words text-sm leading-5 text-muted">{item.message}</p>
                        <div className={`mt-auto flex items-end justify-between gap-3 ${item.type === 'hosted_event' ? 'pt-3' : ''}`}>
                          <p className="pt-1.5 text-[11px] text-muted-2">
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                          {item.type === 'hosted_event' && item.route && (
                            <button
                              type="button"
                              onClick={() => openNotification(item)}
                              className="shrink-0 rounded-md bg-mint px-3 py-1.5 text-xs font-bold leading-4 text-bg transition hover:bg-mint/90"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>,
          document.body,
        )}
      </div>

      {createPortal(<div
        className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:top-6"
        aria-live="polite"
        aria-label="New notifications"
      >
        {toasts.map((item) => (
          <article key={item.id} className="notification-toast pointer-events-auto rounded-2xl border border-border bg-surface-2 p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="notification-logo-frame flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface p-1.5">
                <img src={logo} alt="" className="h-full w-full object-contain" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-mint">{item.title}</p>
                <div className="mt-2 flex justify-end gap-2">
                  {item.route && (
                    <button
                      type="button"
                      onClick={() => openNotification(item)}
                      className="rounded-lg bg-mint px-3 py-1.5 text-xs font-bold text-bg"
                    >
                      Open
                    </button>
                  )}
                  {item.type !== 'hosted_event' && (
                    <button
                      type="button"
                      onClick={() => dismissToast(item.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>, document.body)}
    </>
  )
}
