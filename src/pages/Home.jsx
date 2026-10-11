import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { people } from '../data/mockData'
import { useApp } from '../context/AppContext'
import { isPrivateActivity } from '../lib/activities'

import ActivityCard from '../components/ActivityCard'
import PersonCard from '../components/PersonCard'
import LocationPrompt from '../components/LocationPrompt'

import {
  ArrowRightIcon,
  ActivityIcon,
  TreeIcon,
  UtensilsIcon,
  MoonIcon,
  ZapIcon,
  UsersIcon,
} from '../components/NavIcons'

const HERO_SLIDES = [
  {
    id: 'football',
    video: 'https://assets.mixkit.co/videos/43494/43494-720.mp4',
    poster:
      'https://images.unsplash.com/photo-1724092461963-605d96a95c20?fm=jpg&q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'volleyball',
    video: 'https://assets.mixkit.co/videos/12321/12321-720.mp4',
    poster:
      'https://images.unsplash.com/photo-1581607961723-a94f1293ebdc?fm=jpg&q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'running',
    video: 'https://assets.mixkit.co/videos/608/608-720.mp4',
    poster:
      'https://images.unsplash.com/photo-1759167581561-3b1fbe906b52?fm=jpg&q=80&w=1600&auto=format&fit=crop',
  },
]

const SLIDE_DURATION = 7000

const HERO_PILLS = [
  {
    id: 'free-tonight',
    label: "I'm free tonight",
    icon: ZapIcon,
    category: 'Everything',
    vibe: 'All vibes',
  },
  {
    id: 'meet-people',
    label: 'Meet new people',
    icon: UsersIcon,
    category: 'Social',
    vibe: 'Social',
  },
  {
    id: 'active',
    label: 'Something active',
    icon: ActivityIcon,
    category: 'Sports',
    vibe: 'Energetic',
  },
  {
    id: 'outdoors',
    label: 'Outdoors',
    icon: TreeIcon,
    category: 'Outdoors',
    vibe: 'All vibes',
  },
  {
    id: 'food',
    label: 'Good food',
    icon: UtensilsIcon,
    category: 'Food',
    vibe: 'Foodie',
  },
  {
    id: 'chill',
    label: 'Just chill',
    icon: MoonIcon,
    category: 'Games',
    vibe: 'Chill',
  },
]

export default function Home() {
  const { activities, city } = useApp()
  const navigate = useNavigate()

  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setSlide((s) => (s + 1) % HERO_SLIDES.length)
    }, SLIDE_DURATION)

    return () => clearInterval(timer)
  }, [])

  /*
   * Home only surfaces public plans (it is also the logged-out landing).
   */
  const publicActivities = activities.filter(
    (a) => !isPrivateActivity(a),
  )

  const featured = publicActivities[0]
  const curated = publicActivities.slice(1, 5)

  const todayCount = publicActivities.filter(
    (a) => a.date === 'Today',
  ).length

          function goToPill(pill) {
            const params = new URLSearchParams();

            // 1. Pass down Category parameters matching your exact card profiles
            if (pill.category && pill.category !== "Everything") {
              params.set("category", pill.category);
            }

            // 2. Handle specific Date parameters ("I'm free tonight" -> Today)
            if (pill.id === "free-tonight") {
              params.set("date", "Today");
            }

            // 3. Directly bind your original landing card actions to specific categories
            if (pill.id === "meet-people") {
              params.set("category", "Social");
            } else if (pill.id === "active") {
              params.set("category", "Sports");
            } else if (pill.id === "outdoors") {
              params.set("category", "Outdoors");
            } else if (pill.id === "food") {
              params.set("category", "Food");
            } else if (pill.id === "chill") {
              params.set("category", "Games");
            }

            // Clean backtick navigation string fixes the raw '\$' url character injection
            navigate(
              params.toString() ? `/explore?${params.toString()}` : "/explore",
            );
          }





  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-6 sm:py-8">

      {/* Optional location request (landing page only) */}
      <LocationPrompt />

      {/* ================= HERO ================= */}

      <section data-theme="dark" className="relative isolate flex min-h-[460px] items-center overflow-hidden rounded-3xl border border-border sm:min-h-[500px] lg:min-h-[560px]">

        <video
          key={HERO_SLIDES[slide].id}
          src={HERO_SLIDES[slide].video}
          poster={HERO_SLIDES[slide].poster}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />

        {/* Readability overlay: bottom-up on mobile, left-to-right on larger screens */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/75 to-bg/30 sm:bg-gradient-to-r sm:from-bg/95 sm:via-bg/70 sm:to-transparent" />

        <div className="w-full min-w-0 px-5 py-14 sm:px-12 lg:px-16">

          {/* Same text measure as before; only the chip row runs wider */}
          <div className="max-w-[632px] sm:max-w-[576px] lg:max-w-[544px]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">
              {todayCount} {todayCount === 1 ? 'plan' : 'plans'} today in {city}
            </p>

            <h1 className="mt-5 text-[2.15rem] font-extrabold leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
              What's worth
              <br />
              <span className="text-mint">doing tonight?</span>
            </h1>

            <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/75">
              Real people. Real plans.
              <br />
              Right around you.
            </p>
          </div>

          {/* BROWSE BY MOOD: sits where the hero search used to be */}
          <nav
            aria-label="Browse by mood"
            className="scrollbar-none -mx-5 mt-10 flex items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0"
          >
            {HERO_PILLS.map((pill) => {
              const Icon = pill.icon

              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => goToPill(pill)}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-bg/60 px-3.5 py-2 text-[13px] font-medium text-muted backdrop-blur-sm transition-colors hover:border-mint/50 hover:text-text"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {pill.label}
                </button>
              )
            })}
          </nav>

        </div>

        {/* SLIDE DOTS */}
        <div className="absolute bottom-6 right-8 z-10 flex items-center gap-1.5">
          {HERO_SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSlide(i)}
              aria-label={`Show ${s.id} slide`}
              className={`h-2 w-2 rounded-full transition-all ${
                i === slide
                  ? 'w-5 bg-mint'
                  : 'bg-text/30 hover:bg-text/50'
              }`}
            />
          ))}
        </div>
      </section>

      <div className="mt-14 space-y-14">

        {/* ================= RIGHT NOW ================= */}

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">

          <div className="lg:col-span-2">

            <div className="mb-4 flex items-center justify-between">

              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
                  Right now in {city}
                </h2>

                <h3 className="mt-1 text-2xl font-extrabold">
                  People are already out.
                </h3>
              </div>

              <Link
                to="/explore"
                className="-my-2.5 flex shrink-0 items-center gap-1.5 whitespace-nowrap py-2.5 text-sm font-semibold text-muted transition-colors hover:text-text"
              >
                See all
                <ArrowRightIcon className="h-4 w-4" />
              </Link>

            </div>

            {featured && (
              <ActivityCard
                activity={featured}
                featured
              />
            )}

          </div>

          {/* ================= SIDEBAR ================= */}

          <div className="space-y-6">

            <div className="rounded-2xl border border-mint/30 bg-mint-soft p-5">

              <h4 className="text-xs font-bold uppercase tracking-wide text-mint">
                {city} tonight
              </h4>

              <p className="mt-2 text-lg font-bold leading-snug">
                The city has {todayCount}{' '}
                {todayCount === 1 ? 'plan' : 'plans'} worth showing up
                for today.
              </p>

              <Link
                to="/explore"
                className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold transition-colors hover:bg-text/5"
              >
                Explore today's plans
              </Link>

            </div>

            <div className="rounded-2xl border border-border bg-surface-2 p-5">

              <h4 className="flex items-center gap-2 font-bold">
                Trust is the feature
              </h4>

              <p className="mt-2 text-sm text-muted">
                Every person you see is building a
                real-world reputation through showing up,
                hosting well and making good connections.
              </p>

              <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-mint">
                Verified

                <span className="text-muted">
                  Identity outcomes, never documents.
                </span>
              </span>

            </div>

          </div>
        </section>

        {/* ================= PEOPLE ================= */}

        <section>

          <div className="mb-4 flex items-center justify-between">

            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
                The social layer
              </h2>

              <h3 className="mt-1 text-2xl font-extrabold">
                People you may vibe with.
              </h3>
            </div>

            <Link
              to="/profile"
              className="-my-2.5 flex shrink-0 items-center gap-1.5 whitespace-nowrap py-2.5 text-sm font-semibold text-muted transition-colors hover:text-text"
            >
              Your passport
              <ArrowRightIcon className="h-4 w-4" />
            </Link>

          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {people.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
              />
            ))}

          </div>
        </section>

        {/* ================= CURATED PLANS ================= */}

        <section>

          <div className="mb-4 flex items-center justify-between">

            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
                Curated for you
              </h2>

              <h3 className="mt-1 text-2xl font-extrabold">
                Plans for your next few hours.
              </h3>
            </div>

            <Link
              to="/explore"
              className="-my-2.5 flex shrink-0 items-center gap-1.5 whitespace-nowrap py-2.5 text-sm font-semibold text-muted transition-colors hover:text-text"
            >
              Explore all
              <ArrowRightIcon className="h-4 w-4" />
            </Link>

          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

            {curated.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
              />
            ))}

          </div>
        </section>

      </div>

    </div>
  )
}
