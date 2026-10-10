import { useState } from 'react'
import { MoonIcon, SunIcon } from './NavIcons'
import { getTheme, setTheme } from '../lib/theme'

/*
 * Compact sun/moon button. Shows the mode you will switch to.
 */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme)
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={() => setThemeState(setTheme(isDark ? 'light' : 'dark'))}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
    >
      {isDark ? (
        <SunIcon className="h-[18px] w-[18px]" />
      ) : (
        <MoonIcon className="h-[18px] w-[18px]" />
      )}
    </button>
  )
}
