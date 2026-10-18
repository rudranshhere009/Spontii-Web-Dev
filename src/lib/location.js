/*
 * Optional, privacy-first location for Spontii.
 *
 * - Device coordinates are read only after the user chooses to share
 *   location. They are sent to Photon for reverse geocoding and are not
 *   retained by Spontii.
 * - A manually selected city and its public map center are saved so the
 *   choice and map view can be restored on the next visit.
 * - No reverse geocoding: outside every city radius we say so instead of
 *   guessing a locality.
 */

export const CITY_CENTERS = {
  Pune: [18.5204, 73.8567],
  Mumbai: [19.076, 72.8777],
  Bengaluru: [12.9716, 77.5946],
  Delhi: [28.6139, 77.209],
  Hyderabad: [17.385, 78.4867],
}

export const STATE_CITIES = {
  Karnataka: ['Bengaluru'],
  Maharashtra: ['Mumbai', 'Pune'],
  Delhi: ['Delhi'],
  Telangana: ['Hyderabad'],
}

export const CITY_STATES = Object.fromEntries(
  Object.entries(STATE_CITIES).flatMap(([state, cities]) =>
    cities.map((city) => [city, state]),
  ),
)

export const CITIES = Object.keys(CITY_CENTERS)

export const INDIA_STATES = [
  { name: 'Andaman and Nicobar Islands', center: [11.7401, 92.6586] },
  { name: 'Andhra Pradesh', center: [15.9129, 79.74] },
  { name: 'Arunachal Pradesh', center: [28.218, 94.7278] },
  { name: 'Assam', center: [26.2006, 92.9376] },
  { name: 'Bihar', center: [25.0961, 85.3131] },
  { name: 'Chandigarh', center: [30.7333, 76.7794] },
  { name: 'Chhattisgarh', center: [21.2787, 81.8661] },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', center: [20.18, 73.02] },
  { name: 'Delhi', center: [28.6139, 77.209] },
  { name: 'Goa', center: [15.2993, 74.124] },
  { name: 'Gujarat', center: [22.2587, 71.1924] },
  { name: 'Haryana', center: [29.0588, 76.0856] },
  { name: 'Himachal Pradesh', center: [31.1048, 77.1734] },
  { name: 'Jammu and Kashmir', center: [33.7782, 76.5762] },
  { name: 'Jharkhand', center: [23.6102, 85.2799] },
  { name: 'Karnataka', center: [15.3173, 75.7139] },
  { name: 'Kerala', center: [10.8505, 76.2711] },
  { name: 'Ladakh', center: [34.1526, 77.577] },
  { name: 'Lakshadweep', center: [10.5667, 72.6417] },
  { name: 'Madhya Pradesh', center: [22.9734, 78.6569] },
  { name: 'Maharashtra', center: [19.7515, 75.7139] },
  { name: 'Manipur', center: [24.6637, 93.9063] },
  { name: 'Meghalaya', center: [25.467, 91.3662] },
  { name: 'Mizoram', center: [23.1645, 92.9376] },
  { name: 'Nagaland', center: [26.1584, 94.5624] },
  { name: 'Odisha', center: [20.9517, 85.0985] },
  { name: 'Puducherry', center: [11.9416, 79.8083] },
  { name: 'Punjab', center: [31.1471, 75.3412] },
  { name: 'Rajasthan', center: [27.0238, 74.2179] },
  { name: 'Sikkim', center: [27.533, 88.5122] },
  { name: 'Tamil Nadu', center: [11.1271, 78.6569] },
  { name: 'Telangana', center: [18.1124, 79.0193] },
  { name: 'Tripura', center: [23.9408, 91.9882] },
  { name: 'Uttar Pradesh', center: [26.8467, 80.9462] },
  { name: 'Uttarakhand', center: [30.0668, 79.0193] },
  { name: 'West Bengal', center: [22.9868, 87.855] },
]

export const STATE_CENTERS = Object.fromEntries(
  INDIA_STATES.map(({ name, center }) => [name, center]),
)

export const DEFAULT_CITY = 'Pune'
export const CITY_KEY = 'spontii_city_v1'
export const SELECTED_CITY_KEY = 'spontii_selected_city_v1'
export const SELECTED_STATE_KEY = 'spontii_selected_state_v1'
export const SELECTED_CITY_CENTER_KEY = 'spontii_selected_city_center_v1'
export const LOCATION_PREF_KEY = 'spontii_location_pref_v1'

const MATCH_RADIUS_KM = 75
const CITY_LIST_API = 'https://countriesnow.space/api/v0.1/countries/state/cities'
const PHOTON_API = 'https://photon.komoot.io/api/'
const cityCache = new Map()
const STATE_API_NAMES = {
  'Dadra and Nagar Haveli and Daman and Diu': [
    'Dadra and Nagar Haveli',
    'Daman and Diu',
  ],
}
const STATE_ALIASES = {
  'national capital territory of delhi': 'Delhi',
  'nct of delhi': 'Delhi',
  'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'andaman & nicobar islands': 'Andaman and Nicobar Islands',
}

function normalizeIndianState(state) {
  const normalized = state?.trim().toLocaleLowerCase()
  if (!normalized) return ''
  const alias = STATE_ALIASES[normalized]
  if (alias) return alias
  return INDIA_STATES.find(({ name }) => name.toLocaleLowerCase() === normalized)?.name || ''
}

export async function fetchCitiesForState(state, signal) {
  if (cityCache.has(state)) return cityCache.get(state)

  const apiStates = STATE_API_NAMES[state] || [state]
  const cityLists = await Promise.all(apiStates.map(async (apiState) => {
    const response = await fetch(CITY_LIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'India', state: apiState }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`City list request failed (${response.status}).`)
    }

    const result = await response.json()
    if (result.error || !Array.isArray(result.data)) {
      throw new Error(result.msg || `Couldn't load cities for ${apiState}.`)
    }

    return result.data.filter((city) => typeof city === 'string')
  }))
  const cities = [...new Set(cityLists.flat())]
    .sort((a, b) => a.localeCompare(b))
  cityCache.set(state, cities)
  return cities
}

export async function geocodeCity(city, state, signal) {
  const params = new URLSearchParams({
    q: `${city}, ${state}, India`,
    limit: '8',
    lang: 'en',
  })
  const response = await fetch(`${PHOTON_API}?${params}`, { signal })

  if (!response.ok) {
    throw new Error(`Couldn't locate ${city} on the map (${response.status}).`)
  }

  const result = await response.json()
  const candidates = (result.features || []).filter((feature) => {
    const properties = feature.properties || {}
    return properties.countrycode === 'IN'
      && (!properties.state || properties.state.toLocaleLowerCase() === state.toLocaleLowerCase())
  })
  const exactMatches = candidates.filter(
    (feature) => feature.properties.name?.toLocaleLowerCase() === city.toLocaleLowerCase(),
  )
  const match = exactMatches.find((feature) =>
    ['city', 'town', 'village', 'municipality', 'locality', 'district', 'county']
      .includes(feature.properties.type),
  ) || exactMatches[0]

  if (!match) {
    throw new Error(`Couldn't find ${city} in ${state}. Try another city from the list.`)
  }

  const [longitude, latitude] = match.geometry.coordinates
  return [latitude, longitude]
}

async function reverseGeocodeIndianLocation(latitude, longitude) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    lang: 'en',
  })
  const response = await fetch(`https://photon.komoot.io/reverse?${params}`)
  if (!response.ok) {
    throw new Error(`Couldn't resolve your location (${response.status}).`)
  }

  const result = await response.json()
  const feature = (result.features || []).find(
    (item) => item.properties?.countrycode === 'IN',
  )
  const properties = feature?.properties
  const state = normalizeIndianState(properties?.state)
  const rawCity = properties?.city
    || properties?.town
    || properties?.village
    || properties?.municipality
    || properties?.district
    || properties?.county
    || properties?.name
  const city = rawCity?.replace(
    /\s+(municipal corporation|municipal council|municipality|municipal board|nagar nigam)$/i,
    '',
  ).trim()

  if (!state || !city) {
    throw new Error("Couldn't identify an Indian state and city at your location.")
  }

  return { state, city }
}

export function requestIndianLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not available in this browser.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const place = await reverseGeocodeIndianLocation(
            coords.latitude,
            coords.longitude,
          )
          resolve({
            ...place,
            coordinates: [coords.latitude, coords.longitude],
          })
        } catch (error) {
          reject(error)
        }
      },
      (error) => {
        if (error.code === 1) {
          reject(new Error('Location permission was denied. Allow it in your browser to continue.'))
        } else if (error.code === 2) {
          reject(new Error("Your current location couldn't be determined. Try again."))
        } else {
          reject(new Error('Location request timed out. Try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

function distanceKm([lat1, lng1], [lat2, lng2]) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2

  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

/* Closest Spontii city within range, or null. */
export function nearestCity(lat, lng) {
  let best = null

  for (const [city, center] of Object.entries(CITY_CENTERS)) {
    const km = distanceKm([lat, lng], center)

    if (km <= MATCH_RADIUS_KM && (!best || km < best.km)) {
      best = { city, km }
    }
  }

  return best?.city ?? null
}

/* 'dismissed' | 'granted' | 'denied' | null (not chosen yet) */
export function getLocationPref() {
  try {
    return localStorage.getItem(LOCATION_PREF_KEY)
  } catch {
    return null
  }
}

export function setLocationPref(value) {
  try {
    localStorage.setItem(LOCATION_PREF_KEY, value)
  } catch {
    // Storage unavailable: the choice applies for this visit only.
  }
}

export function getSelectedCity() {
  try {
    return localStorage.getItem(SELECTED_CITY_KEY) || ''
  } catch (error) {
    console.error('Failed to load selected city:', error)
    return ''
  }
}

export function getSelectedState() {
  try {
    return localStorage.getItem(SELECTED_STATE_KEY) || ''
  } catch (error) {
    console.error('Failed to load selected state:', error)
    return ''
  }
}

export function getSelectedCityCenter() {
  try {
    const center = JSON.parse(localStorage.getItem(SELECTED_CITY_CENTER_KEY) || 'null')
    return Array.isArray(center)
      && center.length === 2
      && center.every(Number.isFinite)
      ? center
      : null
  } catch (error) {
    console.error('Failed to load selected city coordinates:', error)
    return null
  }
}

export function saveSelectedCity(city, state, center) {
  try {
    localStorage.setItem(SELECTED_CITY_KEY, city)
    localStorage.setItem(SELECTED_STATE_KEY, state)
    localStorage.setItem(SELECTED_CITY_CENTER_KEY, JSON.stringify(center))
  } catch (error) {
    console.error('Failed to save selected location:', error)
  }
}

/* Browser permission state without triggering a prompt. */
export async function geolocationPermission() {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}

/*
 * Ask the browser for the position and reduce it to a Spontii city.
 * Resolves { ok: true, city } or { ok: false, reason }.
 */
export function requestCity() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        resolve({ ok: true, city: nearestCity(latitude, longitude) })
      },
      (error) => {
        resolve({
          ok: false,
          reason: error.code === 1 ? 'denied' : 'unavailable',
        })
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  })
}
