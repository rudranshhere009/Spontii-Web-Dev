import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { categories } from '../data/mockData'
import { useApp } from '../context/AppContext'
import { apiRequest } from '../lib/api'
import { BANNER_OPTIONS } from '../lib/activities'
import {
  CITY_STATES,
  CITY_CENTERS,
  fetchCitiesForState,
  geocodeCity,
  getSelectedCityCenter,
  getSelectedCity,
  getSelectedState,
  INDIA_STATES,
  requestIndianLocation,
  STATE_CENTERS,
} from '../lib/location'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  MapPinIcon,
  NavigationIcon,
  PlusIcon,
  StarIcon,
  UsersIcon,
} from '../components/NavIcons'

const FIELD =
  'h-10 w-full rounded-lg border border-border bg-bg/60 px-3 text-[13px] text-text outline-none transition-colors placeholder:text-muted-2 focus:border-mint focus:ring-2 focus:ring-mint/10'
const LABEL = 'mb-1.5 block text-xs font-semibold text-muted'
const STATE_NAMES = INDIA_STATES.map(({ name }) => name)

function dateTimeParts(value) {
  const [date = '', time = ''] = value.split('T')
  return { date, time }
}

function updateDateTimePart(value, part, nextValue) {
  const current = dateTimeParts(value)
  return `${part === 'date' ? nextValue : current.date}T${part === 'time' ? nextValue : current.time}`
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function DateField({ id, label, value, min, onChange }) {
  const [open, setOpen] = useState(false)
  const selectedDate = value ? parseDate(value) : new Date()
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  )
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
  const firstDayOffset = (monthStart.getDay() + 6) % 7
  const calendarStart = new Date(monthStart)
  calendarStart.setDate(monthStart.getDate() - firstDayOffset)
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart)
    day.setDate(calendarStart.getDate() + index)
    return day
  })
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(visibleMonth)

  return (
    <div className="relative min-w-0">
      <span className="sr-only" id={`${id}-label`}>{label}</span>
      <button
        id={id}
        type="button"
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
          setOpen((previous) => !previous)
        }}
        className="event-picker-trigger group flex h-11 w-full min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 text-left transition hover:border-sky-400/50 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/15"
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-sky-400" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">
          {value ? new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(selectedDate) : 'Choose date'}
        </span>
        <ChevronDownIcon className={`mr-0.5 h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="event-calendar-popover absolute left-0 top-full z-40 mt-2 w-[min(19rem,calc(100vw-3rem))] rounded-2xl border border-border bg-surface p-3 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition hover:border-sky-400/50 hover:text-sky-400"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-text">{monthLabel}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition hover:border-sky-400/50 hover:text-sky-400"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day} className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dateValue = formatDate(day)
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth()
              const isSelected = dateValue === value
              const isDisabled = Boolean(min && dateValue < min)
              return (
                <button
                  key={dateValue}
                  type="button"
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChange(dateValue)
                    setOpen(false)
                  }}
                  className={`h-9 rounded-lg text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-25 ${isSelected ? 'bg-sky-500 font-bold text-white shadow-sm shadow-sky-500/25' : isCurrentMonth ? 'text-text hover:bg-sky-400/15 hover:text-sky-300' : 'text-muted/50 hover:bg-surface-2'} `}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex justify-end border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                const today = formatDate(new Date())
                if (!min || today >= min) onChange(today)
                setOpen(false)
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-400/10"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TimeField({ id, label, value, onChange }) {
  const [hour = '00', minute = '00'] = value.split(':')
  const setPart = (part, rawValue) => {
    const number = Number(rawValue)
    if (!Number.isInteger(number)) return
    const nextValue = String(Math.max(0, Math.min(part === 'hour' ? 23 : 59, number))).padStart(2, '0')
    onChange(part === 'hour' ? `${nextValue}:${minute}` : `${hour}:${nextValue}`)
  }

  return (
    <div className="event-time-control flex h-11 min-w-0 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-400/15">
      <ClockIcon className="h-4 w-4 shrink-0 text-sky-400" />
      <span className="sr-only" id={`${id}-label`}>{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5" aria-label={label}>
        {[
          { part: 'hour', value: hour, max: 23, label: 'Hour' },
          { part: 'minute', value: minute, max: 59, label: 'Minute' },
        ].map(({ part, value: partValue, max, label: partLabel }, index) => (
          <div key={part} className="flex items-center gap-1">
            <input
              aria-label={`${label} ${partLabel.toLowerCase()}`}
              type="number"
              min="0"
              max={max}
              inputMode="numeric"
              value={partValue}
              onChange={(event) => setPart(part, event.target.value)}
              className="event-time-segment h-8 w-10 rounded-lg border border-sky-400/20 bg-sky-400/10 text-center text-xs font-semibold tabular-nums text-sky-300 outline-none transition focus:border-sky-400/60"
            />
            {index === 0 && <span className="text-xs font-bold text-muted">:</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function SelectField({ id, label, value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <div className="relative">
      <label className={LABEL} htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
            setOpen(false)
          }
        }}
        className={`${FIELD} flex items-center justify-between gap-3 text-left hover:border-text/25`}
      >
        <span className="truncate">{selected?.label || value}</span>
        <ChevronDownIcon className={`mr-1 h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface-2 p-1.5 shadow-xl"
        >
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-mint/10 hover:text-mint ${option.value === value ? 'bg-mint/10 font-semibold text-mint' : 'text-text'}`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SearchableField({
  id,
  label,
  value,
  options,
  placeholder,
  onSelect,
  loading = false,
  disabled = false,
  emptyMessage = 'No matches found',
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const filtered = options.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  return (
    <div className="relative">
      <label className={LABEL} htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          className={`${FIELD} pr-10`}
          value={open ? query : value}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              setQuery('')
            } else if (event.key === 'Enter' && filtered.length) {
              event.preventDefault()
              onSelect(filtered[0])
              setOpen(false)
              setQuery('')
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false)
              setQuery('')
            }, 100)
          }}
        />
        <ChevronDownIcon className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && !disabled && (
        <ul
          id={`${id}-options`}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface-2 p-1.5 shadow-xl"
        >
          {filtered.length ? filtered.map((option) => (
            <li key={option} role="option" aria-selected={option === value}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option)
                  setOpen(false)
                  setQuery('')
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-mint/10 hover:text-mint ${option === value ? 'bg-mint/10 font-semibold text-mint' : 'text-text'}`}
              >
                {option}
              </button>
            </li>
          )) : (
            <li className="px-3 py-2 text-[13px] text-muted">
              {loading ? 'Loading options…' : emptyMessage}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function roundedDateTime(hoursFromNow) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDuration(start, end) {
  const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000))
  if (!minutes) return 'Duration will appear once times are set'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours ? `${hours} hr${hours === 1 ? '' : 's'}` : ''}${hours && remainder ? ' ' : ''}${remainder ? `${remainder} min` : ''}`
}

function MapPicker({ center, coordinates, pendingCoordinates, onMapPick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onMapPickRef = useRef(onMapPick)
  const initialCenterRef = useRef(center)

  useEffect(() => {
    onMapPickRef.current = onMapPick
  }, [onMapPick])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const map = L.map(containerRef.current, { scrollWheelZoom: true })
      .setView(initialCenterRef.current, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    map.on('click', (event) => {
      onMapPickRef.current([event.latlng.lat, event.latlng.lng])
    })
    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || coordinates) return
    mapRef.current.setView(center, 12, { animate: true })
  }, [coordinates, center])

  useEffect(() => {
    const map = mapRef.current
    const point = pendingCoordinates || coordinates
    if (!map) return

    if (point) {
      if (markerRef.current) {
        markerRef.current.setLatLng(point)
      } else {
        const icon = L.divIcon({
          className: 'event-map-marker',
          html: '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10.5c0 5-8 10-8 10s-8-5-8-10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10.5" r="2.5"/></svg></span>',
          iconSize: [36, 44],
          iconAnchor: [18, 42],
        })
        markerRef.current = L.marker(point, { icon, draggable: true }).addTo(map)
        markerRef.current.on('dragend', (event) => {
          const { lat, lng } = event.target.getLatLng()
          onMapPickRef.current([lat, lng])
        })
      }
      map.panTo(point, { animate: true, duration: 0.35 })
    } else if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
  }, [coordinates, pendingCoordinates])

  return (
    <div
      ref={containerRef}
      aria-label="Choose the event location on the map"
      className="event-map relative z-0 h-80 w-full overflow-hidden rounded-xl border border-border sm:h-[430px] lg:h-[480px]"
    />
  )
}

async function reverseGeocode([latitude, longitude]) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    lang: 'en',
  })
  const response = await fetch(`https://photon.komoot.io/reverse?${params}`)
  if (!response.ok) throw new Error('Could not identify that map location. Try another point.')

  const result = await response.json()
  const place = result.features?.find((item) => item.properties?.countrycode === 'IN')?.properties
  if (!place) throw new Error('Choose a location in India.')

  const city = place.city || place.town || place.village || place.municipality || place.district || ''
  const area = place.suburb || place.neighbourhood || place.locality || place.district || city
  const street = [place.housenumber, place.street].filter(Boolean).join(' ')
  const venueName = place.name && ![city, area, place.state].includes(place.name)
    ? place.name
    : ''
  const landmark = [venueName, street].filter(Boolean).join(', ')
  const addressParts = [
    street,
    area,
    city,
    place.state,
    place.postcode,
    'India',
  ].filter(Boolean)
  const venueAddress = [...new Set(addressParts)]
    .filter((part, index, parts) =>
      parts.findIndex((candidate) => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index,
    )
    .join(', ')
  return { city, state: place.state || '', area, venueName, landmark, venueAddress }
}

export default function CreatePlan() {
  const navigate = useNavigate()
  const { city: currentCity, currentUser, publishActivity } = useApp()
  const savedCity = getSelectedCity() || currentCity || currentUser.city || ''
  const savedState = getSelectedState() || CITY_STATES[savedCity] || ''
  const [selectedState, setSelectedState] = useState(savedState)
  const [cityOptions, setCityOptions] = useState(
    () => savedCity ? [savedCity] : [],
  )
  const [citiesLoading, setCitiesLoading] = useState(Boolean(savedState))
  const [citiesError, setCitiesError] = useState('')
  const [mapCenter, setMapCenter] = useState(
    () => getSelectedCityCenter()
      || CITY_CENTERS[savedCity]
      || STATE_CENTERS[savedState]
      || [22.5, 78.5],
  )
  const [customTag, setCustomTag] = useState('')
  const [customPreference, setCustomPreference] = useState('')
  const [durationHours, setDurationHours] = useState(2)
  const [form, setForm] = useState(() => ({
    title: '',
    category: 'Social',
    city: savedCity,
    state: savedState,
    area: '',
    venueName: '',
    venueAddress: '',
    landmark: '',
    description: '',
    startsAt: roundedDateTime(1),
    endsAt: roundedDateTime(3),
    capacity: 12,
    visibility: 'public',
    requestCutoffMinutes: 15,
    vibe: 'Social',
    foodAvailable: false,
    foodPreference: 'any',
    beveragesAvailable: false,
    drinksAvailable: false,
    attendeePreference: 'Anyone',
    experienceLevel: 'Any experience',
    preferences: [],
    tags: [],
    bannerImage: BANNER_OPTIONS[0]?.image || '',
    coordinates: null,
  }))
  const [pendingCoordinates, setPendingCoordinates] = useState(null)
  const [photos, setPhotos] = useState([])
  const [videos, setVideos] = useState([])
  const [photoPreviews, setPhotoPreviews] = useState([])
  const [videoPreviews, setVideoPreviews] = useState([])
  const photoUrlsRef = useRef([])
  const videoUrlsRef = useRef([])
  const mapLookupSequenceRef = useRef(0)
  const pendingPlaceRef = useRef(null)
  const [mapLookupBusy, setMapLookupBusy] = useState(false)
  const [locationBusy, setLocationBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [points, setPoints] = useState(null)
  const [pointsError, setPointsError] = useState('')

  useEffect(() => {
    let active = true
    const loadPoints = () => {
      apiRequest('/points')
        .then((result) => {
          if (active) {
            setPoints(result)
            setPointsError('')
          }
        })
        .catch((loadError) => {
          if (active) {
            console.error('Failed to load Spontii points:', loadError)
            setPointsError('Your Spontii points could not be loaded. Publishing will still be checked securely.')
          }
        })
    }
    loadPoints()
    window.addEventListener('spontii:points-updated', loadPoints)
    return () => {
      active = false
      window.removeEventListener('spontii:points-updated', loadPoints)
    }
  }, [])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    if (!selectedState) {
      return undefined
    }

    const controller = new AbortController()
    fetchCitiesForState(selectedState, controller.signal)
      .then((cities) => {
        if (!controller.signal.aborted) {
          setCityOptions(
            form.city && !cities.includes(form.city)
              ? [form.city, ...cities]
              : cities,
          )
        }
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') {
          setCitiesError(loadError.message)
          setCityOptions(form.city ? [form.city] : [])
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCitiesLoading(false)
      })
    return () => controller.abort()
  }, [selectedState, form.city])

  useEffect(() => () => {
    photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    videoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function updateStartPart(part, nextValue) {
    const startsAt = updateDateTimePart(form.startsAt, part, nextValue)
    const nextEnd = new Date(new Date(startsAt).getTime() + durationHours * 60 * 60 * 1000)
    update('startsAt', startsAt)
    update('endsAt', `${formatDate(nextEnd)}T${String(nextEnd.getHours()).padStart(2, '0')}:${String(nextEnd.getMinutes()).padStart(2, '0')}`)
  }

  function updateEndPart(part, nextValue) {
    const endsAt = updateDateTimePart(form.endsAt, part, nextValue)
    const difference = Math.round((new Date(endsAt) - new Date(form.startsAt)) / (60 * 60 * 1000))
    if (difference < 1 || difference > 24) {
      updateDuration(Math.max(1, Math.min(24, difference)))
      return
    }
    setDurationHours(difference)
    update('endsAt', endsAt)
  }

  function updateDuration(nextDuration) {
    setDurationHours(nextDuration)
    const endsAt = new Date(new Date(form.startsAt).getTime() + nextDuration * 60 * 60 * 1000)
    update('endsAt', `${formatDate(endsAt)}T${String(endsAt.getHours()).padStart(2, '0')}:${String(endsAt.getMinutes()).padStart(2, '0')}`)
  }

  function chooseState(state) {
    mapLookupSequenceRef.current += 1
    pendingPlaceRef.current = null
    setMapLookupBusy(false)
    setSelectedState(state)
    update('state', state)
    setCitiesLoading(true)
    setCitiesError('')
    setCityOptions([])
    update('city', '')
    update('area', '')
    update('venueName', '')
    update('landmark', '')
    update('venueAddress', '')
    update('coordinates', null)
    setPendingCoordinates(null)
    setMapCenter(STATE_CENTERS[state] || [22.5, 78.5])
  }

  async function chooseCity(city) {
    mapLookupSequenceRef.current += 1
    pendingPlaceRef.current = null
    setMapLookupBusy(false)
    update('city', city)
    update('area', city)
    update('venueName', '')
    update('landmark', '')
    update('venueAddress', '')
    update('coordinates', null)
    setPendingCoordinates(null)
    setError('')
    try {
      const center = await geocodeCity(city, selectedState)
      setMapCenter(center)
    } catch (geocodeError) {
      setError(geocodeError.message)
    }
  }

  function addCustomTag() {
    const tag = customTag.trim().replace(/^#+/, '').replace(/\s+/g, '-')
    if (!tag || form.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return
    if (form.tags.length >= 10) {
      setError('Add up to 10 event hashtags.')
      return
    }
    update('tags', [...form.tags, tag])
    setCustomTag('')
    setError('')
  }

  function togglePreference(preference) {
    update(
      'preferences',
      form.preferences.includes(preference)
        ? form.preferences.filter((item) => item !== preference)
        : [...form.preferences, preference],
    )
  }

  function addCustomPreference() {
    const preference = customPreference.trim()
    if (!preference || form.preferences.some((item) => item.toLowerCase() === preference.toLowerCase())) return
    if (form.preferences.length >= 12) {
      setError('Add up to 12 event preferences.')
      return
    }
    update('preferences', [...form.preferences, preference])
    setCustomPreference('')
    setError('')
  }

  function setMapPoint(point) {
    setPendingCoordinates(point)
    setError('')
    pendingPlaceRef.current = null
    const lookupSequence = ++mapLookupSequenceRef.current
    setMapLookupBusy(true)
    setForm((previous) => ({
      ...previous,
      area: '',
      venueName: '',
      landmark: '',
      venueAddress: '',
    }))
    reverseGeocode(point)
      .then((place) => {
        if (lookupSequence !== mapLookupSequenceRef.current) return
        pendingPlaceRef.current = { point, place }
        setForm((previous) => ({
          ...previous,
          city: place.city || previous.city,
          area: place.area,
          venueName: place.venueName,
          landmark: place.landmark,
          venueAddress: place.venueAddress,
        }))
        if (STATE_NAMES.includes(place.state)) {
          setSelectedState(place.state)
          setCitiesLoading(true)
        }
      })
      .catch((locationError) => {
        if (lookupSequence === mapLookupSequenceRef.current) {
          setError(locationError.message)
        }
      })
      .finally(() => {
        if (lookupSequence === mapLookupSequenceRef.current) {
          setMapLookupBusy(false)
        }
      })
  }

  async function applyMapLocation(point = pendingCoordinates) {
    if (!point) {
      setError('Click a point on the map first, then choose “Use this location”.')
      return
    }
    setLocationBusy(true)
    setError('')
    try {
      const cachedPlace = pendingPlaceRef.current
      const place = cachedPlace
        && cachedPlace.point[0] === point[0]
        && cachedPlace.point[1] === point[1]
        ? cachedPlace.place
        : await reverseGeocode(point)
      setForm((previous) => ({
        ...previous,
        coordinates: point,
        city: place.city || previous.city,
        area: place.area,
        venueName: place.venueName,
        landmark: place.landmark,
        venueAddress: place.venueAddress,
      }))
      if (STATE_NAMES.includes(place.state)) {
        setSelectedState(place.state)
        setCitiesLoading(true)
      }
      setMapCenter(point)
      setPendingCoordinates(null)
      pendingPlaceRef.current = null
    } catch (locationError) {
      setError(locationError.message)
    } finally {
      setLocationBusy(false)
    }
  }

  async function useCurrentLocation() {
    setLocationBusy(true)
    setError('')
    mapLookupSequenceRef.current += 1
    pendingPlaceRef.current = null
    setMapLookupBusy(false)
    try {
      const place = await requestIndianLocation()
      let placeDetails = {
        city: place.city,
        state: place.state,
        area: place.city,
        venueName: '',
        landmark: '',
        venueAddress: '',
      }
      try {
        const addressDetails = await reverseGeocode(place.coordinates)
        placeDetails = {
          ...placeDetails,
          ...addressDetails,
          city: addressDetails.city || place.city,
          state: addressDetails.state || place.state,
          area: addressDetails.area || place.city,
        }
      } catch (detailsError) {
        setError(`Location selected, but address details could not be loaded: ${detailsError.message}`)
      }
      setForm((previous) => ({
        ...previous,
        city: placeDetails.city,
        state: placeDetails.state || previous.state,
        area: placeDetails.area,
        venueName: placeDetails.venueName,
        landmark: placeDetails.landmark,
        venueAddress: placeDetails.venueAddress,
        coordinates: place.coordinates,
      }))
      if (STATE_NAMES.includes(placeDetails.state)) {
        setSelectedState(placeDetails.state)
        setCitiesLoading(true)
      }
      setMapCenter(place.coordinates)
      setPendingCoordinates(null)
    } catch (locationError) {
      setError(locationError.message)
    } finally {
      setLocationBusy(false)
    }
  }

  function setFiles(files, kind) {
    const selected = Array.from(files || [])
    if (kind === 'image' && selected.length > 6) {
      setError('Choose up to 6 venue photos.')
      return
    }
    if (kind === 'video' && selected.length > 2) {
      setError('Choose up to 2 venue videos.')
      return
    }
    setError('')
    const urls = selected.map((file) => URL.createObjectURL(file))
    if (kind === 'image') {
      photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      photoUrlsRef.current = urls
      setPhotos(selected)
      setPhotoPreviews(urls)
    } else {
      videoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      videoUrlsRef.current = urls
      setVideos(selected)
      setVideoPreviews(urls)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const startsAt = new Date(form.startsAt)
    const endsAt = new Date(form.endsAt)
    if (!form.coordinates) {
      setError('Choose and use a location on the map before publishing.')
      return
    }
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      setError('Choose a start time in the future.')
      return
    }
    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setError('The end time must be after the start time.')
      return
    }
    if (endsAt - startsAt > 7 * 24 * 60 * 60 * 1000) {
      setError('An event can last up to 7 days.')
      return
    }

    setSubmitting(true)
    try {
      const activity = await publishActivity({
        ...form,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        area: form.area.trim(),
        venueAddress: form.venueAddress.trim(),
        venueName: form.venueName.trim(),
        description: form.description.trim(),
      }, [...photos, ...videos])
      navigate(`/activities/${activity.id}`)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const duration = formatDuration(form.startsAt, form.endsAt)

  return (
    <div className="wide-screen-container mx-auto w-full px-4 py-5 sm:px-6 lg:px-8 2xl:px-10">
      <button
        type="button"
        onClick={() => (window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/')}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-text"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </button>

      <header className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
          Create an event
          </h1>
          <p className="text-xs leading-relaxed text-muted sm:text-[13px]">
            — Add the details, choose a venue, and publish your plan.
          </p>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mint/20 bg-mint/5 px-4 py-3">
        <div>
          <p className="text-xs font-bold text-text">Spontii points unlock activity creation</p>
          <p className="mt-1 text-xs text-muted">
            The first activity needs 100 points; each next one needs 50 more. Points are never spent, and each published activity adds 50.
          </p>
          {pointsError && <p role="status" className="mt-1 text-[11px] text-muted">{pointsError}</p>}
        </div>
        <div className="rounded-xl border border-mint/25 bg-surface px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Your balance</p>
          <p className="text-sm font-extrabold text-mint">
            {points ? `${points.balance} points` : 'Loading…'}
          </p>
          {points && (
            <p className="flex items-center justify-end gap-1 text-[10px] text-muted">
              <span>{points.nextActivityCost} needed · Activity</span>
              <StarIcon className="h-3 w-3 fill-current text-mint" />
              <span>{points.activitiesCreated + 1}</span>
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-[13px]">
        <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="event-title">Event name</label>
            <input
              id="event-title"
              className={FIELD}
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="e.g. Sunset rooftop dinner"
              maxLength={120}
              required
            />
          </div>
          <div>
            <SelectField
              id="event-category"
              label="Type"
              value={form.category}
              onChange={(value) => update('category', value)}
              options={categories
                .filter((category) => category !== 'Everything')
                .map((category) => ({ value: category, label: category }))}
            />
          </div>
          <div>
            <SelectField
              id="event-vibe"
              label="Vibe"
              value={form.vibe}
              onChange={(value) => update('vibe', value)}
              options={['Social', 'Chill', 'Energetic', 'Foodie', 'Outdoors', 'Creative']
                .map((vibe) => ({ value: vibe, label: vibe }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="event-description">Event details</label>
            <textarea
              id="event-description"
              className={`${FIELD} h-24 resize-y py-2.5`}
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
              placeholder="What are you planning? What should guests know or bring?"
              maxLength={5000}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="event-hashtag">Event hashtags</label>
            <div className="flex gap-2">
              <input
                id="event-hashtag"
                className={FIELD}
                value={customTag}
                onChange={(event) => setCustomTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addCustomTag()
                  }
                }}
                placeholder="Add a hashtag, e.g. boardgames"
                maxLength={32}
              />
              <button
                type="button"
                onClick={addCustomTag}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-text transition-colors hover:border-mint/50 hover:text-mint"
              >
                <PlusIcon className="h-4 w-4" />
                Add
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => update('tags', form.tags.filter((item) => item !== tag))}
                    className="rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint hover:border-danger/50 hover:text-danger"
                    aria-label={`Remove hashtag ${tag}`}
                  >
                    #{tag} ×
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-muted">Up to 10. Press Enter or Add to create a tag.</p>
          </div>
        </section>

        <section className="relative grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <div>
              <h2 className="text-sm font-bold text-text">Date, time & capacity</h2>
              <p className="mt-1 text-[11px] text-muted">Set the start, then adjust the event duration.</p>
            </div>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 text-sky-300 shadow-sm shadow-sky-950/10">
              <ClockIcon className="h-4 w-4 shrink-0 text-sky-400" />
              <label htmlFor="event-duration" className="text-xs font-semibold">Duration</label>
              <input
                id="event-duration"
                aria-label="Event duration in hours"
                type="number"
                min="1"
                max="24"
                step="1"
                value={durationHours}
                onChange={(event) => {
                  const nextDuration = Number(event.target.value)
                  if (Number.isInteger(nextDuration) && nextDuration >= 1 && nextDuration <= 24) {
                    updateDuration(nextDuration)
                  }
                }}
                onBlur={(event) => {
                  const nextDuration = Math.max(1, Math.min(24, Number(event.target.value) || 1))
                  updateDuration(nextDuration)
                }}
                className="event-duration-input h-8 w-11 rounded-md border border-sky-400/30 bg-sky-400/10 text-center text-sm font-bold tabular-nums text-sky-300 outline-none focus:border-sky-300"
              />
              <span className="text-[11px] font-semibold text-sky-300">hrs</span>
              <div className="flex flex-col -space-y-0.5">
                {['up', 'down'].map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    aria-label={`${direction === 'up' ? 'Increase' : 'Decrease'} event duration`}
                    onClick={() => updateDuration(Math.max(1, Math.min(24, durationHours + (direction === 'up' ? 1 : -1))))}
                    className="grid h-4 w-5 place-items-center rounded text-sky-300 transition hover:bg-sky-300/15"
                  >
                    <ChevronDownIcon className={`h-3 w-3 ${direction === 'up' ? 'rotate-180' : ''}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {[
            { key: 'startsAt', title: 'Starts', value: form.startsAt },
            { key: 'endsAt', title: 'Ends', value: form.endsAt },
          ].map(({ key, title, value }) => {
            const parts = dateTimeParts(value)
            const isStart = key === 'startsAt'
            const updatePart = isStart ? updateStartPart : updateEndPart
            return (
              <div key={key} className="rounded-2xl border border-border bg-bg/35 p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-text">{title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isStart ? 'bg-sky-400/10 text-sky-300' : 'bg-mint-soft text-mint'}`}>
                    {isStart ? 'Local time' : `${String(durationHours).padStart(2, '0')} hour${durationHours === 1 ? '' : 's'} later`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <DateField
                    id={`event-${key}-date`}
                    label={`${title} date`}
                    value={parts.date}
                    min={isStart ? dateTimeParts(roundedDateTime(0)).date : dateTimeParts(form.startsAt).date}
                    onChange={(nextDate) => updatePart('date', nextDate)}
                  />
                  <TimeField
                    id={`event-${key}-time`}
                    label={`${title} time`}
                    value={parts.time}
                    onChange={(nextTime) => updatePart('time', nextTime)}
                  />
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-bg/30 px-3 py-2.5 text-xs text-muted sm:col-span-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
              <ClockIcon className="h-3.5 w-3.5" />
            </span>
            <span>{duration} · Event listing and uploaded media expire at the end time.</span>
          </div>
          <div>
            <label className={LABEL} htmlFor="event-capacity">Total capacity (including you)</label>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-bg/60 px-3">
              <UsersIcon className="h-4 w-4 text-muted" />
              <input
                id="event-capacity"
                type="number"
                min="2"
                max="500"
                className="w-full bg-transparent text-sm text-text outline-none"
                value={form.capacity}
                onChange={(event) => update('capacity', Number(event.target.value))}
                required
              />
            </div>
          </div>
          <div>
            <SelectField
              id="event-visibility"
              label="Who can see it?"
              value={form.visibility}
              onChange={(value) => update('visibility', value)}
              options={[
                { value: 'public', label: 'Public — everyone in this state' },
                { value: 'friends', label: 'Friends — your friends and you' },
                { value: 'private', label: 'Private — only visible to you' },
              ]}
            />
          </div>
          <div>
            <SelectField
              id="event-request-cutoff"
              label="Join requests close before start"
              value={String(form.requestCutoffMinutes)}
              onChange={(value) => update('requestCutoffMinutes', Number(value))}
              options={[
                { value: '15', label: '15 minutes' },
                { value: '30', label: '30 minutes' },
                { value: '60', label: '1 hour' },
                { value: '120', label: '2 hours' },
                { value: '360', label: '6 hours' },
                { value: '1440', label: '24 hours' },
              ]}
            />
            <p className="mt-1.5 text-xs text-muted">People can request to join until this point before the event.</p>
          </div>
        </section>

        <section className="event-location-section relative z-0 isolate space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-text">Venue & location</h2>
              <p className="mt-1 text-xs text-muted">Click or drag the pin to update nearby address details, then confirm to save that location.</p>
            </div>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locationBusy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-text transition-colors hover:border-mint/60 hover:bg-mint/5 disabled:opacity-50"
            >
              <NavigationIcon className="h-3.5 w-3.5" />
              {locationBusy ? 'Finding location…' : 'Use my location'}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchableField
              id="event-state"
              label="State / union territory"
              value={selectedState}
              options={STATE_NAMES}
              placeholder="Search Indian states"
              onSelect={chooseState}
            />
            <SearchableField
              key={`event-city-${selectedState}`}
              id="event-city-select"
              label="City"
              value={form.city}
              options={cityOptions}
              placeholder={selectedState ? 'Search cities in the selected state' : 'Choose a state first'}
              onSelect={chooseCity}
              disabled={!selectedState}
              loading={citiesLoading}
              emptyMessage={citiesError ? 'City list unavailable' : 'No matching city'}
            />
          </div>
          {citiesError && (
            <p role="alert" className="text-xs text-danger">
              Could not load cities: {citiesError}
            </p>
          )}
          {citiesLoading && selectedState && (
            <p role="status" className="text-xs text-muted">Loading cities in {selectedState}…</p>
          )}
          <MapPicker
            center={mapCenter}
            coordinates={form.coordinates}
            pendingCoordinates={pendingCoordinates}
            onMapPick={setMapPoint}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {mapLookupBusy
                ? 'Finding nearby address details…'
                : pendingCoordinates
                ? `Selected ${pendingCoordinates[0].toFixed(5)}, ${pendingCoordinates[1].toFixed(5)}`
                : form.coordinates
                  ? `Location set · ${form.coordinates[0].toFixed(5)}, ${form.coordinates[1].toFixed(5)}`
                  : 'Select a spot on the map.'}
            </p>
            <button
              type="button"
              onClick={() => applyMapLocation()}
              disabled={locationBusy || mapLookupBusy || !pendingCoordinates}
              className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-[#05070b] bg-mint px-4 text-xs font-extrabold text-[#07110d] shadow-[0_0_0_1px_rgba(255,255,255,0.22)] transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MapPinIcon className="h-4 w-4 text-[#07110d]" />
              Use this location
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="event-area">Area / locality</label>
              <input id="event-area" className={FIELD} value={form.area} onChange={(event) => update('area', event.target.value)} placeholder="e.g. Koregaon Park" maxLength={160} required />
            </div>
            <div>
              <label className={LABEL} htmlFor="event-venue">Venue name</label>
              <input id="event-venue" className={FIELD} value={form.venueName} onChange={(event) => update('venueName', event.target.value)} placeholder="Cafe, park, studio…" maxLength={160} />
            </div>
            <div>
              <label className={LABEL} htmlFor="event-landmark">Landmark / directions</label>
              <input id="event-landmark" className={FIELD} value={form.landmark} onChange={(event) => update('landmark', event.target.value)} placeholder="Near a landmark (optional)" maxLength={160} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL} htmlFor="event-address">Full venue address</label>
              <input id="event-address" className={FIELD} value={form.venueAddress} onChange={(event) => update('venueAddress', event.target.value)} placeholder="Street and venue address (optional)" maxLength={300} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-bold text-text">Food & refreshments</h2>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm text-text">
            Food available
            <input type="checkbox" checked={form.foodAvailable} onChange={(event) => update('foodAvailable', event.target.checked)} className="accent-[var(--color-mint)]" />
          </label>
          <SelectField
            id="event-food"
            label="Food preference"
            value={form.foodPreference}
            onChange={(value) => update('foodPreference', value)}
            options={[
              { value: 'any', label: 'No preference' },
              { value: 'vegetarian', label: 'Vegetarian' },
              { value: 'non-vegetarian', label: 'Non-vegetarian' },
              { value: 'both', label: 'Veg and non-veg' },
            ]}
          />
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm text-text">
            Non-alcoholic beverages
            <input type="checkbox" checked={form.beveragesAvailable} onChange={(event) => update('beveragesAvailable', event.target.checked)} className="accent-[var(--color-mint)]" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm text-text">
            Alcoholic drinks
            <input type="checkbox" checked={form.drinksAvailable} onChange={(event) => update('drinksAvailable', event.target.checked)} className="accent-[var(--color-mint)]" />
          </label>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-bold text-text">Who should join?</h2>
            <p className="mt-1 text-xs text-muted">Set expectations for guests and add your own preferences.</p>
          </div>
          <SelectField
            id="event-attendees"
            label="Group preference"
            value={form.attendeePreference}
            onChange={(value) => update('attendeePreference', value)}
            options={['Anyone', 'Women', 'Men', 'Friends and connections']
              .map((option) => ({ value: option, label: option }))}
          />
          <SelectField
            id="event-experience"
            label="Experience level"
            value={form.experienceLevel}
            onChange={(value) => update('experienceLevel', value)}
            options={['Any experience', 'First-timers welcome', 'Beginner', 'Intermediate', 'Advanced']
              .map((option) => ({ value: option, label: option }))}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {[
              'All skill levels',
              'Accessible venue',
              'Bring a friend',
              'Bring your own',
              'Outdoor event',
              'Family friendly',
              ...form.preferences.filter((item) =>
                !['All skill levels', 'Accessible venue', 'Bring a friend', 'Bring your own', 'Outdoor event', 'Family friendly'].includes(item),
              ),
            ].map((preference) => (
              <button
                key={preference}
                type="button"
                aria-pressed={form.preferences.includes(preference)}
                onClick={() => togglePreference(preference)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${form.preferences.includes(preference) ? 'border-mint/50 bg-mint/10 text-mint' : 'border-border text-muted hover:border-text/25 hover:text-text'}`}
              >
                {preference}
              </button>
            ))}
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="event-custom-preference">Add your own preference</label>
            <div className="flex gap-2">
              <input
                id="event-custom-preference"
                className={FIELD}
                value={customPreference}
                onChange={(event) => setCustomPreference(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addCustomPreference()
                  }
                }}
                placeholder="e.g. Please bring a reusable water bottle"
                maxLength={80}
              />
              <button
                type="button"
                onClick={addCustomPreference}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-text transition-colors hover:border-mint/50 hover:text-mint"
              >
                <PlusIcon className="h-4 w-4" />
                Add
              </button>
            </div>
            {form.preferences.filter((item) =>
              !['All skill levels', 'Accessible venue', 'Bring a friend', 'Bring your own', 'Outdoor event', 'Family friendly'].includes(item),
            ).map((preference) => (
              <button
                key={`custom-${preference}`}
                type="button"
                onClick={() => togglePreference(preference)}
                className="mt-2 mr-1.5 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 text-xs text-mint hover:border-danger/50 hover:text-danger"
              >
                {preference} ×
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-surface p-2 sm:p-3">
          <div>
            <h2 className="text-sm font-bold text-text">Event banner</h2>
            <p className="mt-1 text-xs text-muted">Choose a banner that fits your plan.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {BANNER_OPTIONS.map((option, index) => (
              <button
                key={option.image}
                type="button"
                aria-pressed={form.bannerImage === option.image}
                onClick={() => update('bannerImage', option.image)}
                className={`group relative overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${form.bannerImage === option.image ? 'border-mint ring-2 ring-mint/50' : 'border-border hover:border-mint/50'}`}
              >
                <span className="flex h-28 items-center justify-center bg-surface-2 sm:h-36">
                  <img src={option.image} alt="" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
                </span>
                <span className="block border-t border-border/70 bg-surface px-2.5 py-2 text-xs font-semibold text-text">
                  {option.label || `Spontii banner ${index + 1}`}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-bold text-text">Venue media add-ons</h2>
            <p className="mt-1 text-xs text-muted">Optional: add up to 6 photos and 2 short videos (12 MB per file).</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="event-photos">Venue photos</label>
            <input id="event-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(event.target.files, 'image')} className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-text" />
            {photoPreviews.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {photoPreviews.map((url) => <img key={url} src={url} alt="Venue preview" className="h-20 w-full rounded-md object-cover" />)}
              </div>
            )}
          </div>
          <div>
            <label className={LABEL} htmlFor="event-videos">Venue videos</label>
            <input id="event-videos" type="file" accept="video/mp4,video/webm,video/quicktime" multiple onChange={(event) => setFiles(event.target.files, 'video')} className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-text" />
            {videoPreviews.length > 0 && (
              <div className="mt-2 space-y-2">
                {videoPreviews.map((url) => <video key={url} src={url} controls className="max-h-36 w-full rounded-md bg-black" />)}
              </div>
            )}
          </div>
        </section>

        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={submitting || locationBusy || BANNER_OPTIONS.length === 0}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mint px-5 text-sm font-bold text-bg transition-colors hover:bg-mint/90 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-56"
        >
          {submitting ? 'Publishing event…' : 'Publish event'}
          {!submitting && <ArrowRightIcon className="h-4 w-4" />}
        </button>
      </form>
    </div>
  )
}
