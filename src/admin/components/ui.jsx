import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRightIcon, CloseIcon } from '../../components/NavIcons'

/*
 * Small UI kit for the admin portal, built on the app's design tokens
 * (bg/surface/border/mint/text/muted/danger/warning) so both themes work.
 */

const BUTTON_VARIANTS = {
  primary: 'bg-mint text-bg hover:bg-mint/90',
  secondary: 'border border-border bg-surface text-text hover:border-mint/40 hover:text-mint',
  danger: 'bg-danger text-bg hover:bg-danger/90',
  'danger-outline': 'border border-danger/40 text-danger hover:bg-danger/10',
  ghost: 'text-muted hover:bg-text/5 hover:text-text',
}
const BUTTON_SIZES = {
  sm: 'h-8 rounded-lg px-3 text-xs',
  md: 'h-10 rounded-xl px-4 text-sm',
  lg: 'h-12 rounded-xl px-5 text-sm',
}

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    />
  )
}

export function Card({ title, actions, children, className = '', padded = true }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface-2 ${padded ? 'p-5' : ''} ${className}`}>
      {(title || actions) && (
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${padded ? '' : 'px-5 pt-5'}`}>
          {title && <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-mint">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const inputClass = 'w-full rounded-xl border border-border bg-bg/60 px-3 text-sm text-text outline-none transition placeholder:text-muted-2 focus:border-mint focus:ring-2 focus:ring-mint/10 disabled:opacity-60'

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-muted">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-2">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}

export function Input({ className = '', ...props }) {
  return <input className={`${inputClass} h-10 ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }) {
  return <select className={`${inputClass} h-10 pr-8 ${className}`} {...props}>{children}</select>
}

export function Textarea({ className = '', rows = 3, ...props }) {
  return <textarea rows={rows} className={`${inputClass} py-2.5 ${className}`} {...props} />
}

export function Checkbox({ label, description, checked, onChange, disabled }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-mint)]"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  )
}

const BADGE_TONES = {
  neutral: 'border-border text-muted',
  mint: 'border-mint/30 bg-mint-soft text-mint',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${BADGE_TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

const STATUS_TONES = {
  active: 'mint',
  live: 'mint',
  open: 'warning',
  pending: 'warning',
  suspended: 'warning',
  reviewed: 'neutral',
  completed: 'neutral',
  approved: 'mint',
  actioned: 'mint',
  banned: 'danger',
  disabled: 'danger',
  removed: 'danger',
  rejected: 'neutral',
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] || 'neutral'}>{String(status || '—').replace(/_/g, ' ')}</Badge>
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin text-mint ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <Spinner /> {label}
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-sm font-bold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
      <span>{error.message || String(error)}</span>
      {onRetry && <Button size="sm" variant="danger-outline" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function Notice({ tone = 'mint', children }) {
  const tones = {
    mint: 'border-mint/30 bg-mint-soft',
    warning: 'border-warning/30 bg-warning/10',
    danger: 'border-danger/30 bg-danger/10 text-danger',
  }
  return <div role="status" className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>{children}</div>
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, title, onClose, children, footer, width = 'max-w-lg' }) {
  const panelRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const panel = panelRef.current
    panel?.querySelector(FOCUSABLE)?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90dvh] w-full ${width} overflow-y-auto rounded-2xl border border-border bg-surface-2 p-6 text-text`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-text/5 hover:text-text">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/*
 * Confirmation for admin actions. `reason` asks for a note that goes to the
 * audit log; `confirmText` makes destructive actions type-to-confirm.
 */
export function ConfirmDialog({ open, title, onClose, ...props }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} title={title} onClose={busy ? () => {} : onClose}>
      {/* Mounted only while open, so every opening starts with empty fields. */}
      <ConfirmForm {...props} busy={busy} setBusy={setBusy} onClose={onClose} />
    </Modal>
  )
}

function ConfirmForm({
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  reason = false,
  reasonLabel = 'Reason (saved in the audit log)',
  confirmText,
  children,
  onConfirm,
  onClose,
  busy,
  setBusy,
}) {
  const [note, setNote] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState(null)
  const reasonId = useId()
  const typedId = useId()

  const blocked = (reason && !note.trim()) || (confirmText && typed.trim() !== confirmText)

  async function submit(event) {
    event.preventDefault()
    if (blocked || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm({ reason: note.trim() })
      setBusy(false)
      onClose()
    } catch (submitError) {
      setError(submitError)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
      {children}
      {reason && (
        <Field label={reasonLabel} htmlFor={reasonId}>
          <Textarea id={reasonId} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} required />
        </Field>
      )}
      {confirmText && (
        <Field label={`Type ${confirmText} to confirm`} htmlFor={typedId}>
          <Input id={typedId} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
        </Field>
      )}
      <ErrorNotice error={error} />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant={tone} disabled={blocked || busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </form>
  )
}

export function StatCard({ label, value, hint, tone = 'text' }) {
  const tones = { text: 'text-text', mint: 'text-mint', warning: 'text-warning', danger: 'text-danger' }
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-extrabold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-2">{hint}</p>}
    </div>
  )
}

export function KeyValue({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-semibold text-muted">{label}</dt>
          <dd className="mt-0.5 break-words text-sm">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/* columns: [{ key, header, render?, className? }] */
export function DataTable({ columns, rows, rowKey = 'id', onRowClick, empty = 'Nothing here yet.', loading }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wider text-muted">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`whitespace-nowrap px-4 py-3 font-semibold ${column.className || ''}`}>
                {column.header}
              </th>
            ))}
            {onRowClick && <th scope="col" className="w-8 px-2"><span className="sr-only">Open</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => event.key === 'Enter' && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={`border-b border-border/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-text/[0.03] focus-visible:bg-text/[0.05] focus-visible:outline-none' : ''}`}
            >
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 align-middle ${column.className || ''}`}>
                  {column.render ? column.render(row) : row[column.key] ?? '—'}
                </td>
              ))}
              {onRowClick && <td className="px-2 text-muted"><ChevronRightIcon className="h-4 w-4" /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && !rows.length && <Loading />}
      {!loading && !rows.length && <EmptyState title={empty} />}
    </div>
  )
}

export function Pagination({ page, totalPages, total, onPage }) {
  if (!total) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted">
      <span>{total} total · page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</Button>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Next</Button>
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${value === tab.value ? 'bg-mint text-bg' : 'text-muted hover:text-text'}`}
        >
          {tab.label}
          {tab.count != null && <span className="ml-1.5 opacity-70">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ src, name, size = 'h-10 w-10' }) {
  const [failed, setFailed] = useState(false)
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} className={`${size} shrink-0 rounded-full border border-border object-cover`} />
  }
  return (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 text-xs font-extrabold text-muted`}>
      {initials}
    </span>
  )
}
