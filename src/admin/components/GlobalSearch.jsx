import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchIcon } from '../../components/NavIcons'
import { adminRequest, queryString } from '../adminApi'
import { StatusBadge } from './ui'

/* Topbar search across users (name, email, phone, Spontiii ID) and events (title, ID). */
export default function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const boxRef = useRef(null)

  const text = query.trim()
  /* Results are tagged with their query so stale ones are never shown. */
  const results = text.length >= 2 && found?.query === text ? found : null

  useEffect(() => {
    if (text.length < 2) return undefined
    let active = true
    const timer = setTimeout(() => {
      adminRequest(`/search${queryString({ q: text })}`)
        .then((result) => {
          if (active) setFound({ ...result, query: text })
        })
        .catch(() => {
          if (active) setFound({ users: [], events: [], query: text })
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [text])

  useEffect(() => {
    const close = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function go(path) {
    setOpen(false)
    setQuery('')
    navigate(path)
  }

  const items = [
    ...(results?.users || []).map((user) => ({
      key: `u${user.id}`,
      path: `/admin/users/${user.id}`,
      title: user.name,
      subtitle: `${user.email} · ${user.spontiiiId}`,
      status: user.status,
      kind: 'User',
    })),
    ...(results?.events || []).map((event) => ({
      key: `e${event.id}`,
      path: `/admin/events/${event.id}`,
      title: event.title,
      subtitle: `${event.city} · hosted by ${event.hostName}`,
      status: event.status,
      kind: 'Event',
    })),
  ]

  return (
    <div ref={boxRef} className="relative">
      <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-muted focus-within:border-mint">
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="sr-only">Search users and events</span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
            if (event.key === 'Enter' && items[0]) go(items[0].path)
          }}
          placeholder="Search users, emails, phones, events…"
          aria-controls={listId}
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted-2"
        />
      </label>
      {open && results && (
        <div id={listId} className="absolute left-0 right-0 top-12 z-50 max-h-96 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-2">
          {!items.length && <p className="px-3 py-4 text-sm text-muted">No matches.</p>}
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.path)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-text/5"
            >
              <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">{item.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                <span className="block truncate text-xs text-muted">{item.subtitle}</span>
              </span>
              <StatusBadge status={item.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
