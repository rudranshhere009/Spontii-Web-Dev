import { Link, useLocation } from 'react-router-dom'
import { LockIcon } from './NavIcons'

/*
 * Shown to logged-out visitors in place of private plan content.
 * Both links carry the current location so Login/Signup can send the
 * user straight back (authorization is re-checked after they sign in).
 */
export default function LockedState({ className = '' }) {
  const location = useLocation()

  return (
    <div
      className={`rounded-2xl border border-border bg-surface-2 px-6 py-12 text-center sm:py-16 ${className}`}
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mint-soft text-mint">
        <LockIcon className="h-5 w-5" />
      </span>

      <h2 className="mt-5 text-xl font-extrabold tracking-tight sm:text-2xl">
        You have to sign up to unlock this
      </h2>

      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted sm:text-base">
        Create an account or log in to discover private plans and connect
        with people.
      </p>

      <div className="mt-7 flex items-center justify-center gap-2">
        <Link
          to="/signup"
          state={{ from: location }}
          className="inline-flex h-10 items-center rounded-lg bg-mint px-5 text-sm font-bold text-bg transition-[background-color,transform] duration-150 hover:bg-mint/90 active:scale-[0.98]"
        >
          Sign up
        </Link>

        <Link
          to="/login"
          state={{ from: location }}
          className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-semibold text-text transition-colors hover:bg-text/5"
        >
          Log in
        </Link>
      </div>
    </div>
  )
}
