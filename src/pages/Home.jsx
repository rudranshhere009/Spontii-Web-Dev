import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useApp } from '../context/AppContext'
import { isPrivateActivity } from '../lib/activities'

import ActivityCard from '../components/ActivityCard'
import EventPlanIdeas from '../components/EventPlanIdeas'
import FriendsSpotlight from '../components/FriendsSpotlight'
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
  const { databaseActivities, city } = useApp()
  const navigate = useNavigate()

  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setSlide((s) => (s + 1) % HERO_SLIDES.length)
    }, SLIDE_DURATION)

    return () => clearInterval(timer)
  }, [])

  const cityActivities = databaseActivities.filter(
    (activity) => activity.city?.toLocaleLowerCase() === city.toLocaleLowerCase(),
  )
  const publicActivities = cityActivities.filter((activity) =>
    !isPrivateActivity(activity),
  )
  const myEvents = databaseActivities
    .filter((activity) => activity.isHost && activity.status === 'active')
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  const suggestions = publicActivities
    .filter((activity) => !activity.isHost)
    .slice(0, 4)
  const todayCount = publicActivities.filter((activity) => activity.date === 'Today').length

  function explorePill(pill) {
    const params = new URLSearchParams()
    if (pill.category && pill.category !== 'Everything') params.set('category', pill.category)
    if (pill.id === 'free-tonight') params.set('date', 'Today')
    params.set('city', city)
    navigate(`/explore?${params.toString()}`)
  }

  return (
    <div className="wide-screen-container mx-auto max-w-[1600px] px-5 py-6 sm:px-6 sm:py-8">

      {/* Optional location request (landing page only) */}
      <LocationPrompt />

      {/* ================= HERO ================= */}

      <section data-theme="dark" className="home-hero-section relative isolate flex min-h-[460px] items-center overflow-hidden rounded-3xl border border-border sm:min-h-[500px] lg:min-h-[560px]">

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
          <div className="home-hero-copy max-w-[632px] sm:max-w-[576px] lg:max-w-[544px]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">
              {todayCount} {todayCount === 1 ? 'plan' : 'plans'} today in {city}
            </p>

            <h1 className="home-hero-title mt-5 text-[2.15rem] font-extrabold leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
              What's worth
              <br />
              <span className="text-mint">doing tonight?</span>
            </h1>

            <p className="mt-6 max-w-sm whitespace-nowrap text-base leading-relaxed text-white/75 sm:text-lg">
              Real people. Real plans. Right around you.
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
                  onClick={() => explorePill(pill)}
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
        <FriendsSpotlight />

        {myEvents.length > 0 && (
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-mint">Your plans</h2>
                <h3 className="mt-1 text-2xl font-extrabold">My events</h3>
              </div>
              <Link to="/explore" className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
                Explore all <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {myEvents.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-mint">Plan ideas · {city}</h2>
              <h3 className="mt-1 text-2xl font-extrabold">Events you could plan.</h3>
            </div>
            <Link
              to={`/explore?${new URLSearchParams({ city }).toString()}`}
              className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted hover:text-text"
            >
              Explore all <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          {suggestions.length ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  actionLabel="Explore"
                  actionTo={`/explore?${new URLSearchParams({
                    category: activity.category,
                    city: activity.city || city,
                  }).toString()}`}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface/60 p-8 text-center">
              <p className="font-semibold text-text">No event ideas in {city} yet.</p>
              <p className="mt-2 text-sm text-muted">Explore other places or be the first to publish a plan here.</p>
              <Link to={`/explore?${new URLSearchParams({ city }).toString()}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-bold text-bg">
                Explore {city} <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>

        <EventPlanIdeas />
      </div>

    </div>
  )
}
