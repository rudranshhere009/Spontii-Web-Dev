/*
 * Optional, privacy-first location for Spontii.
 *
 * - Coordinates are only read after the user chooses "Share location"
 *   (or if the browser already granted permission earlier).
 * - They are matched locally to a Spontii city and then discarded: never
 *   stored, never sent anywhere. Only the city name and the user's choice
 *   are saved.
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

export const CITIES = Object.keys(CITY_CENTERS)

export const DEFAULT_CITY = 'Pune'
export const CITY_KEY = 'spontii_city_v1'
export const LOCATION_PREF_KEY = 'spontii_location_pref_v1'

const MATCH_RADIUS_KM = 75

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
