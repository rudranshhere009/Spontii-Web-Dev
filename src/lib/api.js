const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

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
    const error = new Error(result.message || 'Request failed.')
    error.status = response.status
    throw error
  }

  return result
}
