import { useEffect, useState } from 'react'

import { Link } from 'react-router-dom'

import { useApp } from '../context/AppContext'
import { isHost } from '../lib/activities'
import { apiRequest } from '../lib/api'

import {
  ArrowRightIcon,
  CheckIcon,
  MapPinIcon,
  ShieldCheckIcon,
  UsersIcon,
  ClockIcon,
  CloseIcon,
} from '../components/NavIcons'


export default function JoinRequests() {
  const {
    activities,
    currentUser,
    getJoinRequests,
    approveRequest,
    rejectRequest,
  } = useApp()

  const [processing, setProcessing] = useState(null)
  const [message, setMessage] = useState(null)
  const [databaseRequests, setDatabaseRequests] = useState({})
  const [databaseRequestError, setDatabaseRequestError] = useState('')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    const hostedDatabaseEvents = activities.filter((activity) =>
      activity.databaseBacked && isHost(activity, currentUser.id),
    )
    if (!hostedDatabaseEvents.length) {
      return undefined
    }
    Promise.all(hostedDatabaseEvents.map(async (activity) => {
      const { requests } = await apiRequest(`/activities/${activity.id}/requests`)
      return [activity.id, (requests || []).map((request) => ({
        ...request,
        databaseBacked: true,
      }))]
    }))
      .then((entries) => {
        if (!active) return
        setDatabaseRequests(Object.fromEntries(entries))
        setDatabaseRequestError('')
      })
      .catch((error) => {
        if (active) setDatabaseRequestError(error.message)
      })
    return () => { active = false }
  }, [activities, currentUser.id])

  // ==================================================
  // HOSTED ACTIVITIES WITH REQUESTS
  //
  // Only plans the current user hosts (stable id match).
  // getJoinRequests never returns the host's own requests.
  // ==================================================

  const requestGroups = activities
    .filter((activity) => isHost(activity, currentUser.id))
    .map((activity) => ({
      activity,
      requests: activity.databaseBacked
        ? databaseRequests[activity.id] || []
        : getJoinRequests(activity.id),
    }))
    .filter((group) => group.requests.length > 0)

  const hostedEvents = [...new Map(
    activities
      .filter((activity) => isHost(activity, currentUser.id))
      .map((activity) => [activity.id, activity]),
  ).values()]
  const eventSections = [
    {
      title: 'Ongoing events',
      events: hostedEvents.filter((activity) => {
        const endTime = Date.parse(activity.endsAt || '')
        const startTime = Date.parse(activity.startsAt || '')
        return activity.status !== 'completed' &&
          Number.isFinite(startTime) &&
          startTime <= now &&
          (!Number.isFinite(endTime) || endTime > now)
      }),
      badge: 'Live',
      badgeClass: 'bg-mint/10 text-mint',
    },
    {
      title: 'Upcoming events',
      events: hostedEvents.filter((activity) => {
        const startTime = Date.parse(activity.startsAt || '')
        const endTime = Date.parse(activity.endsAt || '')
        return activity.status !== 'completed' &&
          (!Number.isFinite(startTime) || startTime > now) &&
          (!Number.isFinite(endTime) || endTime > now)
      }),
      badge: 'Upcoming',
      badgeClass: 'bg-blue-500/10 text-blue-300',
    },
    {
      title: 'Previous events',
      events: hostedEvents.filter((activity) => {
        const endTime = Date.parse(activity.endsAt || '')
        return activity.status === 'completed' ||
          (Number.isFinite(endTime) && endTime <= now)
      }),
      badge: 'Completed',
      badgeClass: 'bg-surface text-muted',
    },
  ].filter((section) => section.events.length > 0)

  // ==================================================
  // TOTAL PENDING
  // ==================================================

  const totalPending = requestGroups.reduce(
    (total, group) => {
      return (
        total +
        group.requests.filter(
          (request) =>
            request.status === 'pending'
        ).length
      )
    },
    0
  )

  // ==================================================
  // TOTAL REVIEWED
  // ==================================================

  const totalReviewed = requestGroups.reduce(
    (total, group) => {
      return (
        total +
        group.requests.filter(
          (request) =>
            request.status !== 'pending'
        ).length
      )
    },
    0
  )

  // ==================================================
  // APPROVE
  // ==================================================

  async function handleApprove(
    activityId,
    requestId
  ) {
    setProcessing(requestId)
    setMessage(null)

    const result = await approveRequest(
      activityId,
      requestId
    )

    if (result.success) {
      setDatabaseRequests((previous) => ({
        ...previous,
        [activityId]: (previous[activityId] || []).filter((request) => request.id !== requestId),
      }))
      setMessage({
        type: 'success',
        text: 'Applicant approved successfully.',
      })
    } else {
      setMessage({
        type: 'error',
        text:
          result.message ||
          'This request could not be approved.',
      })
    }

    setProcessing(null)
  }

  // ==================================================
  // REJECT
  // ==================================================

  async function handleReject(
    activityId,
    requestId
  ) {
    setProcessing(requestId)
    setMessage(null)

    const result = await rejectRequest(
      activityId,
      requestId
    )

    if (result.success) {
      setDatabaseRequests((previous) => ({
        ...previous,
        [activityId]: (previous[activityId] || []).filter((request) => request.id !== requestId),
      }))
      setMessage({
        type: 'rejected',
        text: 'Request declined.',
      })
    } else {
      setMessage({
        type: 'error',
        text:
          result.message ||
          'This request could not be declined.',
      })
    }

    setProcessing(null)
  }

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <main className="min-h-screen">

      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-6 lg:px-8">

        {/* ==================================================
            HEADER
        ================================================== */}

        <section className="relative overflow-hidden rounded-3xl border border-border bg-surface-2 px-5 py-6 shadow-[0_18px_55px_rgba(0,0,0,0.16)] sm:px-7 sm:py-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-mint/30 via-mint to-mint/20" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 h-56 w-56 rounded-full bg-mint/[0.07] blur-3xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <p className="inline-flex items-center gap-2 rounded-full border border-mint/20 bg-bg/60 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint">
                <UsersIcon className="h-3.5 w-3.5" />
                Host dashboard
              </p>

              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
                Join Requests
              </h1>

              <p className="mt-2 text-xs text-muted sm:whitespace-nowrap sm:text-sm">
                Review trust signals before approving applicants.
              </p>

            </div>


            {/* PENDING COUNT */}

            <div className="flex w-fit shrink-0 gap-3">

              <div className="min-w-[116px] rounded-2xl border border-mint/20 bg-bg/55 px-5 py-4 shadow-sm">

                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  Pending
                </p>

                <p className="mt-1 text-3xl font-extrabold leading-none text-mint">
                  {totalPending}
                </p>

              </div>

              {totalReviewed > 0 && (
                <div className="hidden min-w-[116px] rounded-2xl border border-border bg-bg/55 px-5 py-4 shadow-sm sm:block">

                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    Reviewed
                  </p>

                  <p className="mt-1 text-3xl font-extrabold leading-none">
                    {totalReviewed}
                  </p>

                </div>
              )}

            </div>

            <section aria-labelledby="your-events-title" className="mt-8 space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-mint">Your plans</p>
                  <h2 id="your-events-title" className="mt-1 text-xl font-extrabold text-text sm:text-2xl">Your events</h2>
                </div>
                <Link to="/create" className="inline-flex items-center gap-1.5 text-xs font-bold text-mint transition hover:text-white">
                  Create an event
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>

              {eventSections.length ? (
                <div className="space-y-5">
                  {eventSections.map((section) => (
                    <div key={section.title}>
                      <div className="mb-3 flex items-center gap-2">
                        <h3 className="text-sm font-bold text-text">{section.title}</h3>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted">
                          {section.events.length}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {section.events.map((activity) => (
                          <Link
                            key={activity.id}
                            to={`/activities/${activity.id}`}
                            className="group overflow-hidden rounded-2xl border border-border bg-surface-2 transition hover:-translate-y-0.5 hover:border-mint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                          >
                            {activity.image && (
                              <img src={activity.image} alt="" loading="lazy" className="h-32 w-full object-cover" />
                            )}
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <h4 className="min-w-0 text-sm font-extrabold text-text transition group-hover:text-mint">{activity.title}</h4>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide ${section.badgeClass}`}>
                                  {section.badge}
                                </span>
                              </div>
                              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                                <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{activity.date}{activity.time ? ` · ${activity.time}` : ''}</span>
                              </p>
                              {activity.location && (
                                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                                  <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{activity.location}</span>
                                </p>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-surface-2 px-5 py-8 text-center">
                  <p className="text-sm font-bold text-text">No ongoing or previous events</p>
                  <p className="mt-1 text-xs text-muted">Events you host will appear here.</p>
                </div>
              )}
            </section>

          </div>

        </section>


        {/* ==================================================
            ACTION MESSAGE
        ================================================== */}

        {databaseRequestError && (
          <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            Could not load your event requests: {databaseRequestError}
          </p>
        )}

        {message && (

          <div
            className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-mint/30 bg-mint-soft text-mint'
                : message.type === 'error'
                  ? 'border-red-400/30 bg-red-400/5 text-danger'
                  : 'border-border bg-surface-2 text-muted'
            }`}
          >

            {message.type === 'success' && (
              <CheckIcon className="h-4 w-4 shrink-0" />
            )}

            {message.type === 'error' && (
              <CloseIcon className="h-4 w-4 shrink-0" />
            )}

            <span>
              {message.text}
            </span>

          </div>

        )}


        {/* ==================================================
            NO REQUESTS
        ================================================== */}

        {requestGroups.length === 0 && (
          <section className="relative mt-6 overflow-hidden rounded-3xl border border-border bg-surface-2 p-5 shadow-[0_16px_45px_rgba(0,0,0,0.12)] sm:p-7" aria-labelledby="empty-requests-title">
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-mint/[0.07] blur-3xl" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-mint/20 bg-mint/10 text-mint">
                  <UsersIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-mint">All clear</p>
                  <h2 id="empty-requests-title" className="mt-1 text-lg font-extrabold text-text sm:text-xl">No join requests yet</h2>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted sm:text-sm">
                    New requests from people interested in your plans will show up here for review.
                  </p>
                </div>
              </div>
              <Link
                to="/create"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 sm:self-auto"
              >
                Create a plan
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}


        {/* ==================================================
            REQUEST GROUPS
        ================================================== */}

        <div className="mt-8 space-y-8">

          {requestGroups.map(
            ({ activity, requests }) => {

              const pendingRequests =
                requests.filter(
                  (request) =>
                    request.status === 'pending'
                )

              const reviewedRequests =
                requests.filter(
                  (request) =>
                    request.status !== 'pending'
                )

              return (

                <section
                  key={activity.id}
                  className="overflow-hidden rounded-3xl border border-border bg-surface-2 shadow-[0_18px_55px_rgba(0,0,0,0.14)]"
                >

                  {/* ==================================================
                      PLAN HEADER
                  ================================================== */}

                  <div className="border-b border-border bg-gradient-to-r from-surface to-surface-2 p-5 sm:p-6">

                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                      <div className="min-w-0">

                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
                          {activity.category}
                        </p>

                        <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">
                          {activity.title}
                        </h2>

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">

                          <span className="flex items-center gap-1.5">
                            <ClockIcon className="h-3.5 w-3.5" />
                            {activity.date}
                            {' · '}
                            {activity.time}
                          </span>

                          <span className="flex items-center gap-1.5">
                            <MapPinIcon className="h-3.5 w-3.5" />
                            {activity.location}
                          </span>

                        </div>

                      </div>


                      <Link
                        to={`/activities/${activity.id}`}
                        className="inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition-colors hover:border-mint/40 hover:text-mint"
                      >
                        View plan
                        <ArrowRightIcon className="h-4 w-4" />
                      </Link>

                    </div>

                  </div>


                  {/* ==================================================
                      REQUEST CONTENT
                  ================================================== */}

                  <div className="p-5 sm:p-6">

                    {/* ==================================================
                        PENDING REQUESTS
                    ================================================== */}

                    {pendingRequests.length > 0 && (

                      <div>

                        <div className="mb-5 flex items-center justify-between">

                          <div>

                            <h3 className="text-sm font-bold">
                              Waiting for your review
                            </h3>

                            <p className="mt-1 text-xs text-muted">
                              Review trust signals before approving.
                            </p>

                          </div>

                          <span className="text-xs font-bold text-mint">
                            {pendingRequests.length}
                            {' '}
                            pending
                          </span>

                        </div>


                        <div className="space-y-4">

                          {pendingRequests.map(
                            (request) => (

                              <ApplicantCard
                                key={request.id}
                                request={request}
                                activity={activity}
                                processing={
                                  processing === request.id
                                }
                                onApprove={() =>
                                  handleApprove(
                                    activity.id,
                                    request.id
                                  )
                                }
                                onReject={() =>
                                  handleReject(
                                    activity.id,
                                    request.id
                                  )
                                }
                              />

                            )
                          )}

                        </div>

                      </div>

                    )}


                    {/* ==================================================
                        PREVIOUSLY REVIEWED
                    ================================================== */}

                    {reviewedRequests.length > 0 && (

                      <div
                        className={
                          pendingRequests.length > 0
                            ? 'mt-8 border-t border-border pt-7'
                            : ''
                        }
                      >

                        <h3 className="text-sm font-bold text-muted">
                          Previously reviewed
                        </h3>

                        <div className="mt-3 space-y-3">

                          {reviewedRequests.map(
                            (request) => (

                              <ReviewedRequest
                                key={request.id}
                                request={request}
                              />

                            )
                          )}

                        </div>

                      </div>

                    )}


                    {/* ==================================================
                        EMPTY
                    ================================================== */}

                    {pendingRequests.length === 0 &&
                      reviewedRequests.length === 0 && (

                        <div className="py-8 text-center">

                          <UsersIcon className="mx-auto h-5 w-5 text-muted" />

                          <p className="mt-3 text-sm font-semibold">
                            Nothing here yet
                          </p>

                        </div>

                      )}

                  </div>

                </section>

              )
            }
          )}

        </div>

      </div>

    </main>
  )
}


/* =========================================================
   APPLICANT CARD
========================================================= */

function ApplicantCard({
  request,
  processing,
  onApprove,
  onReject,
}) {
  const applicant =
    request.applicant || {}

  const reliability =
    applicant.reliability ??
    applicant.reliabilityScore ??
    applicant.trustScore ??
    null

  /*
   * Privacy:
   * The applicant's own approximate area only.
   */

  const location =
    request.approximateLocation ||
    applicant.city ||
    'Nearby area'

  return (

    <article className="overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-mint/25 sm:p-5">

      {/* ==================================================
          APPLICANT HEADER
      ================================================== */}

      <div className="flex items-start gap-4">

        <img
          src={applicant.avatar}
          alt=""
          className="h-14 w-14 shrink-0 rounded-full object-cover"
        />

        <div className="min-w-0 flex-1">

          <Link
            to={request.databaseBacked
              ? `/people/${request.applicant.id}`
              : `/people/request/${request.id}`}
            className="block transition-opacity hover:opacity-80"
          >

            <div className="flex flex-wrap items-center gap-2">

              <h4 className="text-base font-bold">
                {applicant.name ||
                  'Applicant'}
              </h4>

              {applicant.verified && (

                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint">

                  <ShieldCheckIcon className="h-3.5 w-3.5" />

                  Identity verified

                </span>

              )}

            </div>

            {applicant.bio && (
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {applicant.bio}
              </p>
            )}

          </Link>

        </div>

      </div>


      {/* ==================================================
          TRUST SIGNALS
      ================================================== */}

      <div className="mt-5 grid grid-cols-1 overflow-hidden rounded-xl border border-border sm:grid-cols-3">

        <TrustSignal
          label="Identity"
          value={
            applicant.verified
              ? 'Verified'
              : 'Not verified'
          }
        />

        <TrustSignal
          label="Reliability"
          value={
            reliability !== null
              ? `${reliability}%`
              : 'Not available'
          }
        />

        <TrustSignal
          label="Approx. location"
          value={location}
          approximate
        />

      </div>


      {/* ==================================================
          PRIVACY NOTE
      ================================================== */}

      <div className="mt-4 flex items-start gap-2 border-l-2 border-mint pl-3">

        <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />

        <p className="text-xs leading-relaxed text-muted">
          This is the applicant's approximate area.
          More precise location should only be visible
          after approval.
        </p>

      </div>


      {/* ==================================================
          TAGS
      ================================================== */}

      {applicant.tags?.length > 0 && (

        <div className="mt-4 flex flex-wrap gap-2">

          {applicant.tags
            .slice(0, 5)
            .map((tag) => (

              <span
                key={tag}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted"
              >
                {tag}
              </span>

            ))}

        </div>

      )}


      {/* ==================================================
          REQUEST META
      ================================================== */}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">

        <span>
          Requested{' '}
          {formatRequestDate(
            request.requestedAt
          )}
        </span>

        {applicant.city && (
          <span>
            Based in {applicant.city}
          </span>
        )}

      </div>


      {/* ==================================================
          APPROVE / REJECT
      ================================================== */}

      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">

        {/* REJECT */}

        <button
          type="button"
          onClick={onReject}
          disabled={processing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-5 text-sm font-semibold text-muted transition-colors hover:border-red-400/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
        >

          <CloseIcon className="h-4 w-4" />

          Reject

        </button>


        {/* APPROVE */}

        <button
          type="button"
          onClick={onApprove}
          disabled={processing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-mint px-5 text-sm font-bold text-bg transition-colors hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
        >

          <CheckIcon className="h-4 w-4" />

          {processing
            ? 'Updating...'
            : 'Approve'}

        </button>

      </div>

    </article>
  )
}


/* =========================================================
   TRUST SIGNAL
========================================================= */

function TrustSignal({
  label,
  value,
  approximate = false,
}) {
  return (

    <div className="border-b border-border p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">

      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-2">

        {approximate ? (

          <MapPinIcon className="h-4 w-4 shrink-0 text-mint" />

        ) : (

          <ShieldCheckIcon className="h-4 w-4 shrink-0 text-mint" />

        )}

        <p className="truncate text-sm font-semibold">
          {value}
        </p>

      </div>

    </div>
  )
}


/* =========================================================
   REVIEWED REQUEST
========================================================= */

function ReviewedRequest({
  request,
}) {
  const applicant =
    request.applicant || {}

  const approved =
    request.status === 'approved'

  return (

    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center">

      <div className="flex min-w-0 flex-1 items-center gap-3">

        <img
          src={applicant.avatar}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />

        <div className="min-w-0">

          <p className="truncate text-sm font-bold">
            {applicant.name ||
              'Applicant'}
          </p>

          <p className="mt-0.5 text-xs text-muted">
            {approved
              ? 'Approved participant'
              : 'Request declined'}
          </p>

        </div>

      </div>


      <div className="flex items-center gap-2">

        {approved ? (

          <>
            <CheckIcon className="h-4 w-4 text-mint" />

            <span className="text-xs font-bold text-mint">
              Approved
            </span>
          </>

        ) : (

          <>
            <CloseIcon className="h-4 w-4 text-muted" />

            <span className="text-xs font-bold text-muted">
              Declined
            </span>
          </>

        )}

      </div>

    </div>
  )
}


/* =========================================================
   DATE FORMAT
========================================================= */

function formatRequestDate(value) {
  if (!value) {
    return 'recently'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'recently'
  }

  return date.toLocaleDateString(
    undefined,
    {
      day: 'numeric',
      month: 'short',
    }
  )
}