export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
export const SESSION_ENDED_EVENT = 'spontii:session-ended'
export const MAINTENANCE_EVENT = 'spontii:maintenance'

const SESSION_ENDED_CODES = new Set(['ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'SESSION_REVOKED'])

export async function apiRequest(path, { body, ...options } = {}) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    })
  } catch {
    throw new Error('Could not reach the server. Please try again.')
  }

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401 && SESSION_ENDED_CODES.has(result.code)) {
      window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: result }))
    }
    if (response.status === 503 && result.code === 'MAINTENANCE') {
      window.dispatchEvent(new Event(MAINTENANCE_EVENT))
    }
    const error = new Error(result.message || 'Request failed.')
    error.status = response.status
    error.data = result
    throw error
  }

  return result
}
