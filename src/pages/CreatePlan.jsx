import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { categories } from '../data/mockData'
import { useApp } from '../context/AppContext'
import { GENDER_OPTIONS, imageForCategory } from '../lib/activities'
import {
  ZapIcon,
  ListIcon,
  UserIcon,
  MapPinIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  UsersIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  ClockIcon,
} from '../components/NavIcons'

const COMPANY_OPTIONS = ['Anyone', 'Friends', 'Just sharing']
const WHEN_OPTIONS = ['Now', 'Later today', 'Tomorrow']
const VIBE_OPTIONS = ['Social', 'Chill', 'Energetic', 'Foodie']
/*
 * Quick Drop "when" → the date/time strings Explore's filters understand.
 */
const WHEN_TO_SCHEDULE = {
  Now: { date: 'Today', time: 'Now' },
  'Later today': { date: 'Today', time: 'Later today' },
  Tomorrow: { date: 'Tomorrow', time: 'Flexible' },
}

/*
 * Full plan: who can join maps onto the existing public/private model
 * (visibility: 'private' → Private activities on Explore). Every plan
 * still goes through request → host approval.
 */
const ACCESS_OPTIONS = [
  {
    id: 'public',
    label: 'Anyone',
    icon: UsersIcon,
    help: 'Public plan. Anyone can find it on Explore and request to join.',
  },
  {
    id: 'private',
    label: 'Private',
    icon: LockIcon,
    help: 'Listed under Private activities. Anyone can see it, but people need an account to request, and only people you approve can join.',
  },
]

/* Capacity includes you (the host). 10 is the existing Full plan default. */
const CAPACITY_DEFAULT = 10
const CAPACITY_MIN = 2
const CAPACITY_MAX = 50

const QUICK_LOCATIONS = [
  'Koregaon Park',
  'Baner',
  'FC Road',
  'Kalyani Nagar',
  'Viman Nagar',
]

/*
 * Shared presentation. Selected = mint border + soft mint tint with warm
 * white text; unselected = quiet outline with muted text.
 */
const LABEL =
  'mb-3 block text-xs font-bold uppercase tracking-[0.12em] text-muted'

const FIELD =
  'h-14 w-full rounded-xl border border-border bg-bg/60 px-5 text-[15px] text-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-2 focus:border-mint focus:ring-2 focus:ring-mint/20'

const SUBMIT =
  'flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-mint text-base font-bold text-bg transition-[background-color,transform] duration-150 hover:bg-mint/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50'

function Pill({ active, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-[border-color,background-color,color,transform] duration-150 active:scale-[0.97] ${
        active
          ? 'border-mint/70 bg-mint-soft font-semibold text-text'
          : 'border-border bg-bg/40 font-medium text-muted hover:border-text/20 hover:text-text'
      }`}
      {...props}
    >
      {children}
    </button>
  )
}

function Section({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
    </div>
  )
}

/*
 * Small, calm explanation of Spontii's area-first location sharing.
 */
function AreaSharingNote() {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint">
        <ShieldCheckIcon className="h-4 w-4" />
      </span>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-text">
          Area sharing
        </p>

        <p className="mt-1 text-sm leading-relaxed text-muted">
          People see the general area first. The exact meeting point is
          shared only after you approve them.
        </p>
      </div>
    </div>
  )
}

function QuickDropForm() {
  const { addActivity, currentUser } = useApp()
  const navigate = useNavigate()

  const [activity, setActivity] = useState('')
  const [company, setCompany] = useState('Anyone')
  const [when, setWhen] = useState('Now')
  const [vibe, setVibe] = useState('Social')
  const [location, setLocation] = useState('')
  const [locationChip, setLocationChip] = useState('Koregaon Park')

  function handleSubmit(e) {
    e.preventDefault()

    if (!activity.trim()) return

    const id = `join-${Date.now()}`

    /*
     * Privacy: the chip is the public area; the typed meeting point is
     * only shared with approved participants (venue).
     */
    const area = locationChip
    const venue = location.trim() || null
    const schedule = WHEN_TO_SCHEDULE[when] || WHEN_TO_SCHEDULE.Now

    addActivity({
      id,
      title: activity.trim(),
      category: 'Social',
      vibe: [vibe],
      tags: ['Join Me', company],
      image: imageForCategory('Social'),
      host: currentUser,
      when: `${schedule.date} · ${schedule.time}`,
      date: schedule.date,
      time: schedule.time,
      area,
      location: area,
      distance: '0.0 km',
      badge: when.toUpperCase(),
      capacity: 6,
      going: [currentUser],
      vibeMatches: 0,
      venue,
      description: `${currentUser.name} is ${activity.trim()}. Company wanted: ${company}.`,
    })

    navigate(`/activities/${id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* Mode indicator */}
      <div className="flex items-center gap-3 rounded-xl border border-mint/20 bg-mint-soft px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-bg">
          <UserIcon className="h-[18px] w-[18px]" />
        </span>

        <div className="min-w-0">
          <p className="font-heading text-[15px] font-bold">Join Me</p>
          <p className="text-sm text-muted">
            A spontaneous status, not a formal event.
          </p>
        </div>
      </div>

      {/* What are you doing? */}
      <Section label="What are you doing?" htmlFor="quick-activity">
        <input
          id="quick-activity"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          placeholder="Going for coffee, a run, a game..."
          required
          autoComplete="off"
          className={FIELD}
        />
      </Section>

      {/* Want company? */}
      <Section label="Want company?">
        <div className="flex flex-wrap gap-2.5">
          {COMPANY_OPTIONS.map((c) => (
            <Pill
              key={c}
              active={company === c}
              onClick={() => setCompany(c)}
            >
              {c}
            </Pill>
          ))}
        </div>
      </Section>

      {/* When + Vibe */}
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-8">
        <Section label="When?">
          <div className="flex flex-wrap gap-2.5">
            {WHEN_OPTIONS.map((w) => (
              <Pill
                key={w}
                active={when === w}
                onClick={() => setWhen(w)}
              >
                {w}
              </Pill>
            ))}
          </div>
        </Section>

        <Section label="Vibe?">
          <div className="flex flex-wrap gap-2.5">
            {VIBE_OPTIONS.map((v) => (
              <Pill
                key={v}
                active={vibe === v}
                onClick={() => setVibe(v)}
              >
                {v}
              </Pill>
            ))}
          </div>
        </Section>
      </div>

      {/* Where */}
      <Section label="Where?" htmlFor="quick-venue">
        <div className="relative">
          <MapPinIcon className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

          <input
            id="quick-venue"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Exact meeting point (optional)"
            autoComplete="off"
            className={`${FIELD} pl-12`}
          />
        </div>

        <div className="mt-5">
          <AreaSharingNote />
        </div>

        <p className="mt-6 mb-3 text-sm font-semibold text-text">
          Area people will see
        </p>

        <div className="flex flex-wrap gap-2.5">
          {QUICK_LOCATIONS.map((l) => (
            <Pill
              key={l}
              active={locationChip === l}
              onClick={() => setLocationChip(l)}
            >
              {locationChip === l && (
                <MapPinIcon className="h-3.5 w-3.5 text-mint" />
              )}
              {l}
            </Pill>
          ))}
        </div>
      </Section>

      {/* Submit */}
      <div className="border-t border-text/5 pt-8">
        <button type="submit" className={SUBMIT}>
          Post Join Me
          <ArrowRightIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </form>
  )
}

function FullPlanForm() {
  const { addActivity, currentUser } = useApp()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '',
    category: 'Social',
    location: '',
    venue: '',
    date: 'Today',
    time: '',
    description: '',
    access: 'public',
    genderPreference: 'any',
    capacity: CAPACITY_DEFAULT,
    vibe: 'Social',
  })

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function changeCapacity(delta) {
    setForm((f) => ({
      ...f,
      capacity: Math.min(
        CAPACITY_MAX,
        Math.max(CAPACITY_MIN, f.capacity + delta)
      ),
    }))
  }

  const accessOption =
    ACCESS_OPTIONS.find((a) => a.id === form.access) || ACCESS_OPTIONS[0]

  function handleSubmit(e) {
    e.preventDefault()

    if (
      !form.title.trim() ||
      !form.location.trim() ||
      !form.time.trim()
    ) {
      return
    }

    const id = `plan-${Date.now()}`

    addActivity({
      id,
      title: form.title.trim(),
      category: form.category,
      ...(form.access === 'private' && { visibility: 'private' }),
      genderPreference: form.genderPreference,
      vibe: [form.vibe],
      tags: ['New plan', 'Hosted by you'],
      image: imageForCategory(form.category),
      host: currentUser,
      when: `${form.date} · ${form.time}`,
      date: form.date,
      time: form.time,
      area: form.location.trim(),
      location: form.location.trim(),
      distance: '0.0 km',
      badge:
        form.date === 'Today'
          ? 'TONIGHT'
          : form.date.toUpperCase(),
      capacity: form.capacity,
      going: [currentUser],
      vibeMatches: 0,
      venue: form.venue.trim() || null,
      description:
        form.description.trim() ||
        'No details added yet — message the host for more info.',
    })

    navigate(`/activities/${id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* What's the plan? */}
      <Section label="What's the plan?" htmlFor="full-title">
        <input
          id="full-title"
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="e.g. Evening chai & chess"
          required
          autoComplete="off"
          className={FIELD}
        />
      </Section>

      {/* Category */}
      <Section label="Category" htmlFor="full-category">
        <select
          id="full-category"
          value={form.category}
          onChange={(e) => update('category', e.target.value)}
          className={FIELD}
        >
          {categories
            .filter((c) => c !== 'Everything')
            .map((c) => (
              <option key={c}>{c}</option>
            ))}
        </select>
      </Section>

      {/* Who can join? */}
      <Section label="Who can join?">
        <div className="flex flex-wrap gap-2.5">
          {ACCESS_OPTIONS.map((option) => {
            const Icon = option.icon

            return (
              <Pill
                key={option.id}
                active={form.access === option.id}
                onClick={() => update('access', option.id)}
              >
                <Icon
                  className={`h-4 w-4 ${
                    form.access === option.id ? 'text-mint' : ''
                  }`}
                />
                {option.label}
              </Pill>
            )
          })}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          {accessOption.help}
        </p>
      </Section>

      {/* Who's it for? (host's preferred group, never the host's gender) */}
      <Section label="Who's it for?">
        <div role="group" aria-label="Who's it for?" className="flex flex-wrap gap-2.5">
          {GENDER_OPTIONS.map((option) => (
            <Pill
              key={option.id}
              active={form.genderPreference === option.id}
              onClick={() => update('genderPreference', option.id)}
            >
              {option.label}
            </Pill>
          ))}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          The group you'd like to meet, not your own gender. It's shown to
          everyone before they request, and you still review every request.
        </p>
      </Section>

      {/* Capacity */}
      <Section label="Capacity">
        <div className="flex items-center gap-4">
          <div className="inline-flex h-12 items-center rounded-full border border-border bg-bg/60 p-1">
            <button
              type="button"
              onClick={() => changeCapacity(-1)}
              disabled={form.capacity <= CAPACITY_MIN}
              aria-label="Fewer people"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text transition-colors hover:bg-text/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <MinusIcon className="h-4 w-4" />
            </button>

            <output
              aria-live="polite"
              className="w-12 text-center text-lg font-bold tabular-nums"
            >
              {form.capacity}
            </output>

            <button
              type="button"
              onClick={() => changeCapacity(1)}
              disabled={form.capacity >= CAPACITY_MAX}
              aria-label="More people"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text transition-colors hover:bg-text/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>

          <p className="text-sm leading-snug text-muted">
            people, including you
          </p>
        </div>
      </Section>

      {/* Date + Time */}
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-6">
        <Section label="Date" htmlFor="full-date">
          <select
            id="full-date"
            value={form.date}
            onChange={(e) => update('date', e.target.value)}
            className={FIELD}
          >
            {['Today', 'Tomorrow', 'This weekend', 'Next week'].map(
              (d) => (
                <option key={d}>{d}</option>
              )
            )}
          </select>
        </Section>

        <Section label="Time" htmlFor="full-time">
          <input
            id="full-time"
            value={form.time}
            onChange={(e) => update('time', e.target.value)}
            placeholder="e.g. 7:00 PM"
            required
            autoComplete="off"
            className={FIELD}
          />
        </Section>
      </div>

      {/* Vibe */}
      <Section label="Vibe?">
        <div className="flex flex-wrap gap-2.5">
          {VIBE_OPTIONS.map((v) => (
            <Pill
              key={v}
              active={form.vibe === v}
              onClick={() => update('vibe', v)}
            >
              {v}
            </Pill>
          ))}
        </div>
      </Section>

      {/* Where */}
      <Section label="Where?" htmlFor="full-area">
        <div className="relative">
          <MapPinIcon className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

          <input
            id="full-area"
            value={form.location}
            onChange={(e) => update('location', e.target.value)}
            placeholder="Area, e.g. Koregaon Park"
            required
            autoComplete="off"
            className={`${FIELD} pl-12`}
          />
        </div>

        <input
          value={form.venue}
          onChange={(e) => update('venue', e.target.value)}
          placeholder="Exact meeting point (optional)"
          aria-label="Exact meeting point (optional)"
          autoComplete="off"
          className={`${FIELD} mt-3`}
        />

        <div className="mt-5">
          <AreaSharingNote />
        </div>
      </Section>

      {/* Details */}
      <Section label="Details (optional)" htmlFor="full-details">
        <textarea
          id="full-details"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          rows={4}
          placeholder="What should people know before joining?"
          className={`${FIELD} h-auto resize-none py-4 leading-relaxed`}
        />
      </Section>

      {/* Preview */}
      <section aria-label="Preview" className="border-t border-text/5 pt-8">
        <p className={LABEL}>Preview</p>

        <div className="flex gap-4 rounded-2xl border border-border bg-bg/40 p-3 sm:p-4">
          <img
            src={imageForCategory(form.category)}
            alt=""
            className="h-24 w-24 shrink-0 rounded-xl object-cover sm:h-28 sm:w-36"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                  form.access === 'private'
                    ? 'border-mint/30 bg-mint-soft text-mint'
                    : 'border-border text-muted'
                }`}
              >
                {form.access === 'private' ? 'Private' : 'Public'}
              </span>

              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-mint">
                {form.category}
              </span>
            </div>

            <p
              className={`mt-1.5 line-clamp-2 font-heading text-lg font-bold leading-snug ${
                form.title.trim() ? 'text-text' : 'text-muted-2'
              }`}
            >
              {form.title.trim() || 'Your plan title'}
            </p>

            <div className="mt-2 space-y-1 text-sm text-muted">
              <p className="flex items-center gap-1.5">
                <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {form.date} · {form.time.trim() || 'Time not set'}
                </span>
              </p>

              <p className="flex items-center gap-1.5">
                <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {form.location.trim() || 'Area not set'}
                </span>
              </p>

              <p className="flex items-start gap-1.5">
                <UsersIcon className="mt-[3px] h-3.5 w-3.5 shrink-0" />
                <span>
                  Up to {form.capacity} · {form.vibe} vibe
                  {form.genderPreference !== 'any' &&
                    ` · For ${form.genderPreference}`}
                </span>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          {form.venue.trim()
            ? 'Your exact meeting point stays hidden until you approve someone.'
            : 'Only the area is shown. You can add an exact meeting point above.'}
        </p>
      </section>

      {/* Submit */}
      <div>
        <button type="submit" className={SUBMIT}>
          Publish plan
          <ArrowRightIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </form>
  )
}

export default function CreatePlan() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('quick')

  const MODES = [
    {
      id: 'quick',
      icon: ZapIcon,
      title: 'Quick Drop',
      subtitle: 'Join me in 20 seconds',
    },
    {
      id: 'full',
      icon: ListIcon,
      title: 'Full plan',
      subtitle: 'Add more details',
    },
  ]

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 font-body sm:px-6 sm:py-12">
      {/* Back */}
      <button
        type="button"
        onClick={() =>
          (window.history.state?.idx ?? 0) > 0
            ? navigate(-1)
            : navigate('/')
        }
        className="-my-3 flex w-fit items-center gap-2 py-3 text-sm font-semibold text-muted transition-colors hover:text-text"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <header className="mt-8 sm:mt-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">
          Bring people together
        </p>

        <h1 className="mt-3 font-heading text-[2.25rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          What are you doing?
        </h1>

        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          Start with the feeling, not an event form. Spontii helps the
          right people find the plan.
        </p>
      </header>

      {/* Mode selector (segmented) */}
      <div
        role="radiogroup"
        aria-label="Plan type"
        className="mt-10 grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-surface p-1.5"
      >
        {MODES.map((m) => {
          const selected = mode === m.id
          const Icon = m.icon

          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(m.id)}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-3 text-left sm:gap-3 transition-[background-color,border-color,color] duration-150 sm:px-4 ${
                selected
                  ? 'border-mint/40 bg-surface-3 text-text shadow-sm shadow-black/30'
                  : 'border-transparent text-muted hover:bg-text/[0.03] hover:text-text'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9 ${
                  selected ? 'bg-mint text-bg' : 'bg-surface-2 text-muted'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>

              <span className="min-w-0">
                <span className="block font-heading text-[15px] font-bold">
                  {m.title}
                </span>
                <span className="block text-xs leading-snug text-muted">
                  {m.subtitle}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Form */}
      <div className="mt-6 rounded-3xl bg-surface p-5 sm:p-10">
        {mode === 'quick' ? <QuickDropForm /> : <FullPlanForm />}
      </div>
    </div>
  )
}
