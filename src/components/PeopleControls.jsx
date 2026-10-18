import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import avatarPlaceholder from '../assets/avatar-placeholder.svg'
import { CloseIcon, SearchIcon, UsersIcon } from './NavIcons'

const PEOPLE_SEARCH_HISTORY_KEY = 'spontii_people_search_history_v1'

function loadPeopleSearchHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(PEOPLE_SEARCH_HISTORY_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').slice(0, 5)
      : []
  } catch (error) {
    console.error('Failed to load people search history:', error)
    return []
  }
}

function PersonAvatar({ person, className = 'h-10 w-10' }) {
  return (
    <img
      src={person.avatar || avatarPlaceholder}
      alt=""
      className={`${className} shrink-0 rounded-full border border-border object-cover`}
    />
  )
}

export function PeopleSearch({ compact = false }) {
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [sendingId, setSendingId] = useState(null)
  const [searchHistory, setSearchHistory] = useState(loadPeopleSearchHistory)
  const containerRef = useRef(null)

  useEffect(() => {
    const value = query.trim()
    if (value.length < 2) return undefined
    let active = true
    const timeout = window.setTimeout(() => {
      apiRequest(`/people/search?q=${encodeURIComponent(value)}`)
        .then(({ people: results }) => {
          if (active) {
            setPeople(results)
            setError('')
            setSearchHistory((previous) => {
              const updated = [value, ...previous.filter((item) => item.toLocaleLowerCase() !== value.toLocaleLowerCase())].slice(0, 5)
              try {
                localStorage.setItem(PEOPLE_SEARCH_HISTORY_KEY, JSON.stringify(updated))
              } catch (storageError) {
                console.error('Failed to save people search history:', storageError)
              }
              return updated
            })
          }
        })
        .catch((searchError) => {
          if (active) {
            console.error('Failed to search people:', searchError)
            setError(searchError.message)
          }
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [query])

  useEffect(() => {
    function onPointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  async function sendRequest(person) {
    setSendingId(person.id)
    setError('')
    try {
      await apiRequest(`/friends/requests/${person.id}`, { method: 'POST' })
      setPeople((previous) => previous.map((item) =>
        item.id === person.id ? { ...item, relationship: 'outgoing' } : item,
      ))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div ref={containerRef} className={`relative transition-[width] duration-200 ease-out ${compact ? 'w-[230px] shrink-0 focus-within:w-[260px]' : 'w-full'}`}>
      <label className="sr-only" htmlFor="people-quick-search">Search people by name</label>
      <div className="flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3 transition-colors focus-within:border-mint/60">
        <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
        <input
          id="people-quick-search"
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setPeople([])
            setError('')
            setOpen(true)
          }}
          placeholder="Find people"
          className="h-full min-w-0 flex-1 bg-transparent text-xs text-text outline-none placeholder:text-muted"
        />
      </div>
      {open && (query.trim().length >= 2 || searchHistory.length > 0) && (
        <div className="absolute right-0 top-full z-[70] mt-2 max-h-[min(65vh,28rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-surface-2 p-2 shadow-2xl">
          {query.trim().length < 2 && (
            <div className="p-1">
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Recent searches</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchHistory([])
                    try {
                      localStorage.removeItem(PEOPLE_SEARCH_HISTORY_KEY)
                    } catch (storageError) {
                      console.error('Failed to clear people search history:', storageError)
                    }
                  }}
                  className="text-[10px] font-semibold text-muted hover:text-text"
                >
                  Clear
                </button>
              </div>
              {searchHistory.map((term) => (
                <div
                  key={term}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-surface-3"
                >
                  <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(term)
                      setOpen(true)
                    }}
                    className="min-w-0 flex-1 truncate text-left text-xs text-text"
                  >
                    {term}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${term} from recent searches`}
                    onClick={() => {
                      const updated = searchHistory.filter((item) => item !== term)
                      setSearchHistory(updated)
                      try {
                        localStorage.setItem(PEOPLE_SEARCH_HISTORY_KEY, JSON.stringify(updated))
                      } catch (storageError) {
                        console.error('Failed to update people search history:', storageError)
                      }
                    }}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted opacity-60 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && error && <p role="alert" className="p-3 text-xs text-danger">{error}</p>}
          {query.trim().length >= 2 && !error && people.length === 0 && (
            <p className="p-3 text-xs text-muted">Searching for people…</p>
          )}
          {people.map((person) => (
            <div key={person.id} className="flex items-center gap-2 rounded-xl p-2 hover:bg-surface-3">
              <Link to={`/people/${person.id}`} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-2">
                <PersonAvatar person={person} className="h-9 w-9" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-text">{person.name}</span>
                  <span className="block truncate text-[11px] text-muted">{person.city || 'Spontii member'}</span>
                </span>
              </Link>
              {person.relationship === 'none' && (
                <button type="button" disabled={sendingId === person.id} onClick={() => sendRequest(person)} className="shrink-0 rounded-full bg-mint px-2.5 py-1.5 text-[10px] font-bold text-bg disabled:opacity-50">
                  {sendingId === person.id ? 'Sending…' : 'Add'}
                </button>
              )}
              {person.relationship === 'outgoing' && (
                <button
                  type="button"
                  disabled={sendingId === person.id}
                  onClick={async () => {
                    setSendingId(person.id)
                    try {
                      await apiRequest(`/friends/requests/${person.requestId}`, { method: 'DELETE' })
                      setPeople((previous) => previous.map((item) =>
                        item.id === person.id ? { ...item, relationship: 'none', requestId: null } : item,
                      ))
                    } catch (requestError) {
                      setError(requestError.message)
                    } finally {
                      setSendingId(null)
                    }
                  }}
                  className="text-[10px] font-semibold text-muted hover:text-danger disabled:opacity-50"
                >
                  {sendingId === person.id ? 'Updating…' : 'Withdraw'}
                </button>
              )}
              {person.relationship === 'incoming' && <Link to="/people?tab=requests" onClick={() => setOpen(false)} className="text-[10px] font-bold text-mint">Respond</Link>}
              {person.relationship === 'friends' && <span className="text-[10px] font-semibold text-mint">Friends</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FriendsMenu() {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [friendsTab, setFriendsTab] = useState('friends')
  const [friendSearch, setFriendSearch] = useState('')
  const [unfriendConfirmId, setUnfriendConfirmId] = useState(null)
  const [unfriendingId, setUnfriendingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadFriends = useCallback(async () => {
    try {
      const result = await apiRequest('/friends')
      setFriends(result.friends)
      setIncomingRequests(result.incomingRequests)
      setOutgoingRequests(result.outgoingRequests || [])
      setError('')
    } catch (loadError) {
      console.error('Failed to load friends:', loadError)
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadFriends(), 0)
    window.addEventListener('spontii:friends-changed', loadFriends)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener('spontii:friends-changed', loadFriends)
    }
  }, [loadFriends])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    if (!open) return undefined
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function respond(request, action) {
    setError('')
    try {
      await apiRequest(`/friends/requests/${request.requestId}/${action}`, { method: 'PATCH' })
      await loadFriends()
      window.dispatchEvent(new Event('spontii:friends-changed'))
    } catch (responseError) {
      setError(responseError.message)
    }
  }

  async function withdrawRequest(person) {
    setError('')
    try {
      await apiRequest(`/friends/requests/${person.requestId}`, { method: 'DELETE' })
      await loadFriends()
      window.dispatchEvent(new Event('spontii:friends-changed'))
    } catch (cancelError) {
      setError(cancelError.message)
    }
  }

  async function unfriend(person) {
    setUnfriendingId(person.id)
    setError('')
    try {
      await apiRequest(`/friends/${person.id}`, { method: 'DELETE' })
      await loadFriends()
      setUnfriendConfirmId(null)
      window.dispatchEvent(new Event('spontii:friends-changed'))
    } catch (unfriendError) {
      setError(unfriendError.message)
    } finally {
      setUnfriendingId(null)
    }
  }

  const searchTerm = friendSearch.trim().toLocaleLowerCase()
  const visibleFriends = friends.filter((person) =>
    !searchTerm || `${person.name} ${person.city || ''}`.toLocaleLowerCase().includes(searchTerm),
  )
  const visibleIncomingRequests = incomingRequests.filter((person) =>
    !searchTerm || `${person.name} ${person.city || ''}`.toLocaleLowerCase().includes(searchTerm),
  )
  const visibleOutgoingRequests = outgoingRequests.filter((person) =>
    !searchTerm || `${person.name} ${person.city || ''}`.toLocaleLowerCase().includes(searchTerm),
  )

  return (
    <>
      <div>
        <button
          type="button"
          aria-label={`Friends${incomingRequests.length ? `, ${incomingRequests.length} requests` : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            const nextOpen = !open
            setOpen(nextOpen)
            if (nextOpen) {
              setLoading(true)
              loadFriends()
            }
          }}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
        >
          <UsersIcon className="h-4 w-4" />
          {incomingRequests.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-bg bg-mint px-1 text-[9px] font-bold text-bg">
              {incomingRequests.length > 9 ? '9+' : incomingRequests.length}
            </span>
          )}
          <span className="sr-only">Friends</span>
        </button>
      </div>
      {open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="friends-menu-title" className="flex h-[min(44rem,92vh)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface-2 shadow-[0_32px_100px_rgba(0,0,0,0.6)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mint/10 text-mint">
                  <UsersIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-mint">Your Spontii circle</p>
                  <h2 id="friends-menu-title" className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">Friends</h2>
                  <p className="mt-0.5 text-xs text-muted">{friends.length} connections · keep your plans close</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close friends" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition hover:border-mint/40 hover:text-text">
                <CloseIcon className="h-4 w-4" />
              </button>
            </header>

            <div className="shrink-0 border-b border-border px-4 pt-3 sm:px-7">
              <nav className="flex gap-1 overflow-x-auto" aria-label="Friends views">
                {[
                  { id: 'friends', label: 'All friends', count: friends.length },
                  { id: 'incoming', label: 'Requests', count: incomingRequests.length },
                  { id: 'sent', label: 'Sent', count: outgoingRequests.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFriendsTab(tab.id)}
                    aria-current={friendsTab === tab.id ? 'page' : undefined}
                    className={`relative flex shrink-0 items-center gap-2 rounded-t-xl px-3 py-2.5 text-xs font-bold transition sm:px-4 ${
                      friendsTab === tab.id
                        ? 'bg-mint/10 text-mint'
                        : 'text-muted hover:bg-surface hover:text-text'
                    }`}
                  >
                    {tab.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      tab.id === 'incoming' && tab.count > 0
                        ? 'bg-mint text-bg'
                        : 'bg-surface-3 text-muted'
                    }`}>{tab.count > 99 ? '99+' : tab.count}</span>
                    {friendsTab === tab.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-mint" />}
                  </button>
                ))}
              </nav>
            </div>

            <div className="shrink-0 px-4 py-3 sm:px-7">
              <label className="flex h-11 items-center gap-2.5 rounded-xl border border-border bg-bg/65 px-3.5 transition focus-within:border-mint/50">
                <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                <input
                  type="search"
                  value={friendSearch}
                  onChange={(event) => setFriendSearch(event.target.value)}
                  placeholder={friendsTab === 'friends' ? 'Search your friends' : 'Search requests'}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
                />
                {friendSearch && (
                  <button type="button" onClick={() => setFriendSearch('')} className="text-xs font-semibold text-muted hover:text-text">
                    Clear
                  </button>
                )}
              </label>
            </div>

            {error && <p role="alert" className="mx-4 mb-2 shrink-0 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-xs text-danger sm:mx-7">{error}</p>}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-7 sm:pb-6">
              {loading ? (
                <p className="py-12 text-center text-sm text-muted">Loading your people…</p>
              ) : friendsTab === 'friends' ? (
                visibleFriends.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visibleFriends.map((person) => (
                      <article key={person.id} className="min-w-0 rounded-2xl border border-border/70 bg-surface p-3.5 transition hover:border-mint/35">
                        <div className="flex min-w-0 items-center gap-3">
                          <Link
                            to={`/people/${person.id}`}
                            onClick={() => setOpen(false)}
                            className="group flex min-w-0 flex-1 items-center gap-3"
                          >
                            <PersonAvatar person={person} className="h-12 w-12" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold tracking-[0.01em] [word-spacing:0.035em] text-text">{person.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted">{person.city || 'Spontii member'}</span>
                            </span>
                          </Link>
                          <Link
                            to={`/people/${person.id}`}
                            onClick={() => setOpen(false)}
                            className="inline-flex h-9 w-[5.5rem] shrink-0 items-center justify-center rounded-full bg-emerald-800 px-3 text-[11px] font-bold text-white transition hover:bg-emerald-700"
                          >
                            Profile
                          </Link>
                          <button
                            type="button"
                            disabled={unfriendingId === person.id}
                            onClick={() => setUnfriendConfirmId((current) => current === person.id ? null : person.id)}
                            className="inline-flex h-9 w-[5.5rem] shrink-0 items-center justify-center rounded-full bg-red-900 px-3 text-[11px] font-bold text-white transition hover:bg-red-800 disabled:opacity-50"
                          >
                            {unfriendingId === person.id ? 'Removing…' : 'Unfriend'}
                          </button>
                        </div>
                        {unfriendConfirmId === person.id && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2.5">
                            <p className="text-xs font-semibold text-red-100">Remove {person.name} from your friends?</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setUnfriendConfirmId(null)} className="rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-semibold text-muted hover:text-text">Cancel</button>
                              <button type="button" disabled={unfriendingId === person.id} onClick={() => void unfriend(person)} className="rounded-lg bg-red-800 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-50">{unfriendingId === person.id ? 'Removing…' : 'Confirm unfriend'}</button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-mint"><UsersIcon className="h-5 w-5" /></span>
                    <p className="mt-3 text-sm font-bold">{searchTerm ? 'No friends match that search' : 'Your circle starts here'}</p>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{searchTerm ? 'Try another name or city.' : 'Add people you know and they’ll appear here, ready to make plans together.'}</p>
                    {!searchTerm && <Link to="/people" onClick={() => setOpen(false)} className="mt-4 rounded-full bg-mint px-4 py-2 text-xs font-bold text-bg hover:bg-mint/90">Find people</Link>}
                  </div>
                )
              ) : friendsTab === 'incoming' ? (
                visibleIncomingRequests.length ? (
                  <div className="space-y-2">
                    {visibleIncomingRequests.map((person) => (
                      <div key={person.requestId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
                        <Link to={`/people/${person.id}`} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3">
                          <PersonAvatar person={person} className="h-12 w-12" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{person.name}</span>
                            <span className="block truncate text-xs text-muted">{person.city || 'Spontii member'}</span>
                            <time className="mt-1 block text-[10px] text-muted">Sent {new Date(person.createdAt).toLocaleString()}</time>
                          </span>
                        </Link>
                        <div className="flex w-full gap-2 sm:w-auto">
                          <button type="button" onClick={() => respond(person, 'accept')} className="flex-1 rounded-full bg-mint px-4 py-2 text-xs font-bold text-bg transition hover:bg-mint/90 sm:flex-none">Accept</button>
                          <button type="button" onClick={() => respond(person, 'reject')} className="flex-1 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted transition hover:border-danger/40 hover:text-danger sm:flex-none">Decline</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
                    <p className="text-sm font-bold">{searchTerm ? 'No requests match that search' : 'You’re all caught up'}</p>
                    <p className="mt-1 text-xs text-muted">New friend requests will show up here.</p>
                  </div>
                )
              ) : visibleOutgoingRequests.length ? (
                <div className="space-y-2">
                  {visibleOutgoingRequests.map((person) => (
                    <div key={person.requestId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
                      <Link to={`/people/${person.id}`} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3">
                        <PersonAvatar person={person} className="h-12 w-12" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{person.name}</span>
                          <time className="mt-0.5 block text-[11px] text-muted">Requested {new Date(person.createdAt).toLocaleString()}</time>
                        </span>
                      </Link>
                      <button type="button" onClick={() => withdrawRequest(person)} className="shrink-0 rounded-full border border-border px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-danger/40 hover:text-danger">Withdraw</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
                  <p className="text-sm font-bold">{searchTerm ? 'No requests match that search' : 'No sent requests'}</p>
                  <p className="mt-1 text-xs text-muted">Requests you send will be listed here.</p>
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-bg/35 px-4 py-3 sm:px-7">
              <p className="text-[11px] text-muted">Only accepted friends can see friends-only plans.</p>
              <Link to="/people" onClick={() => setOpen(false)} className="shrink-0 rounded-full bg-mint px-4 py-2 text-xs font-bold text-bg transition hover:bg-mint/90">Find people</Link>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
