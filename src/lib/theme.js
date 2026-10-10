/*
 * Light/dark theme preference. The attribute on <html> drives the CSS
 * tokens in index.css; index.html applies the saved value before React
 * loads, so this module only reads and updates it.
 */
export const THEME_KEY = 'spontii_theme_v1'

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'
}

export function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'

  document.documentElement.setAttribute('data-theme', next)

  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Storage unavailable (private mode): theme still applies for this visit.
  }

  return next
}
