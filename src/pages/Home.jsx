import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useApp } from '../context/AppContext'
import { isPrivateActivity } from '../lib/activities'

import ActivityCard from '../components/ActivityCard'
import EventPlanIdeas from '../components/EventPlanIdeas'
import FriendsSpotlight from '../components/FriendsSpotlight'
import LocationPrompt from '../components/LocationPrompt'

import { ArrowRightIcon } from '../components/NavIcons'

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

const HERO_SLIDE_DURATION = 7000

export default function Home() {
  const { databaseActivities, city } = useApp()
  const navigate = useNavigate()
  const [slide, setSlide] = useState(0)
  const videoRef = useRef(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setSlide((current) => (current + 1) % HERO_SLIDES.length)
      }
    }, HERO_SLIDE_DURATION)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    video.muted = true
    const startPlayback = () => {
      video.play().catch((error) => {
        console.warn(`Hero video "${HERO_SLIDES[slide].id}" could not autoplay:`, error)
      })
    }

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      startPlayback()
      return undefined
    }

    video.addEventListener('canplay', startPlayback, { once: true })
    return () => video.removeEventListener('canplay', startPlayback)
  }, [slide])

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
  const featuredActivity = publicActivities.find((activity) => activity.image)
  const categoryCounts = publicActivities.reduce((counts, activity) => {
    if (activity.category) {
      counts.set(activity.category, (counts.get(activity.category) ?? 0) + 1)
    }
    return counts
  }, new Map())

  function exploreCategory(category) {
    const params = new URLSearchParams()
    params.set('category', category)
    params.set('city', city)
    navigate(`/explore?${params.toString()}`)
  }

  function exploreToday() {
    const params = new URLSearchParams({ date: 'Today', city })
    navigate(`/explore?${params.toString()}`)
  }

  return (
    <div className="wide-screen-container mx-auto max-w-[1600px] px-5 py-6 sm:px-6 sm:py-8">

      {/* Optional location request (landing page only) */}
      <LocationPrompt />

      {/* ================= HERO ================= */}

      <section data-theme="dark" className="home-hero-section relative isolate flex min-h-[460px] items-center overflow-hidden rounded-3xl border border-border sm:min-h-[500px] lg:min-h-[560px]">
        <img
          key={`hero-poster-${HERO_SLIDES[slide].id}`}
          src={HERO_SLIDES[slide].poster}
          alt=""
          aria-hidden="true"
          className="home-hero-backdrop absolute inset-0 z-0 h-full w-full object-cover"
        />
        <video
          key={HERO_SLIDES[slide].id}
          ref={videoRef}
          src={HERO_SLIDES[slide].video}
          poster={HERO_SLIDES[slide].poster}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="home-hero-backdrop absolute inset-0 z-[1] h-full w-full object-cover"
        />
        <div className="home-hero-overlay pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-bg via-bg/80 to-bg/35 sm:bg-gradient-to-r sm:from-bg/95 sm:via-bg/75 sm:to-bg/30" />

        <div className="relative z-[3] w-full min-w-0 px-5 py-14 sm:px-12 lg:px-16">

          <div key={HERO_SLIDES[slide].id} className="home-hero-copy home-hero-copy-enter max-w-[632px] sm:max-w-[576px] lg:max-w-[544px]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">
              {todayCount} {todayCount === 1 ? 'plan' : 'plans'} today in {city}
            </p>

            <h1 className="home-hero-title mt-5 text-[2.15rem] font-extrabold leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
              What's worth
              <br />
              <span className="text-mint">doing tonight?</span>
            </h1>

            <p className="mt-6 max-w-sm text-base leading-relaxed text-white/75 sm:text-lg">
              Real people. Real plans. Right around you.
            </p>
            {featuredActivity && (
              <Link
                to={`/activities/${featuredActivity.id}`}
                className="mt-6 inline-flex max-w-full items-center gap-2 rounded-xl border border-white/20 bg-black/35 px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-mint/60 hover:text-mint"
              >
                <span className="min-w-0 truncate">
                  {featuredActivity.title}
                  {featuredActivity.when ? ` · ${featuredActivity.when}` : ''}
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0" />
              </Link>
            )}
          </div>

          <nav
            aria-label="Browse activity categories"
            className="home-hero-categories scrollbar-none -mx-5 mt-10 flex items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0"
          >
            {[...categoryCounts.entries()].map(([category, count]) => (
              <button
                key={category}
                type="button"
                onClick={() => exploreCategory(category)}
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-bg/70 px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:border-mint/50 hover:text-text"
              >
                {category}
                <span className="rounded-full bg-mint/15 px-1.5 py-0.5 text-[10px] font-bold text-mint">
                  {count}
                </span>
              </button>
            ))}
            {todayCount > 0 && (
              <button
                type="button"
                onClick={exploreToday}
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-mint/40 bg-mint/10 px-3.5 py-2 text-[13px] font-semibold text-mint transition-colors hover:bg-mint/20"
              >
                Today
                <span className="text-[10px] font-bold">{todayCount}</span>
              </button>
            )}
          </nav>

        </div>

        <div className="home-hero-slide-status z-[4]" aria-live="polite">
          <span>{String(slide + 1).padStart(2, '0')}</span>
          <span aria-hidden="true">/</span>
          <span>{String(HERO_SLIDES.length).padStart(2, '0')}</span>
        </div>
        <div className="home-hero-slide-dots absolute bottom-6 right-8 z-[4] flex items-center gap-2">
          {HERO_SLIDES.map((heroSlide, index) => (
            <button
              key={heroSlide.id}
              type="button"
              onClick={() => setSlide(index)}
              aria-label={`Show ${heroSlide.id} hero slide`}
              aria-current={slide === index ? 'true' : undefined}
              className={`home-hero-slide-dot ${slide === index ? 'is-active' : ''}`}
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
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-mint">Live in {city}</h2>
              <h3 className="mt-1 text-2xl font-extrabold">Plans happening nearby.</h3>
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
