import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { apiRequest } from '../lib/api'

import AvatarStack from '../components/AvatarStack'
import { GuestJoinDialog, RequestSentDialog } from '../components/JoinDialogs'
import {
  genderPreferenceLabel,
  genderPreferenceOf,
  isPrivateActivity,
} from '../lib/activities'

import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  UsersIcon,
  ChatIcon,
  ShieldCheckIcon,
  HeartIcon,
  ShareIcon,
  NavigationIcon,
  CheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  LockIcon,
} from '../components/NavIcons'

export default function ActivityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  const {
    activities,
    currentUser,
    city,
    guest,
    createGuest,
    requestToJoin,
    getParticipation,
    getVisibleLocation,
    completeActivity,
    refreshServerActivities,
  } = useApp()

  const [shareState, setShareState] = useState(null)
  const [requestError, setRequestError] = useState(null)
  const [completionError, setCompletionError] = useState('')
  const [completing, setCompleting] = useState(false)
  // 'guest' (ask a logged-out visitor's first name) | 'sent' | null
  const [dialog, setDialog] = useState(null)
  const [attendeesOpen, setAttendeesOpen] = useState(false)
  const [attendees, setAttendees] = useState([])
  const [attendeeLoading, setAttendeeLoading] = useState(false)
  const [attendeeError, setAttendeeError] = useState('')
  const [requestsOpen, setRequestsOpen] = useState(false)
  const [joinRequests, setJoinRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [reviewingRequest, setReviewingRequest] = useState('')
  const [requestListError, setRequestListError] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState('')
  // Focus target after a dialog closes (the action card shows the new status)
  const actionCardRef = useRef(null)

  /*
   * Go back only if there is in-app history (React Router stores the
   * history index); a shared/direct link falls back to Explore.
   */
  function goBack() {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1)
    } else {
      navigate('/explore')
    }
  }

  const activity = activities.find(
    (a) => a.id === id
  )
  const participation = activity ? getParticipation(activity.id) : null
  const hosting = participation?.status === 'hosting'
  const approved = participation?.status === 'going'
  const canUseLiveChat = Boolean(activity?.databaseBacked && (hosting || approved))

  useEffect(() => {
    if (!chatOpen || !canUseLiveChat) return undefined
    let active = true
    const loadMessages = async () => {
      try {
        const { messages } = await apiRequest(`/activities/${id}/chat`)
        if (active && Array.isArray(messages)) setChatMessages(messages)
        if (active) setChatError('')
      } catch (error) {
        if (active) setChatError(error.message)
      } finally {
        if (active) setChatLoading(false)
      }
    }
    loadMessages()
    const interval = window.setInterval(loadMessages, 4000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [id, chatOpen, canUseLiveChat])

  /* =========================================================
     PLAN NOT FOUND
  ========================================================= */

  if (!activity) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">

        <h1 className="text-2xl font-bold">
          Plan not found
        </h1>

        <p className="mt-2 text-muted">
          This plan may have wrapped up or been removed.
        </p>

        <Link
          to="/explore"
          className="mt-6 inline-block rounded-full bg-mint px-5 py-2.5 font-bold text-bg"
        >
          Back to Explore
        </Link>

      </div>
    )
  }

  /* =========================================================
     REQUEST STATUS
  ========================================================= */

  const { status, spotsLeft } = participation

  const pending = status === 'pending'

  const isApproved = status === 'going'

  const rejected = status === 'rejected'

  const isHosting = status === 'hosting'

  /* =========================================================
     CAPACITY

     activity.going already includes approved applicants.
     A pending request does not consume a confirmed spot.
  ========================================================= */

  const isFull =
    participation.isFull && !isApproved && !isHosting

  /* =========================================================
     LOCATION PRIVACY

     Host + confirmed participants: exact venue.
     Everyone else: approximate area only.
  ========================================================= */

  const visibleLocation =
    getVisibleLocation(activity.id)

  const locationIsApproximate =
    !visibleLocation.precise

  /* =========================================================
     REQUEST HANDLER

     - Members: request → host approval (unchanged).
     - Logged out, public plan: request as this device's guest
       (first name only); same host approval.
     - Logged out, private plan: log in / sign up first, then
       come back to this plan.
     The confirmation only opens when a new request was saved.
  ========================================================= */

  const isPrivate = isPrivateActivity(activity)
  const restricted = Boolean(activity.restricted)
  const preference = genderPreferenceOf(activity)
  const loginState = {
    from: location,
    notice: isPrivate
      ? 'Create an account or log in to request to join this private plan.'
      : 'Log in to request to join this plan with your Spontii profile.',
  }

  async function sendRequest(applicant) {
    const result = await requestToJoin(activity.id, applicant)

    if (!result?.success) {
      setRequestError(result?.message || 'Could not send request.')
      return
    }

    setRequestError(null)
    setDialog(result.created ? 'sent' : null)
  }

  function handleRequest() {
    if (hosting || pending || approved || isFull) {
      return
    }

    if (isAuthenticated) {
      void sendRequest()
      return
    }

    if (activity.databaseBacked) {
      navigate('/login', { state: loginState })
      return
    }

    if (isPrivate) {
      navigate('/login', { state: loginState })
      return
    }

    if (guest) {
      void sendRequest(guest)
    } else {
      setDialog('guest')
    }
  }

  function submitGuest(name) {
    const nextGuest = createGuest(name)

    if (nextGuest) {
      void sendRequest(nextGuest)
    }
  }

  async function handleCompleteActivity() {
    if (!activity.isHost || completing) return
    setCompleting(true)
    setCompletionError('')
    try {
      await completeActivity(activity.id)
      navigate('/')
    } catch (error) {
      setCompletionError(error.message)
    } finally {
      setCompleting(false)
    }
  }

  /* =========================================================
     DIRECTIONS

     Only available once the exact venue is visible.
  ========================================================= */

  const canGetDirections =
    visibleLocation.precise && Boolean(visibleLocation.venue)

  function openDirections() {
    if (!canGetDirections) {
      return
    }

    const query = encodeURIComponent(
      [visibleLocation.venue, visibleLocation.area, city]
        .filter(Boolean)
        .filter((part, index, all) => all.indexOf(part) === index)
        .join(', ')
    )

    window.open(
      `https://www.google.com/maps/search/?api=1&query=${query}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  /* =========================================================
     SHARE
  ========================================================= */

  const handleShare = async () => {
    const url = window.location.href

    if (navigator.share) {
      try {
        await navigator.share({
          title: activity.title,
          url,
        })
        setShareState('shared')
        return
      } catch (error) {
        if (error?.name === 'AbortError') {
          return
        }
        // Fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setShareState('copied')
    } catch {
      setShareState('error')
    }
  }

  async function openAttendees() {
    setAttendeesOpen(true)
    setAttendeeError('')
    if (activity.databaseBacked && !canUseLiveChat) {
      setAttendees([])
      setAttendeeError('Attendee profiles are shared with the host and approved participants.')
      return
    }
    setAttendeeLoading(true)
    try {
      if (activity.databaseBacked) {
        const { attendees: rows } = await apiRequest(`/activities/${activity.id}/attendees`)
        setAttendees(rows || [])
      } else {
        setAttendees(activity.going || [])
      }
    } catch (error) {
      setAttendeeError(error.message)
    } finally {
      setAttendeeLoading(false)
    }
  }

  async function openJoinRequests() {
    setRequestsOpen(true)
    setRequestsLoading(true)
    setRequestListError('')
    try {
      const { requests: rows } = await apiRequest(`/activities/${activity.id}/requests`)
      setJoinRequests(rows || [])
    } catch (error) {
      setRequestListError(error.message)
    } finally {
      setRequestsLoading(false)
    }
  }

  async function reviewJoinRequest(requestId, action) {
    setReviewingRequest(requestId)
    setRequestListError('')
    try {
      await apiRequest(`/activities/${activity.id}/requests/${requestId}`, {
        method: 'PATCH',
        body: { action },
      })
      setJoinRequests((current) => current.filter((item) => item.id !== requestId))
      refreshServerActivities().catch((error) =>
        console.error('Failed to refresh events after reviewing a join request:', error),
      )
    } catch (error) {
      setRequestListError(error.message)
    } finally {
      setReviewingRequest('')
    }
  }

  async function sendChatMessage(event) {
    event.preventDefault()
    const text = chatDraft.trim()
    if (!text || chatSending) return
    setChatSending(true)
    setChatError('')
    try {
      const { message } = await apiRequest(`/activities/${activity.id}/chat`, {
        method: 'POST',
        body: { text },
      })
      setChatDraft('')
      setChatMessages((current) => [...current, {
        ...message,
        sender: { id: currentUser.id, name: currentUser.name },
      }])
      apiRequest(`/activities/${activity.id}/chat`)
        .then(({ messages }) => setChatMessages(messages || []))
        .catch((error) => console.error('Failed to refresh event live chat:', error))
    } catch (error) {
      setChatError(error.message)
    } finally {
      setChatSending(false)
    }
  }

  return (
    <div className="wide-screen-container mx-auto max-w-[1600px] space-y-8 px-6 py-8">

      {/* =====================================================
          BACK
      ===================================================== */}

      <button
        type="button"
        onClick={goBack}
        className="flex w-fit items-center gap-2 rounded-full border border-emerald-500 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />

        Back to Explore
      </button>


      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

        {/* ===================================================
            LEFT CONTENT
        =================================================== */}

        <div className="lg:col-span-2">

          {/* =================================================
              HERO IMAGE
          ================================================= */}

          <div data-theme="dark" className="relative overflow-hidden rounded-2xl">

            <img
              src={activity.image}
              alt={activity.title}
              className="h-64 w-full object-cover sm:h-80 lg:h-[26rem]"
            />

            {/* IMAGE BADGES */}

            <div className="absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-4">

              {activity.badge && (
                <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-mint backdrop-blur">
                  {activity.badge}
                </span>
              )}

              {activity.vibe?.map((v) => (
                <span
                  key={v}
                  className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-text backdrop-blur"
                >
                  {v} vibe
                </span>
              ))}

            </div>

          </div>


          {/* =================================================
              TITLE
          ================================================= */}

          <h1 className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight">
            <span className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white sm:text-sm">
              Event Name
            </span>
            <span className="text-sm font-semibold text-white">-</span>
            <span className="ml-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              {activity.title}
            </span>
          </h1>


          {/* =================================================
              DATE / TIME / LOCATION
          ================================================= */}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-muted">

            <span className="flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4 shrink-0" />

              <span>
                {activity.date}
              </span>
            </span>


            <span className="flex items-center gap-1.5">
              <ClockIcon className="h-4 w-4 shrink-0" />

              <span>
                {activity.time}
              </span>
            </span>


            <span className="flex items-center gap-1.5">

              <MapPinIcon className="h-4 w-4 shrink-0" />

              <span>
                {visibleLocation.value}
                {activity.distance
                  ? ` · ${activity.distance}`
                  : ''}
              </span>

            </span>

          </div>


          {/* =================================================
              LOCATION PRIVACY NOTE
          ================================================= */}

          {locationIsApproximate && (
            <p className="mt-2 text-xs text-muted">
              Approximate area shown until you’re approved.
            </p>
          )}


          {/* =================================================
              HOST + TRUST
          ================================================= */}

          <div className="mt-6 flex items-center gap-3">

            {activity.host.avatar ? (
              <img
                src={activity.host.avatar}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span aria-label="No host profile photo" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-3 text-xl">👤</span>
            )}

            <div className="min-w-0">

              <p className="truncate text-sm text-muted">
                Hosted by{' '}
                <span className="font-semibold text-text">
                  {activity.host.name}
                </span>
              </p>

              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {activity.host.verified && (
                  <span className="flex items-center gap-1 text-mint">
                    <ShieldCheckIcon className="h-3.5 w-3.5" />
                    Verified host
                  </span>
                )}

                {activity.host.reliability != null && (
                  <span>
                    {activity.host.reliability}% show-up reliability
                  </span>
                )}
              </p>

            </div>

          </div>


          {/* =================================================
              GOING + VIBE MATCHES + SHARE
          ================================================= */}

          <div className="mt-6 flex flex-wrap items-center gap-4 border-b border-border pb-6">

            <button
              type="button"
              onClick={openAttendees}
              className="flex items-center gap-2 text-sm font-semibold transition hover:text-mint"
              aria-label={`View attendees, ${activity.attendeeCount ?? activity.going.length} of ${activity.capacity} going`}
            >
              <UsersIcon className="h-4 w-4 text-mint" />
              {activity.attendeeCount ?? activity.going.length} / {activity.capacity} going
            </button>


            {activity.vibeMatches > 0 && (
              <span className="flex items-center gap-2 text-sm font-semibold text-mint">

                <HeartIcon className="h-4 w-4" />

                {activity.vibeMatches}{' '}
                people you may vibe with

              </span>
            )}


            <button
              type="button"
              onClick={handleShare}
              className="ml-auto flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-text/5"
            >

              <ShareIcon className="h-4 w-4" />

              Share

            </button>

            {activity.databaseBacked && activity.isHost && (
              <button
                type="button"
                onClick={openJoinRequests}
                className="flex items-center gap-2 rounded-full border border-mint/40 bg-mint-soft px-3.5 py-2 text-sm font-bold text-mint transition hover:bg-mint/15"
              >
                <UsersIcon className="h-4 w-4" />
                Requests
                <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-mint px-1 text-[11px] font-extrabold text-bg">
                  {activity.pendingRequestCount || 0}
                </span>
              </button>
            )}

            {shareState && (
              <span
                role="status"
                className={`w-full text-right text-xs ${
                  shareState === 'error' ? 'text-danger' : 'text-mint'
                }`}
              >
                {shareState === 'copied'
                  ? 'Link copied to clipboard.'
                  : shareState === 'shared'
                    ? 'Shared.'
                    : "Couldn't share. Copy the link from your address bar."}
              </span>
            )}

          </div>


          {/* =================================================
              WHO'S GOING
          ================================================= */}

          <div className="mt-6">

            <h2 className="text-xs font-bold uppercase tracking-widest text-mint">
              The best part
            </h2>

            <h3 className="mt-1 text-2xl font-extrabold">
              Who's going?
            </h3>


            {restricted ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted">
                <LockIcon className="h-4 w-4 shrink-0 text-mint" />
                {activity.attendeeCount ?? activity.going.length}{' '}
                {(activity.attendeeCount ?? activity.going.length) === 1 ? 'person is' : 'people are'}{' '}
                going. Log in to see who.
              </p>
            ) : activity.databaseBacked && !hosting && !approved ? (
              <button
                type="button"
                onClick={openAttendees}
                className="mt-4 text-left text-sm text-muted transition hover:text-mint"
              >
                {activity.attendeeCount ?? 1} {((activity.attendeeCount ?? 1) === 1) ? 'person is' : 'people are'} going. Get approved to view attendee profiles.
              </button>
            ) : (
            <div className="mt-4 flex flex-wrap items-center gap-4">

              {activity.databaseBacked ? (
                <button type="button" onClick={openAttendees} className="rounded-full focus:outline-none focus:ring-2 focus:ring-mint">
                  <AvatarStack people={activity.going} max={8} size={40} />
                </button>
              ) : (
                <AvatarStack people={activity.going} max={8} size={40} />
              )}


              <p className="text-sm text-muted">

                {activity.going
                  .slice(0, 3)
                  .map(
                    (p) =>
                      (p.name || 'Someone').split(' ')[0]
                  )
                  .join(', ')}

                {activity.going.length > 3
                  ? ` and ${
                      activity.going.length - 3
                    } ${
                      activity.going.length - 3 === 1
                        ? 'other'
                        : 'others'
                    }`
                  : ''}{' '}

                {activity.going.length === 1 ? 'is already in.' : 'are already in.'}

              </p>

            </div>
            )}

          </div>


          {/* =================================================
              ABOUT
          ================================================= */}

          <div className="mt-8 rounded-3xl border border-border bg-surface-2 p-4 shadow-sm sm:p-6">

            <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mint">The details</p>
                <h3 className="mt-1 text-xl font-extrabold">About this plan</h3>
              </div>
              {activity.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activity.tags.filter((tag) => tag !== 'New event').map((tag) => (
                    <span key={tag} className="rounded-full bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-red-900/70 bg-red-950/55 p-3.5">
              <p className="text-xs font-extrabold uppercase tracking-wide text-red-200">Details</p>
              <p className="mt-1.5 text-sm font-bold leading-relaxed text-white">{activity.description}</p>
            </div>

            {(activity.venueName || activity.landmark) && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {activity.venueName && (
                  <div className="rounded-xl border border-mint/25 bg-mint/5 p-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-mint">Venue</p>
                    <p className="mt-1.5 break-words text-sm font-bold leading-relaxed text-text">{activity.venueName}</p>
                  </div>
                )}
                {activity.landmark && (
                  <div className="rounded-xl border border-mint/25 bg-mint/5 p-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-mint">Landmark</p>
                    <p className="mt-1.5 break-words text-sm font-bold leading-relaxed text-text">{activity.landmark}</p>
                  </div>
                )}
              </div>
            )}

            {(activity.attendeePreference || activity.experienceLevel || activity.preferences?.length > 0) && (
              <div className="mt-4 rounded-xl border border-border bg-bg/35 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Guest preferences</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activity.attendeePreference && activity.attendeePreference !== 'Anyone' && (
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text">
                      {activity.attendeePreference}
                    </span>
                  )}
                  {activity.experienceLevel && activity.experienceLevel !== 'Any experience' && (
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text">
                      {activity.experienceLevel}
                    </span>
                  )}
                  {activity.preferences?.map((preference) => (
                    <span key={preference} className="rounded-full border border-border px-2.5 py-1 text-xs text-text">
                      {preference}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activity.startsAt && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-border px-3 py-1.5 text-xs text-muted">
                  Food · {activity.foodAvailable
                    ? activity.foodPreference === 'vegetarian'
                      ? 'Vegetarian'
                      : activity.foodPreference === 'non-vegetarian'
                        ? 'Non-vegetarian'
                        : activity.foodPreference === 'both'
                          ? 'Veg & non-veg'
                          : 'Available'
                    : 'Not provided'}
                </span>
                <span className="rounded-full border border-border px-3 py-1.5 text-xs text-muted">
                  Beverages · {activity.beveragesAvailable ? 'Available' : 'Not provided'}
                </span>
                <span className="rounded-full border border-border px-3 py-1.5 text-xs text-muted">
                  Alcoholic drinks · {activity.drinksAvailable ? 'Available' : 'Not provided'}
                </span>
              </div>
            )}

            {(activity.photos?.length > 0 || activity.videos?.length > 0) && (
              <section className="mt-5 rounded-2xl border border-border bg-bg/45 p-3.5 sm:p-4" aria-label="Event gallery">
                <header className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-text">Event gallery</h4>
                    <p className="mt-0.5 text-xs text-muted">Photos and videos shared by the host</p>
                  </div>
                  <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold text-muted">
                    {activity.photos?.length || 0} photos · {activity.videos?.length || 0} videos
                  </span>
                </header>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {activity.photos?.map((photo, index) => (
                    <a
                      key={photo}
                      href={photo}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open host photo ${index + 1}`}
                      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface"
                    >
                      <img
                        src={photo}
                        alt={`Host-shared event ${index + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    </a>
                  ))}
                  {activity.videos?.map((video, index) => (
                    <video
                      key={video}
                      src={video}
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={`Host-shared event video ${index + 1}`}
                      className="aspect-[4/3] w-full rounded-xl border border-border bg-black object-cover"
                    />
                  ))}
                </div>
              </section>
            )}

            {activity.durationMinutes > 0 && (
              <p className="mt-3 text-xs text-muted">
                Duration: {Math.floor(activity.durationMinutes / 60)} hr
                {activity.durationMinutes % 60
                  ? ` ${activity.durationMinutes % 60} min`
                  : ''}
              </p>
            )}

            {activity.coordinates && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${activity.coordinates[0]}&mlon=${activity.coordinates[1]}#map=16/${activity.coordinates[0]}/${activity.coordinates[1]}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-mint hover:underline"
              >
                <MapPinIcon className="h-3.5 w-3.5" />
                Open venue map
              </a>
            )}

          </div>

        </div>


        {/* ===================================================
            RIGHT SIDEBAR
        =================================================== */}

        <div className="space-y-5">

          {/* =================================================
              MAIN ACTION CARD
          ================================================= */}

          <div
            ref={actionCardRef}
            tabIndex={-1}
            className="rounded-2xl border border-border bg-surface-2 p-5 outline-none"
          >

            {/* =================================================
                DETAILS
            ================================================= */}

            <div className="space-y-3 rounded-xl bg-surface p-4 text-sm">

              <Row
                label="When"
                value={`${activity.date} · ${activity.time}`}
              />


              <Row
                label="Where"
                value={visibleLocation.value}
              />


              <Row
                label="Who it's for"
                value={genderPreferenceLabel(activity)}
              />


              <Row
                label="Spots"
                value={
                  spotsLeft > 0
                    ? `${spotsLeft} left`
                    : 'Full'
                }
                valueClass={
                  spotsLeft <= 3
                    ? 'text-warning'
                    : ''
                }
              />

            </div>

            {activity.isHost && (
              <div className="mt-4 rounded-xl border border-mint/25 bg-mint-soft p-4">
                <p className="text-sm font-bold text-text">Hosting this event?</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Complete it when it’s over to remove it from your homepage and clear its event notification.
                </p>
                <button
                  type="button"
                  onClick={handleCompleteActivity}
                  disabled={completing}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-mint/40 bg-mint px-3 text-xs font-bold text-bg transition hover:bg-mint/90 disabled:cursor-wait disabled:opacity-60"
                >
                  <CheckIcon className="h-4 w-4" />
                  {completing ? 'Completing event…' : 'Complete activity & close'}
                </button>
                {completionError && (
                  <p role="alert" className="mt-2 text-xs font-semibold text-danger">{completionError}</p>
                )}
              </div>
            )}


            {preference !== 'any' && !hosting && !approved && (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                The host would like this plan to be for{' '}
                <span className="font-semibold text-text">{preference}</span>.
                Anyone can still send a request; the host reviews each one.
              </p>
            )}

            {/* =================================================
                REQUEST TO JOIN
            ================================================= */}

            <button
              type="button"
              onClick={handleRequest}
              disabled={
                hosting ||
                approved ||
                pending ||
                isFull
              }
              className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
                hosting || approved
                  ? 'cursor-default border border-mint bg-mint-soft text-mint'
                  : pending
                    ? 'cursor-default border border-border bg-surface-3 text-muted'
                    : isFull
                      ? 'cursor-not-allowed bg-surface-3 text-muted'
                      : 'bg-mint text-bg hover:bg-mint/90'
              }`}
            >

              {hosting ? (
                <>
                  <ShieldCheckIcon className="h-4 w-4" />

                  You're hosting this plan
                </>
              ) : approved ? (
                <>
                  <CheckIcon className="h-4 w-4" />

                  You're going
                </>
              ) : pending ? (
                <>
                  <ClockIcon className="h-4 w-4" />

                  Request pending
                </>
              ) : isFull ? (
                'Plan is full'
              ) : rejected ? (
                <>
                  Request again

                  <ArrowRightIcon className="h-4 w-4" />
                </>
              ) : (
                <>
                  Request to Join

                  <ArrowRightIcon className="h-4 w-4" />
                </>
              )}

            </button>


            {!isAuthenticated && isPrivate && !requestError && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <LockIcon className="h-3.5 w-3.5 shrink-0 text-mint" />
                Private plan: you'll need an account to request to join.
              </p>
            )}

            {!isAuthenticated && activity.databaseBacked && !pending && !requestError && (
              <p className="mt-3 text-xs text-muted">
                Log in to send a join request with your Spontii profile.{' '}
                <Link to="/login" state={loginState} className="font-semibold text-mint hover:underline">
                  Log in
                </Link>
                .
              </p>
            )}

            {!isAuthenticated && !activity.databaseBacked && !isPrivate && !pending && !requestError && (
              <p className="mt-3 text-xs text-muted">
                No account needed. You can request as a guest, or{' '}
                <Link to="/login" state={loginState} className="font-semibold text-mint hover:underline">
                  log in
                </Link>
                .
              </p>
            )}

            {requestError && (
              <p role="alert" className="mt-3 text-xs font-semibold text-danger">
                {requestError}
              </p>
            )}


            {/* =================================================
                PENDING REQUEST MESSAGE
            ================================================= */}

            {pending && (
              <div className="mt-4 rounded-xl border border-mint/20 bg-mint-soft p-4">

                <div className="flex items-start gap-3">

                  <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />

                  <div>

                    <p className="text-sm font-semibold text-text">
                      Request sent
                    </p>


                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      Your request is waiting for the host.
                      {isAuthenticated
                        ? ' They can review your profile, verification and reliability before approving you.'
                        : ' They can see the first name you shared before approving you.'}
                    </p>


                    <p className="mt-2 text-xs font-semibold text-muted">
                      You're not confirmed yet.
                    </p>

                  </div>

                </div>

              </div>
            )}


            {/* =================================================
                APPROVED MESSAGE
            ================================================= */}

            {approved && (
              <div className="mt-4 rounded-xl border border-mint/20 bg-mint-soft p-4">

                <div className="flex items-start gap-3">

                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />

                  <div>

                    <p className="text-sm font-semibold text-text">
                      You're confirmed
                    </p>

                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      The host approved your request.
                      Detailed meeting information is now
                      available to you.
                    </p>

                  </div>

                </div>

              </div>
            )}


            {/* =================================================
                REJECTED MESSAGE
            ================================================= */}

            {rejected && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">

                <p className="text-sm font-semibold text-text">
                  Request declined
                </p>

                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  The host didn't approve this request.
                  You can request to join again if you'd
                  still like to attend.
                </p>

              </div>
            )}


            {/* =================================================
                SECONDARY ACTIONS
            ================================================= */}

            <div className="mt-4 grid grid-cols-2 gap-2">

              <button
                type="button"
                onClick={() => {
                  if (!canUseLiveChat) return
                  if (!chatOpen) setChatLoading(true)
                  setChatOpen((open) => !open)
                }}
                disabled={!canUseLiveChat}
                title={!canUseLiveChat ? 'Live chat unlocks when the host approves you.' : undefined}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-text transition-colors hover:border-mint/40 hover:text-mint disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:text-text"
              >
                <ChatIcon className="h-4 w-4" />
                {chatOpen ? 'Close live chat' : 'Live chat'}
              </button>


              <button
                type="button"
                onClick={openDirections}
                disabled={!canGetDirections}
                title={
                  canGetDirections
                    ? undefined
                    : 'Directions unlock once the host confirms you.'
                }
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-text transition-colors hover:border-mint/40 hover:text-mint disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-text"
              >

                <NavigationIcon className="h-4 w-4" />

                Directions

              </button>

            </div>

            {!canGetDirections && (
              <p className="mt-2 text-xs text-muted">
                The exact meeting point and directions are shared once the host confirms you.
              </p>
            )}


            {/* =================================================
                SAFETY
            ================================================= */}

            {canUseLiveChat && chatOpen && (
              <section className="mt-5 flex h-[min(72vh,680px)] min-h-[540px] flex-col overflow-hidden rounded-2xl border border-mint/20 bg-surface-2 shadow-[0_18px_55px_rgba(0,0,0,0.2)]" aria-label="Event live chat">
                <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="relative grid h-10 w-10 place-items-center rounded-xl border border-mint/20 bg-mint/10">
                      <ChatIcon className="h-4 w-4 text-mint" />
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-mint" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-text">Live event chat</h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    aria-label="Close live chat"
                    className="rounded-lg border border-red-950 bg-red-900 px-3 py-1.5 text-xs font-bold text-white transition hover:border-red-800 hover:bg-red-800"
                  >
                    Close
                  </button>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto bg-bg/25 px-4 py-4" aria-live="polite">
                  {chatLoading && chatMessages.length === 0 && <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted">Loading the conversation…</p>}
                  {!chatLoading && chatMessages.length === 0 && (
                    <div className="flex h-full min-h-56 flex-col items-center justify-center px-5 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-mint/20 bg-mint/10 text-mint"><ChatIcon className="h-5 w-5" /></span>
                      <p className="mt-3 text-sm font-bold text-text">The conversation starts here</p>
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">Say hello to the other attendees and start planning the fun.</p>
                    </div>
                  )}
                  {chatMessages.map((message) => (
                    <article key={message.id} className="rounded-2xl border border-border/80 bg-surface px-3.5 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mint/10 text-[10px] font-extrabold text-mint">{(message.sender.name || '?').trim().charAt(0).toUpperCase()}</span>
                          <span className="truncate text-xs font-bold text-text">{message.sender.name}</span>
                        </span>
                        <time className="shrink-0 text-[10px] text-muted">
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </div>
                      <p className="mt-2 break-words pl-9 text-sm leading-relaxed text-muted">{message.text}</p>
                    </article>
                  ))}
                </div>
                {chatError && <p role="alert" className="mx-3 mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{chatError}</p>}
                <form onSubmit={sendChatMessage} className="flex gap-2 border-t border-border bg-surface p-3.5">
                  <input
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    maxLength={2000}
                    placeholder="Message the attendees…"
                    aria-label="Chat message"
                    className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/10"
                  />
                  <button
                    type="submit"
                    disabled={chatSending || !chatDraft.trim()}
                    className="rounded-xl bg-mint px-4 py-2.5 text-sm font-bold text-bg transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {chatSending ? 'Sending…' : 'Send'}
                  </button>
                </form>
              </section>
            )}

          </div>


          {/* =================================================
              FEEL THE FIT
          ================================================= */}

          {activity.vibeMatches > 0 && (
            <div className="rounded-2xl border border-border bg-surface-2 p-5">

              <h4 className="flex items-center gap-2 font-bold text-mint">

                <HeartIcon className="h-4 w-4" />

                Feel the fit?

              </h4>


              <p className="mt-2 text-sm text-muted">

                {activity.vibeMatches} people going share
                your interest in{' '}

                {activity.vibe[0]?.toLowerCase() ||
                  'this'}{' '}

                plans.

                That's usually a good sign.

              </p>

            </div>
          )}


        </div>

      </div>

      {dialog === 'guest' && (
        <GuestJoinDialog
          onClose={() => setDialog(null)}
          onSubmit={submitGuest}
          loginState={loginState}
          returnFocusRef={actionCardRef}
        />
      )}

      {dialog === 'sent' && (
        <RequestSentDialog
          onClose={() => setDialog(null)}
          returnFocusRef={actionCardRef}
        />
      )}

      {attendeesOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAttendeesOpen(false)
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="attendees-title" className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface-2 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="attendees-title" className="text-xl font-extrabold text-text">People going</h2>
                <p className="mt-1 text-sm text-muted">{activity.attendeeCount ?? activity.going.length} of {activity.capacity} spots filled</p>
              </div>
              <button type="button" onClick={() => setAttendeesOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-surface hover:text-text">Close</button>
            </div>
            {attendeeLoading && <p className="py-8 text-center text-sm text-muted">Loading attendee profiles…</p>}
            {attendeeError && <p role="alert" className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{attendeeError}</p>}
            {!attendeeLoading && !attendeeError && (
              <div className="mt-5 space-y-3">
                {attendees.map((person) => (
                  <article key={person.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint-soft text-sm font-bold text-mint">
                      {(person.name || 'S').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-text">{person.name}{person.id === activity.host.id ? <span className="ml-2 rounded-full bg-mint-soft px-2 py-0.5 text-[10px] font-bold uppercase text-mint">Host</span> : null}</p>
                      <p className="mt-0.5 text-xs text-muted">{person.tagline || person.city || 'Spontii member'}</p>
                      {person.bio && <p className="mt-2 text-sm leading-relaxed text-muted">{person.bio}</p>}
                    </div>
                  </article>
                ))}
                {attendees.length === 0 && <p className="py-6 text-center text-sm text-muted">No approved attendee profiles yet.</p>}
              </div>
            )}
          </section>
        </div>
      )}

      {requestsOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRequestsOpen(false)
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="requests-title" className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface-2 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="requests-title" className="text-xl font-extrabold text-text">Join requests</h2>
                <p className="mt-1 text-sm text-muted">Review profiles and choose who can attend.</p>
              </div>
              <button type="button" onClick={() => setRequestsOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-surface hover:text-text">Close</button>
            </div>
            {requestsLoading && <p className="py-8 text-center text-sm text-muted">Loading requests…</p>}
            {requestListError && <p role="alert" className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{requestListError}</p>}
            {!requestsLoading && !requestListError && joinRequests.length === 0 && (
              <p className="py-10 text-center text-sm text-muted">You’re all caught up. New requests will appear here.</p>
            )}
            {!requestsLoading && joinRequests.length > 0 && (
              <div className="mt-5 space-y-3">
                {joinRequests.map((item) => (
                  <article key={item.id} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mint-soft font-bold text-mint">
                        {(item.applicant.name || 'S').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-text">{item.applicant.name}</h3>
                          {item.applicant.verified && <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[10px] font-bold text-mint">Verified profile</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted">{item.applicant.tagline || item.applicant.city || 'Spontii member'}</p>
                        {item.applicant.bio && <p className="mt-2 text-sm leading-relaxed text-muted">{item.applicant.bio}</p>}
                        {!!item.applicant.tags?.length && <p className="mt-2 text-xs text-mint">{item.applicant.tags.join(' · ')}</p>}
                        <p className="mt-2 text-[11px] text-muted">Requested {new Date(item.requestedAt).toLocaleString()}</p>
                        <div className="mt-4 flex justify-end gap-2">
                          <button type="button" disabled={Boolean(reviewingRequest)} onClick={() => void reviewJoinRequest(item.id, 'reject')} className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted hover:border-danger/50 hover:text-danger disabled:opacity-50">Deny</button>
                          <button type="button" disabled={Boolean(reviewingRequest)} onClick={() => void reviewJoinRequest(item.id, 'approve')} className="rounded-lg bg-mint px-4 py-2 text-xs font-bold text-bg hover:bg-mint/90 disabled:opacity-50">{reviewingRequest === item.id ? 'Saving…' : 'Accept'}</button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

    </div>
  )
}


/* =========================================================
   DETAIL ROW
========================================================= */

function Row({
  label,
  value,
  valueClass = '',
}) {
  return (
    <div className="flex items-center justify-between gap-4">

      <span className="text-muted">
        {label}
      </span>

      <span
        className={`text-right font-semibold ${valueClass}`}
      >
        {value}
      </span>

    </div>
  )
}