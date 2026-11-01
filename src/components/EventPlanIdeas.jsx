import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { isPrivateActivity } from '../lib/activities'
import { ArrowRightIcon } from './NavIcons'

export default function EventPlanIdeas() {
  const { databaseActivities, city } = useApp()
  const categoryIdeas = databaseActivities
    .filter(
      (activity) =>
        !isPrivateActivity(activity) &&
        activity.city?.toLocaleLowerCase() === city.toLocaleLowerCase() &&
        activity.category,
    )
    .reduce((ideas, activity) => {
      const existing = ideas.get(activity.category)
      if (existing) {
        existing.count += 1
      } else {
        ideas.set(activity.category, {
          category: activity.category,
          count: 1,
          image: activity.image,
        })
      }
      return ideas
    }, new Map())
  const ideas = [...categoryIdeas.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  if (!ideas.length) return null

  return (
    <section aria-labelledby="event-plan-ideas-title" className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
          Happening in {city}
        </p>
        <h2 id="event-plan-ideas-title" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Explore what people are planning.
        </h2>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Browse live plans by category.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => (
          <Link
            key={idea.category}
            to={`/explore?${new URLSearchParams({ category: idea.category, city }).toString()}`}
            aria-label={`Explore ${idea.count} ${idea.category} plans`}
            className="group relative block min-h-40 overflow-hidden rounded-2xl border border-border bg-surface-2 transition-colors hover:border-mint/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {idea.image && (
              <img
                src={idea.image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/10" />
            <div className="relative flex min-h-40 flex-col justify-end p-4">
              <h3 className="text-lg font-extrabold text-text">
                {idea.category}
              </h3>
              <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                <span className="text-white/75">
                  {idea.count} {idea.count === 1 ? 'plan' : 'plans'}
                </span>
                <span className="inline-flex items-center gap-1.5 font-bold text-mint">
                  Explore <ArrowRightIcon className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
