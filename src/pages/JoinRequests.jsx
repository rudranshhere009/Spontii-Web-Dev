import { useState } from 'react'

import { Link } from 'react-router-dom'

import { useApp } from '../context/AppContext'
import { isHost } from '../lib/activities'

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
      requests: getJoinRequests(activity.id),
    }))
    .filter((group) => group.requests.length > 0)

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

  function handleApprove(
    activityId,
    requestId
  ) {
    setProcessing(requestId)
    setMessage(null)

    const result = approveRequest(
      activityId,
      requestId
    )

    if (result.success) {
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

  function handleReject(
    activityId,
    requestId
  ) {
    setProcessing(requestId)
    setMessage(null)

    const result = rejectRequest(
      activityId,
      requestId
    )

    if (result.success) {
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

        <section className="border-b border-border pb-7">

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">

            <div>

              <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
                Host
              </p>

              <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                Join Requests
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                Review people who want to join your plans.
                Check their verification and trust signals
                before approving them.
              </p>

            </div>


            {/* PENDING COUNT */}

            <div className="flex w-fit shrink-0 gap-3">

              <div className="min-w-[110px] rounded-xl border border-border bg-surface-2 px-5 py-4">

                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  Pending
                </p>

                <p className="mt-1 text-3xl font-extrabold text-mint">
                  {totalPending}
                </p>

              </div>

              {totalReviewed > 0 && (
                <div className="hidden min-w-[110px] rounded-xl border border-border bg-surface-2 px-5 py-4 sm:block">

                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    Reviewed
                  </p>

                  <p className="mt-1 text-3xl font-extrabold">
                    {totalReviewed}
                  </p>

                </div>
              )}

            </div>

          </div>

        </section>


        {/* ==================================================
            ACTION MESSAGE
        ================================================== */}

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

          <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-2 px-6 py-16 text-center">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-muted">
              <UsersIcon className="h-5 w-5" />
            </div>

            <h2 className="mt-5 text-lg font-bold">
              Nothing here yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              When someone requests to join one of
              your plans, their request will appear here.
            </p>

            <Link
              to="/create"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-mint px-5 py-3 text-sm font-bold text-bg transition-colors hover:bg-mint/90"
            >
              Create a plan
              <ArrowRightIcon className="h-4 w-4" />
            </Link>

          </div>

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
                  className="overflow-hidden rounded-2xl border border-border bg-surface-2"
                >

                  {/* ==================================================
                      PLAN HEADER
                  ================================================== */}

                  <div className="border-b border-border p-5 sm:p-6">

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

    <article className="rounded-xl border border-border bg-surface p-5 sm:p-6">

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
            to={`/people/request/${request.id}`}
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