import { useState } from 'react'

import { Link, useParams } from 'react-router-dom'

import { useApp } from '../context/AppContext'
import { isHost } from '../lib/activities'

import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  MapPinIcon,
  ShieldCheckIcon,
  StarIcon,
  UsersIcon,
} from '../components/NavIcons'


export default function ApplicantProfile() {
  const { requestId } = useParams()

  const {
    currentUser,
    getRequestById,
    approveRequest,
    rejectRequest,
  } = useApp()

  const [message, setMessage] = useState(null)

  const found = getRequestById(requestId)

  /*
   * Only the host of the plan may inspect an applicant. Anyone else gets
   * the same not-found state as an invalid id.
   */
  if (
    !found?.activity ||
    !isHost(found.activity, currentUser.id)
  ) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">

        <h1 className="text-2xl font-bold">
          Request not found
        </h1>

        <p className="mt-2 text-muted">
          This join request doesn't exist, or it isn't for one of your plans.
        </p>

        <Link
          to="/join-requests"
          className="mt-6 inline-block rounded-full bg-mint px-5 py-2.5 font-bold text-bg"
        >
          Back to Join Requests
        </Link>

      </div>
    )
  }

  const { request, activity } = found
  const applicant = request.applicant || {}

  const reliability =
    applicant.reliability ??
    applicant.reliabilityScore ??
    null

  const trustScore =
    applicant.trustScore ??
    reliability

  const location =
    request.approximateLocation ||
    applicant.city ||
    'Nearby area'

  const pending = request.status === 'pending'

  function review(action) {
    const result = action(activity.id, request.id)

    setMessage(
      result.success
        ? {
            type: action === approveRequest ? 'success' : 'rejected',
            text:
              action === approveRequest
                ? 'Applicant approved.'
                : 'Request declined.',
          }
        : {
            type: 'error',
            text: result.message || 'This request could not be updated.',
          }
    )
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-5 py-8 sm:px-6 lg:px-8">

      {/* BACK */}

      <Link
        to="/join-requests"
        className="flex w-fit items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-text"
      >
        <ArrowRightIcon className="h-4 w-4 rotate-180" />
        Back to Join Requests
      </Link>


      {/* ==================================================
          APPLICANT HEADER
      ================================================== */}

      <section className="rounded-2xl border border-border bg-surface-2 p-6 sm:p-8">

        <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
          Applicant
        </p>

        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">

          <img
            src={applicant.avatar}
            alt=""
            className="h-24 w-24 shrink-0 rounded-2xl border border-border object-cover"
          />

          <div className="min-w-0">

            <div className="flex flex-wrap items-center gap-2">

              <h1 className="text-3xl font-extrabold tracking-tight">
                {applicant.name || 'Applicant'}
              </h1>

              {applicant.verified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint-soft px-2.5 py-1 text-xs font-bold text-mint">
                  <ShieldCheckIcon className="h-3.5 w-3.5" />
                  Identity verified
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted">
                  Not verified
                </span>
              )}

            </div>

            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <MapPinIcon className="h-4 w-4 shrink-0" />
              {location}
              <span className="text-muted-2">· approximate area</span>
            </div>

            {applicant.bio && (
              <p className="mt-4 max-w-2xl leading-relaxed text-muted">
                {applicant.bio}
              </p>
            )}

            {applicant.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {applicant.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

          </div>

        </div>


        {/* TRUST SIGNALS */}

        <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-4">

          <Signal
            icon={ShieldCheckIcon}
            label="Identity"
            value={applicant.verified ? 'Verified' : 'Not verified'}
          />

          <Signal
            icon={StarIcon}
            label="Reliability"
            value={reliability != null ? `${reliability}%` : 'Not available'}
          />

          <Signal
            icon={ShieldCheckIcon}
            label="Trust score"
            value={trustScore != null ? trustScore : 'Not available'}
          />

          <Signal
            icon={UsersIcon}
            label="Plans attended"
            value={applicant.attended ?? 'Not available'}
          />

        </div>

      </section>


      {/* ==================================================
          REQUEST
      ================================================== */}

      <section className="rounded-2xl border border-border bg-surface-2 p-6 sm:p-8">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

          <div className="min-w-0">

            <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
              Wants to join
            </p>

            <h2 className="mt-1 text-xl font-extrabold">
              {activity.title}
            </h2>

            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <ClockIcon className="h-3.5 w-3.5" />
              {activity.date} · {activity.time}
            </p>

          </div>

          <Link
            to={`/activities/${activity.id}`}
            className="inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition-colors hover:border-mint/40 hover:text-mint"
          >
            View plan
            <ArrowRightIcon className="h-4 w-4" />
          </Link>

        </div>

        {request.message && (
          <blockquote className="mt-5 border-l-2 border-mint pl-4 text-sm leading-relaxed text-text">
            “{request.message}”
          </blockquote>
        )}

        <p className="mt-5 text-xs text-muted">
          Requested {formatDate(request.requestedAt)}
        </p>


        {/* STATUS / ACTIONS */}

        {message && (
          <div
            role="status"
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-mint/30 bg-mint-soft text-mint'
                : message.type === 'error'
                  ? 'border-red-400/30 bg-red-400/5 text-danger'
                  : 'border-border bg-surface text-muted'
            }`}
          >
            {message.text}
          </div>
        )}

        {pending ? (
          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">

            <button
              type="button"
              onClick={() => review(rejectRequest)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-5 text-sm font-semibold text-muted transition-colors hover:border-red-400/40 hover:text-danger"
            >
              <CloseIcon className="h-4 w-4" />
              Reject
            </button>

            <button
              type="button"
              onClick={() => review(approveRequest)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-mint px-5 text-sm font-bold text-bg transition-colors hover:bg-mint/90"
            >
              <CheckIcon className="h-4 w-4" />
              Approve
            </button>

          </div>
        ) : (
          <div className="mt-6 flex items-center gap-2 border-t border-border pt-5 text-sm font-bold">
            {request.status === 'approved' ? (
              <>
                <CheckIcon className="h-4 w-4 text-mint" />
                <span className="text-mint">Approved participant</span>
              </>
            ) : (
              <>
                <CloseIcon className="h-4 w-4 text-muted" />
                <span className="text-muted">Request declined</span>
              </>
            )}
          </div>
        )}

      </section>

    </div>
  )
}


function Signal({ icon: Icon, label, value }) {
  return (
    <div className="border-b border-r border-border p-4 [&:nth-child(2n)]:border-r-0 sm:border-b-0 sm:[&:nth-child(2n)]:border-r sm:last:border-r-0">

      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-mint" />
        <p className="truncate text-sm font-semibold">
          {value}
        </p>
      </div>

    </div>
  )
}


function formatDate(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) {
    return 'recently'
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}
