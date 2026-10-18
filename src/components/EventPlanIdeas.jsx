import { Link } from 'react-router-dom'
import { BANNER_OPTIONS } from '../lib/activities'
import { ArrowRightIcon } from './NavIcons'

const EXTRA_IDEAS = [
  {
    label: 'Sunset Picnic',
    image:
      'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85',
  },
  {
    label: 'Art & Craft',
    image:
      'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=85',
  },
]

const EVENT_IDEAS = [...BANNER_OPTIONS, ...EXTRA_IDEAS]

export default function EventPlanIdeas() {
  return (
    <section aria-labelledby="event-plan-ideas-title" className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
          Make a plan
        </p>
        <h2 id="event-plan-ideas-title" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
          What do you feel like planning?
        </h2>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Pick an idea and bring people together around something you love.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EVENT_IDEAS.map((idea) => (
          <Link
            key={idea.label}
            to="/create"
            aria-label={`Create a ${idea.label} event`}
            className="group block overflow-hidden rounded-2xl border border-border bg-surface-2 transition-colors hover:border-mint/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <div className="aspect-[4/3] overflow-hidden bg-surface-3">
              <img
                src={idea.image}
                alt={idea.label}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <h3 className="min-w-0 truncate text-sm font-bold text-text sm:text-base">
                {idea.label}
              </h3>
              <span
                aria-hidden="true"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition group-hover:bg-emerald-700"
              >
                Explore
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
