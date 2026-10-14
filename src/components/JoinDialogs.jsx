import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckIcon, CloseIcon } from './NavIcons'

/*
 * Small modal shell for the join flow (same backdrop and layering as the
 * Profile edit dialog). Keeps focus inside while open, closes on Escape or
 * a backdrop click, and returns focus to whatever opened it. If that control
 * can no longer take focus (e.g. the request button is now disabled as
 * "Request pending"), focus goes to `returnFocusRef` instead.
 */
function Dialog({ titleId, descriptionId, onClose, initialFocusRef, returnFocusRef, children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    const fallback = returnFocusRef?.current
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    ;(initialFocusRef?.current ?? panelRef.current)?.focus()

    return () => {
      document.body.style.overflow = overflow
      const canRefocus = opener?.isConnected && !opener.disabled && opener !== document.body
      ;(canRefocus ? opener : fallback)?.focus?.()
    }
  }, [initialFocusRef, returnFocusRef])

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = [
      ...panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled])',
      ),
    ]
    const first = focusable[0]
    const last = focusable.at(-1)

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="animate-rise-in relative w-full max-w-sm rounded-2xl border border-border bg-surface-2 p-6 outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-xl bg-mint text-sm font-bold text-bg transition-colors hover:bg-mint/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2'

const SECONDARY =
  'flex h-11 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold text-text transition-colors hover:border-mint/40 hover:text-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60'

/* Shown once, right after a new join request has been saved. */
export function RequestSentDialog({ onClose, returnFocusRef }) {
  const titleId = useId()
  const descriptionId = useId()
  const doneRef = useRef(null)

  return (
    <Dialog
      titleId={titleId}
      descriptionId={descriptionId}
      onClose={onClose}
      initialFocusRef={doneRef}
      returnFocusRef={returnFocusRef}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint-soft text-mint">
        <CheckIcon className="h-6 w-6" />
      </span>

      <h2 id={titleId} className="mt-4 text-xl font-extrabold tracking-tight">
        Request sent!
      </h2>

      <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted">
        Your request is with the host. They'll review it and usually respond
        within 12–24 hours. We'll let you know when there's an update.
      </p>

      <div className="mt-6 space-y-2">
        <button ref={doneRef} type="button" onClick={onClose} className={PRIMARY}>
          Got it
        </button>
        <Link to="/explore" className={SECONDARY}>
          Browse more plans
        </Link>
      </div>
    </Dialog>
  )
}

/*
 * Logged-out visitors on a public plan: a first name is all the host needs.
 * No account is created; the name is kept on this device only.
 */
export function GuestJoinDialog({ onClose, onSubmit, loginState, returnFocusRef, defaultName = '' }) {
  const titleId = useId()
  const descriptionId = useId()
  const inputId = useId()
  const inputRef = useRef(null)
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()

    if (!name.trim()) {
      setError('Add your first name so the host knows who is coming.')
      inputRef.current?.focus()
      return
    }

    onSubmit(name.trim())
  }

  return (
    <Dialog
      titleId={titleId}
      descriptionId={descriptionId}
      onClose={onClose}
      initialFocusRef={inputRef}
      returnFocusRef={returnFocusRef}
    >
      <h2 id={titleId} className="pr-8 text-xl font-extrabold tracking-tight">
        Join as a guest
      </h2>

      <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted">
        No account needed. The host sees your first name with your request.
      </p>

      <form onSubmit={submit} noValidate className="mt-5">
        <label htmlFor={inputId} className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-muted">
          First name
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError('')
          }}
          maxLength={40}
          autoComplete="given-name"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : `${inputId}-help`}
          className="h-12 w-full rounded-xl border border-border bg-bg/60 px-4 text-[15px] text-text outline-none transition-colors placeholder:text-muted-2 focus:border-mint focus:ring-2 focus:ring-mint/20"
          placeholder="e.g. Priya"
        />
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs font-semibold text-danger">
            {error}
          </p>
        ) : (
          <p id={`${inputId}-help`} className="mt-2 text-xs text-muted">
            Saved on this device only.
          </p>
        )}

        <div className="mt-6 space-y-2">
          <button type="submit" className={PRIMARY}>
            Send request
          </button>
          <Link to="/login" state={loginState} className={SECONDARY}>
            Log in instead
          </Link>
        </div>
      </form>
    </Dialog>
  )
}
