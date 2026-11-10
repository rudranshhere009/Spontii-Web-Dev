import { API_BASE_URL, apiRequest } from '../lib/api'

/*
 * Admin API client. The admin session cookie is scoped to /api/admin, so it
 * is only ever sent with these requests. A 401 anywhere ends the session in
 * the UI; the auth context listens for the event.
 */
export const ADMIN_SESSION_ENDED = 'spontii:admin-session-ended'
export const ADMIN_PASSWORD_REQUIRED = 'spontii:admin-password-required'

const PUBLIC_PATHS = ['/auth/login', '/auth/verify', '/auth/resend', '/auth/me']

export async function adminRequest(path, options) {
  try {
    return await apiRequest(`/admin${path}`, options)
  } catch (error) {
    if (error.status === 401 && !PUBLIC_PATHS.some((prefix) => path.startsWith(prefix))) {
      window.dispatchEvent(new CustomEvent(ADMIN_SESSION_ENDED))
    }
    if (error.status === 403 && error.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new CustomEvent(ADMIN_PASSWORD_REQUIRED))
    }
    throw error
  }
}

/* For <img src> and file downloads, which send the cookie but can't use fetch. */
export function adminUrl(path) {
  return `${API_BASE_URL}/admin${path}`
}

export function queryString(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
