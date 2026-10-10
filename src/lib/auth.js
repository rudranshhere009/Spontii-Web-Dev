/*
 * Where to send a user after login/signup: the protected page they
 * originally asked for (router state set by ProtectedPage), otherwise Home.
 */
export function redirectTarget(state) {
  const from = state?.from

  if (
    !from?.pathname ||
    from.pathname === '/login' ||
    from.pathname === '/signup'
  ) {
    return '/'
  }

  return `${from.pathname}${from.search || ''}${from.hash || ''}`
}
