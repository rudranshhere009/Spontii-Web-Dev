import { startTransition, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  milestones,
  passportSignals,
} from '../data/mockData'

import { useApp } from '../context/AppContext'
import { isHost } from '../lib/activities'

import {
  MapPinIcon,
  ShieldCheckIcon,
  StarIcon,
  ZapIcon,
  TrophyIcon,
  UsersIcon,
  CalendarIcon,
  ArrowRightIcon,
  CloseIcon,
} from '../components/NavIcons'

import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const {
    activities,
    joined,
    currentUser: profile,
    updateProfile,
  } = useApp()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)

  const navigate = useNavigate()
  const { logout } = useAuth()

  // ==================================================
  // LOGOUT
  // ==================================================

  /*
   * Clear the session (existing logout) and land on the public Home page.
   * Both updates share one transition (React Router navigations are
   * transitions), so React commits them together: the first render is "/"
   * logged out, and /profile's auth guard never redirects to /login.
   * replace: true drops /profile from history so Back can't return to it;
   * protected routes still guard themselves if reached any other way.
   */
  function handleLogout() {
    startTransition(() => {
      logout()
      navigate('/', { replace: true })
    })
  }

  // ==================================================
  // PLANS
  // ==================================================

  const myPlans = activities.filter((activity) =>
    joined.has(activity.id)
  )

  const hostedPlans = activities.filter(
    (activity) => isHost(activity, profile.id)
  )

  /*
   * Passport signals reflect the live profile instead of hard-coded
   * numbers; identity only shows when the user is actually verified.
   * Reliability has its own bar above, so its duplicate card is skipped.
   */
  const trustSignals = passportSignals
    .filter((signal) => signal.id !== 's1' || profile.verified)
    .filter((signal) => signal.id !== 's2')
    .map((signal) => {
      if (signal.id === 's3') {
        return {
          ...signal,
          subtitle: `${profile.score} points of real-world reputation.`,
        }
      }

      return signal
    })

  // ==================================================
  // PROFILE SAVE
  // ==================================================

  function saveProfile(event) {
    event.preventDefault()

    updateProfile({
      name: draft.name.trim() || profile.name,
      tagline: draft.tagline,
      tags: draft.tags,
    })
    setEditing(false)
  }

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="mx-auto max-w-[1500px] space-y-10 px-5 py-8 sm:px-6 lg:px-8">

      {/* ==================================================
          PROFILE HEADER
      ================================================== */}

      <section className="overflow-hidden rounded-3xl border border-border bg-surface-2">

        <div className="p-6 sm:p-8 lg:p-10">

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">

            {/* PROFILE INFO */}

            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">

              {/* AVATAR */}

              <div className="relative shrink-0">

                <img
                  src={profile.avatar}
                  alt={profile.name}
                  className="h-24 w-24 rounded-2xl border border-border object-cover sm:h-28 sm:w-28"
                />

              </div>

              {/* DETAILS */}

              <div className="min-w-0">

                <div className="flex flex-wrap items-center gap-2">

                  <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                    {profile.name}
                  </h1>

                  {profile.verified && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint-soft px-2.5 py-1 text-xs font-bold text-mint">
                      <ShieldCheckIcon className="h-3.5 w-3.5" />
                      Verified
                    </span>
                  )}

                </div>

                <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                  <MapPinIcon className="h-4 w-4 shrink-0" />
                  {profile.city}
                </div>

                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
                  {profile.tagline}
                </p>

                {/* TAGS */}

                <div className="mt-4 flex flex-wrap gap-2">

                  {profile.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted"
                    >
                      {tag}
                    </span>
                  ))}

                </div>

              </div>

            </div>

            {/* ACTIONS */}

            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">

              {/* MANAGE JOIN REQUESTS */}

              {hostedPlans.length > 0 && (
                <Link
                  to="/join-requests"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-mint px-5 py-3 text-sm font-bold text-bg transition-colors hover:bg-mint/90"
                >
                  Manage Join Requests
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              )}

              {/* EDIT PROFILE */}

              <button
                type="button"
                onClick={() => {
                  setDraft(profile)
                  setEditing(true)
                }}
                className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-bold text-text transition-colors hover:bg-text/5"
              >
                Edit profile
              </button>

            </div>

          </div>

          {/* ==================================================
              STATS
          ================================================== */}

          <div className="mt-8 grid grid-cols-2 border-t border-border pt-7 sm:grid-cols-5">

            <Stat
              value={profile.score}
              label="Spontii Score"
            />

            <Stat
              value={`${profile.reliability}%`}
              label="Reliability"
              mint
            />

            <Stat
              value={profile.attended}
              label="Plans Attended"
            />

            <Stat
              value={profile.connections}
              label="Connections"
            />

            <Stat
              value={hostedPlans.length}
              label="Plans Hosted"
            />

          </div>

        </div>

      </section>

      {/* ==================================================
          TRUST + RELIABILITY
      ================================================== */}

      <section className="space-y-5">

        <div>

          <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
            Trust & verification
          </p>

          <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Your trust signals
          </h2>

          <p className="mt-2 max-w-2xl text-sm text-muted">
            The things that help people feel comfortable
            meeting you through Spontii.
          </p>

        </div>

        {/* RELIABILITY */}

        <div className="rounded-2xl border border-border bg-surface-2 p-6 sm:p-7">

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <div className="flex items-center gap-2">

                <ShieldCheckIcon className="h-5 w-5 text-mint" />

                <p className="font-bold">
                  Reliability
                </p>

              </div>

              <p className="mt-1 text-sm text-muted">
                Based on showing up and hosting well.
              </p>

            </div>

            <div className="flex items-baseline gap-1">

              <span className="text-3xl font-extrabold text-mint">
                {profile.reliability}
              </span>

              <span className="text-sm font-semibold text-muted">
                /100
              </span>

            </div>

          </div>

          {/* PROGRESS */}

          <div className="mt-6">

            <div className="h-2 overflow-hidden rounded-full bg-surface-3">

              <div
                className="h-full rounded-full bg-mint transition-all duration-700"
                style={{
                  width: `${profile.reliability}%`,
                }}
              />

            </div>

            <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted">

              <span>
                Needs improvement
              </span>

              <span>
                Excellent
              </span>

            </div>

          </div>

        </div>

        {/* PASSPORT SIGNALS */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {trustSignals.map((signal) => (

            <div
              key={signal.id}
              className="rounded-2xl border border-border bg-surface-2 p-5 transition-colors hover:border-mint/30"
            >

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-soft text-mint">

                {signal.icon === 'shield' && (
                  <ShieldCheckIcon className="h-5 w-5" />
                )}

                {signal.icon === 'star' && (
                  <StarIcon className="h-5 w-5" />
                )}

                {signal.icon === 'bolt' && (
                  <ZapIcon className="h-5 w-5" />
                )}

              </div>

              <h3 className="mt-4 font-bold">
                {signal.title}
              </h3>

              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {signal.subtitle}
              </p>

            </div>

          ))}

        </div>

      </section>

      {/* ==================================================
          MAIN CONTENT
      ================================================== */}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">

        {/* ==================================================
            LEFT COLUMN
        ================================================== */}

        <div className="space-y-10">

          {/* ==================================================
              JOINED PLANS
          ================================================== */}

          <section>

            <div className="mb-5 flex items-end justify-between gap-4">

              <div>

                <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
                  Your activity
                </p>

                <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
                  Plans you're part of
                </h2>

              </div>

              <Link
                to="/explore"
                className="hidden items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-text sm:flex"
              >
                Find another
                <ArrowRightIcon className="h-4 w-4" />
              </Link>

            </div>

            {myPlans.length === 0 ? (

              <div className="rounded-2xl border border-dashed border-border p-10 text-center">

                <p className="font-semibold text-text">
                  Nothing here yet.
                </p>

                <p className="mt-2 text-sm text-muted">
                  You haven't joined any plans yet.
                </p>

                <Link
                  to="/explore"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-bold text-bg"
                >
                  Explore activities
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>

              </div>

            ) : (

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                {myPlans.map((activity) => (

                  <ActivityMiniCard
                    key={activity.id}
                    activity={activity}
                  />

                ))}

              </div>

            )}

          </section>

          {/* ==================================================
              HOSTED PLANS
          ================================================== */}

          {hostedPlans.length > 0 && (

            <section>

              <div className="mb-5">

                <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
                  Your plans
                </p>

                <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
                  Plans you're hosting
                </h2>

              </div>

              <div className="space-y-3">

                {hostedPlans.map((activity) => (

                  <Link
                    key={activity.id}
                    to={`/activities/${activity.id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-border bg-surface-2 p-3 transition-colors hover:border-mint/40"
                  >

                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl">

                      <img
                        src={activity.image}
                        alt={activity.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />

                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-mint">
                        {activity.category}
                      </p>

                      <p className="mt-1 truncate font-bold">
                        {activity.title}
                      </p>

                      <p className="mt-1 text-xs text-muted">
                        {activity.when}
                        {' · '}
                        {activity.location}
                      </p>

                    </div>

                    <ArrowRightIcon className="mr-2 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-mint" />

                  </Link>

                ))}

              </div>

            </section>

          )}

        </div>

        {/* ==================================================
            RIGHT COLUMN
        ================================================== */}

        <aside className="space-y-5">

          {/* ==================================================
              MILESTONES
          ================================================== */}

          <div className="rounded-2xl border border-border bg-surface-2 p-6">

            <div className="flex items-center gap-2">

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint-soft text-mint">
                <TrophyIcon className="h-4 w-4" />
              </div>

              <div>

                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                  Progress
                </p>

                <h3 className="font-extrabold">
                  Milestones
                </h3>

              </div>

            </div>

            <div className="mt-6 space-y-5">

              {milestones.map((milestone) => (

                <Milestone
                  key={milestone.id}
                  milestone={milestone}
                />

              ))}

            </div>

          </div>

          {/* ==================================================
              UPCOMING
          ================================================== */}

          <div className="rounded-2xl border border-border bg-surface-2 p-6">

            <div className="flex items-center gap-2">

              <CalendarIcon className="h-4 w-4 text-mint" />

              <p className="text-sm font-bold">
                Upcoming
              </p>

            </div>

            <h3 className="mt-4 text-lg font-extrabold">
              {myPlans.length > 0
                ? 'Your week is looking good.'
                : 'Your week is wide open.'}
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-muted">
              You have {myPlans.length} active plan
              {myPlans.length === 1 ? '' : 's'}.
            </p>

            <Link
              to="/explore"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-surface-3 px-4 py-3 text-sm font-bold transition-colors hover:bg-text/5"
            >
              Browse nearby
              <ArrowRightIcon className="h-4 w-4" />
            </Link>

          </div>

        </aside>

      </div>

      {/* ==================================================
          ACCOUNT
      ================================================== */}

      <section className="rounded-2xl border border-border bg-surface-2 p-6 sm:p-7">

        <div>

          <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
            Account
          </p>

          <h2 className="mt-1 text-xl font-extrabold">
            Manage your account
          </h2>

          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Sign out of your Spontii account on this device.
          </p>

        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-red-400/20 bg-red-400/5 px-5 text-sm font-bold text-danger transition-colors hover:bg-red-400/10 sm:w-auto"
        >
          Log out
        </button>

      </section>

      {/* ==================================================
          EDIT PROFILE MODAL
      ================================================== */}

      {editing && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
          onClick={() => setEditing(false)}
        >

          <form
            onClick={(event) =>
              event.stopPropagation()
            }
            onSubmit={saveProfile}
            className="w-full max-w-md rounded-2xl border border-border bg-surface-2 p-6 shadow-2xl"
          >

            {/* HEADER */}

            <div className="mb-6 flex items-center justify-between">

              <div>

                <p className="text-xs font-bold uppercase tracking-[0.1em] text-mint">
                  Profile
                </p>

                <h2 className="mt-1 text-xl font-extrabold">
                  Edit profile
                </h2>

              </div>

              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text"
                aria-label="Close"
              >
                <CloseIcon className="h-4 w-4" />
              </button>

            </div>

            {/* FIELDS */}

            <div className="space-y-4">

              {/* NAME */}

              <div>

                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Name
                </label>

                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-mint"
                />

              </div>

              {/* TAGLINE */}

              <div>

                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Tagline
                </label>

                <input
                  value={draft.tagline}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tagline: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-mint"
                />

              </div>

              {/* TAGS */}

              <div>

                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Tags
                </label>

                <input
                  value={draft.tags.join(', ')}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tags: event.target.value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-mint"
                />

                <p className="mt-1.5 text-xs text-muted">
                  Separate multiple tags with commas.
                </p>

              </div>

            </div>

            {/* SAVE */}

            <button
              type="submit"
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-mint py-3 text-sm font-bold text-bg transition-colors hover:bg-mint/90"
            >
              Save changes
            </button>

          </form>

        </div>

      )}

    </div>
  )
}

/* ======================================================
   STAT
====================================================== */

function Stat({
  value,
  label,
  mint = false,
}) {
  return (
    <div className="border-r border-border px-4 first:pl-0 last:border-r-0 sm:px-6">

      <p
        className={`text-2xl font-extrabold sm:text-3xl ${
          mint
            ? 'text-mint'
            : 'text-text'
        }`}
      >
        {value}
      </p>

      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted sm:text-xs">
        {label}
      </p>

    </div>
  )
}

/* ======================================================
   ACTIVITY MINI CARD
====================================================== */

function ActivityMiniCard({
  activity,
}) {
  return (
    <Link
      to={`/activities/${activity.id}`}
      className="group overflow-hidden rounded-2xl border border-border bg-surface-2 transition-colors hover:border-mint/40"
    >

      <div data-theme="dark" className="relative h-36 overflow-hidden">

        <img
          src={activity.image}
          alt={activity.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

        {activity.badge && (
          <span className="absolute left-3 top-3 rounded-full bg-bg/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-mint backdrop-blur-sm">
            {activity.badge}
          </span>
        )}

        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-bg/85 px-2.5 py-1 text-[10px] font-bold text-text backdrop-blur-sm">

          <span className="h-1.5 w-1.5 rounded-full bg-mint" />

          Going

        </span>

      </div>

      <div className="p-4">

        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-mint">
          {activity.category}
        </p>

        <p className="mt-1.5 line-clamp-1 font-bold">
          {activity.title}
        </p>

        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">

          <MapPinIcon className="h-3.5 w-3.5 shrink-0" />

          <span className="truncate">
            {activity.location}
          </span>

        </p>

        <p className="mt-1 text-xs text-muted">
          {activity.when}
        </p>

      </div>

    </Link>
  )
}

/* ======================================================
   MILESTONE
====================================================== */

function Milestone({
  milestone,
}) {
  return (
    <div className="flex items-center gap-3">

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-3 text-mint">

        {milestone.icon === 'check' && (
          <ShieldCheckIcon className="h-4 w-4" />
        )}

        {milestone.icon === 'users' && (
          <UsersIcon className="h-4 w-4" />
        )}

        {milestone.icon === 'star' && (
          <StarIcon className="h-4 w-4" />
        )}

        {![
          'check',
          'users',
          'star',
        ].includes(milestone.icon) && (
          <TrophyIcon className="h-4 w-4" />
        )}

      </div>

      <div className="min-w-0">

        <p className="text-sm font-bold">
          {milestone.title}
        </p>

        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          {milestone.subtitle}
        </p>

      </div>

    </div>
  )
}