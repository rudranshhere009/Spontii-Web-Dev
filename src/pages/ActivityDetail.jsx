import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

import AvatarStack from '../components/AvatarStack'
import LockedState from '../components/LockedState'

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
} from '../components/NavIcons'

export default function ActivityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  const {
    activities,
    city,
    requestToJoin,
    getParticipation,
    getVisibleLocation,
    isLockedActivity,
  } = useApp()

  const [shareState, setShareState] = useState(null)
  const [requestError, setRequestError] = useState(null)

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

  /* =========================================================
     PRIVATE PLAN, LOGGED OUT

     AppContext does not hand private plans to logged-out
     viewers at all; we only learn that this id is private so we
     can show the unlock prompt instead of "not found".
  ========================================================= */

  if (!activity && isLockedActivity(id)) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6">

        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-text"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Explore
        </button>

        <LockedState className="mt-8" />

      </div>
    )
  }

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

  const participation =
    getParticipation(activity.id)

  const { status, spotsLeft } = participation

  const pending = status === 'pending'

  const approved = status === 'going'

  const rejected = status === 'rejected'

  const hosting = status === 'hosting'

  /* =========================================================
     CAPACITY

     activity.going already includes approved applicants.
     A pending request does not consume a confirmed spot.
  ========================================================= */

  const isFull =
    participation.isFull && !approved && !hosting

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
  ========================================================= */

  function handleRequest() {
    if (hosting || pending || approved || isFull) {
      return
    }

    /*
     * Joining is a protected action: send logged-out visitors to log in,
     * then bring them back here to request.
     */
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } })
      return
    }

    const result = requestToJoin(activity.id)

    setRequestError(
      result?.success ? null : result?.message || 'Could not send request.'
    )
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-6 py-8">

      {/* =====================================================
          BACK
      ===================================================== */}

      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-text"
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

          <h1 className="mt-7 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {activity.title}
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

            <img
              src={activity.host.avatar}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />

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

            <span className="flex items-center gap-2 text-sm font-semibold">

              <UsersIcon className="h-4 w-4 text-mint" />

              {activity.going.length} /{' '}
              {activity.capacity} going

            </span>


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


            <div className="mt-4 flex flex-wrap items-center gap-4">

              <AvatarStack
                people={activity.going}
                max={8}
                size={40}
              />


              <p className="text-sm text-muted">

                {activity.going
                  .slice(0, 3)
                  .map(
                    (p) =>
                      p.name.split(' ')[0]
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

                are already in.

              </p>

            </div>

          </div>


          {/* =================================================
              ABOUT
          ================================================= */}

          <div className="mt-8">

            <h3 className="text-xl font-extrabold">
              About this plan
            </h3>

            <p className="mt-2 leading-relaxed text-muted">
              {activity.description}
            </p>

          </div>

        </div>


        {/* ===================================================
            RIGHT SIDEBAR
        =================================================== */}

        <div className="space-y-5">

          {/* =================================================
              MAIN ACTION CARD
          ================================================= */}

          <div className="rounded-2xl border border-border bg-surface-2 p-5">

            {/* PRICE */}

            <div className="flex items-center justify-between">

              <div>

                <p className="text-2xl font-extrabold">
                  {activity.priceLabel}
                </p>

                <p className="text-sm text-muted">
                  {activity.price === 0
                    ? 'No ticket, just show up'
                    : 'Per person'}
                </p>

              </div>


            </div>


            {/* =================================================
                DETAILS
            ================================================= */}

            <div className="mt-4 space-y-3 rounded-xl bg-surface p-4 text-sm">

              <Row
                label="When"
                value={`${activity.date} · ${activity.time}`}
              />


              <Row
                label="Where"
                value={visibleLocation.value}
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


            {requestError && (
              <p className="mt-3 text-xs font-semibold text-danger">
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
                      They can review your profile,
                      verification and reliability before
                      approving you.
                    </p>


                    {/* =================================================
                        NEW 12–24 HOUR MESSAGE
                    ================================================= */}

                    <p className="mt-2 text-xs font-semibold leading-relaxed text-mint">
                      It takes 12–24 hours for the host to
                      confirm your request to join.
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

              <Link
                to="/inbox"
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-text transition-colors hover:border-mint/40 hover:text-mint"
              >

                <ChatIcon className="h-4 w-4" />

                Messages

              </Link>


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

            <div className="mt-5 border-t border-border pt-4">

              <div className="flex items-start gap-2">

                <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />

                <p className="text-xs leading-relaxed text-muted">
                  Verified profiles and visible trust
                  signals help people make better decisions
                  before meeting.
                </p>

              </div>

            </div>

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