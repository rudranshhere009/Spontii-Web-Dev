import { Link } from 'react-router-dom'
import AvatarStack from './AvatarStack'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  ShieldCheckIcon,
  CheckIcon,
  ClockIcon,
  ArrowRightIcon,
  MapPinIcon,
} from './NavIcons'

const STATUS_LABEL = {
  hosting: "You're hosting",
  going: "You're going",
  pending: 'Request pending',
  rejected: 'Request again',
  none: 'Request to join',
}

const STATUS_ICON = {
  going: CheckIcon,
  hosting: CheckIcon,
  pending: ClockIcon,
  rejected: ArrowRightIcon,
  none: ArrowRightIcon,
}

export default function ActivityCard({ activity, featured = false }) {
  const { getParticipation } = useApp()
  const { isAuthenticated } = useAuth()

  /*
   * Joining always goes through ActivityDetail → request → host approval.
   * Logged-out visitors get no personal state.
   */
  const participation = isAuthenticated
    ? getParticipation(activity.id)
    : { status: 'none', spotsLeft: Math.max(activity.capacity - activity.going.length, 0) }

  const { status, spotsLeft } = participation
  const going = status === 'going' || status === 'hosting'
  const isFull = spotsLeft <= 0 && !going && status !== 'pending'
  const label = isFull ? 'Plan is full' : STATUS_LABEL[status]
  const LabelIcon = isFull ? null : STATUS_ICON[status]

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-2 transition-colors hover:border-mint/40">
      <Link to={`/activities/${activity.id}`} data-theme="dark" className="relative block">
        <img
          src={activity.image}
          alt={activity.title}
          className={`w-full object-cover ${featured ? 'h-72' : 'h-44'}`}
          loading="lazy"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-mint backdrop-blur">
            {activity.badge}
          </span>
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-text backdrop-blur">
            {activity.priceLabel}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-text">
            <img src={activity.host.avatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            <span className="truncate">Hosted by {activity.host.name}</span>
            {activity.host.verified && (
              <span className="flex shrink-0 items-center gap-1 text-mint">
                <ShieldCheckIcon className="h-3.5 w-3.5" />
                Verified
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="p-4">
        <Link to={`/activities/${activity.id}`}>
          <h3 className="text-lg font-extrabold leading-snug hover:text-mint">{activity.title}</h3>
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <ClockIcon className="h-4 w-4 shrink-0" />
            {activity.when}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPinIcon className="h-4 w-4 shrink-0" />
            {activity.location} · {activity.distance}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {activity.tags.map((t) => (
            <span
              key={t}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted"
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <AvatarStack people={activity.going} max={3} size={26} />
              <span className="whitespace-nowrap text-sm font-semibold">{activity.going.length} going</span>
            </div>
            {activity.vibeMatches > 0 && (
              <span className="truncate text-xs text-muted">
                {activity.vibeMatches} people you may vibe with
              </span>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {!going && spotsLeft <= 4 && spotsLeft > 0 && (
              <span className="text-xs font-semibold text-warning">{spotsLeft} spots left</span>
            )}
            <Link
              to={`/activities/${activity.id}`}
              className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors ${
                going
                  ? 'bg-mint text-bg'
                  : 'bg-text/10 text-text hover:bg-mint hover:text-bg'
              }`}
            >
              {label}
              {LabelIcon && <LabelIcon className="h-3.5 w-3.5" />}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
