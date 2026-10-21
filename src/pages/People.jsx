import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import avatarPlaceholder from '../assets/avatar-placeholder.svg'
import {
  ArrowLeftIcon,
  ChatIcon,
  CheckIcon,
  MapPinIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '../components/NavIcons'

function Avatar({ person, size = 'h-14 w-14' }) {
  return (
    <img
      src={person.avatar || avatarPlaceholder}
      alt=""
      className={`${size} shrink-0 rounded-full border border-border object-cover`}
    />
  )
}

export default function People() {
  const { id } = useParams()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [friends, setFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [person, setPerson] = useState(null)
  const [relationship, setRelationship] = useState('none')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [unfriendConfirm, setUnfriendConfirm] = useState(false)
  const [blockConfirm, setBlockConfirm] = useState(false)
  const [error, setError] = useState('')
  const requestsTab = new URLSearchParams(location.search).get('tab') === 'requests'

  async function loadFriends() {
    const data = await apiRequest('/friends')
    setFriends(data.friends)
    setIncomingRequests(data.incomingRequests)
  }

  /* After a relationship change, the server decides again whether you can message them. */
  async function reloadPerson() {
    if (!id) return
    const { person: loadedPerson } = await apiRequest(`/people/${id}`)
    setPerson(loadedPerson)
    setRelationship(loadedPerson?.relationship || 'none')
  }

  async function setBlocked(targetId, blocked) {
    setWorking(true)
    setError('')
    try {
      await apiRequest(`/blocks/${targetId}`, { method: blocked ? 'POST' : 'DELETE' })
      setBlockConfirm(false)
      setUnfriendConfirm(false)
      await reloadPerson()
      window.dispatchEvent(new Event('spontii:friends-changed'))
    } catch (blockError) {
      setError(blockError.message)
    } finally {
      setWorking(false)
    }
  }

  useEffect(() => {
    let active = true
    const request = id
      ? apiRequest(`/people/${id}`).then(({ person: loadedPerson }) => {
          if (active) {
            setPerson(loadedPerson)
            setRelationship(loadedPerson?.relationship || 'none')
          }
        })
      : apiRequest('/friends').then(({ friends: loadedFriends, incomingRequests: requests }) => {
          if (active) {
            setFriends(loadedFriends)
            setIncomingRequests(requests)
          }
        })
    request
      .catch((loadError) => {
        console.error('Failed to load people:', loadError)
        if (active) setError(loadError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (id || query.trim().length < 2) return undefined
    let active = true
    const timeout = window.setTimeout(() => {
      apiRequest(`/people/search?q=${encodeURIComponent(query.trim())}`)
        .then(({ people: found }) => {
          if (active) {
            setResults(found)
            setError('')
          }
        })
        .catch((searchError) => {
          console.error('Failed to search people:', searchError)
          if (active) setError(searchError.message)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [id, query])

  async function sendRequest(targetId) {
    setWorking(true)
    setError('')
    try {
      await apiRequest(`/friends/requests/${targetId}`, { method: 'POST' })
      setRelationship('outgoing')
      setResults((current) => current.map((result) =>
        result.id === targetId ? { ...result, relationship: 'outgoing' } : result,
      ))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setWorking(false)
    }
  }

  async function respond(request, action) {
    setWorking(true)
    setError('')
    try {
      await apiRequest(`/friends/requests/${request.requestId}/${action}`, { method: 'PATCH' })
      await loadFriends()
      window.dispatchEvent(new Event('spontii:friends-changed'))
      if (id && person?.id === request.id) await reloadPerson()
    } catch (responseError) {
      setError(responseError.message)
    } finally {
      setWorking(false)
    }
  }

  async function withdrawRequest(requestId, targetId) {
    setWorking(true)
    setError('')
    try {
      await apiRequest(`/friends/requests/${requestId}`, { method: 'DELETE' })
      setRelationship('none')
      setResults((current) => current.map((result) =>
        result.id === targetId ? { ...result, relationship: 'none', requestId: null } : result,
      ))
      window.dispatchEvent(new Event('spontii:friends-changed'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setWorking(false)
    }
  }

  async function unfriend(targetId) {
    setWorking(true)
    setError('')
    try {
      await apiRequest(`/friends/${targetId}`, { method: 'DELETE' })
      setFriends((current) => current.filter((friend) => friend.id !== targetId))
      setUnfriendConfirm(false)
      await reloadPerson()
      window.dispatchEvent(new Event('spontii:friends-changed'))
    } catch (unfriendError) {
      setError(unfriendError.message)
    } finally {
      setWorking(false)
    }
  }

  if (id) {
    return (
      <main className="wide-screen-container mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:py-10">
        <Link to="/people" className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:border-mint/40 hover:text-text">
          <ArrowLeftIcon className="h-4 w-4" /> People
        </Link>
        {error && <p role="alert" className="mb-4 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        {loading ? (
          <div className="animate-pulse overflow-hidden rounded-3xl border border-border bg-surface-2">
            <div className="h-44 bg-surface-3 sm:h-56" />
            <div className="space-y-4 p-6"><div className="h-6 w-48 rounded bg-surface-3" /><div className="h-4 w-72 max-w-full rounded bg-surface-3" /></div>
          </div>
        ) : person ? (
          <article className="overflow-hidden rounded-3xl border border-border bg-surface-2 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
            <div className="relative h-40 overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 sm:h-56">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(52,211,153,0.28),transparent_32%),radial-gradient(circle_at_82%_85%,rgba(99,102,241,0.25),transparent_34%)]" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface-2 to-transparent" />
              <span className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/85 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                Spontii profile
              </span>
            </div>

            <div className="relative px-5 pb-6 sm:px-9 sm:pb-9">
              <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 flex-col items-center text-center sm:flex-row sm:items-end sm:gap-5 sm:text-left">
                  <div className="rounded-full border-[5px] border-surface-2 bg-surface-2 shadow-xl">
                    <Avatar person={person} size="h-24 w-24 sm:h-32 sm:w-32" />
                  </div>
                  <div className="mt-3 min-w-0 sm:mb-2 sm:mt-0">
                    <p className="-translate-y-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-mint">Meet the person</p>
                    <h1 className="mt-1 truncate text-2xl font-extrabold tracking-[0.01em] text-text [word-spacing:0.035em] sm:text-3xl">{person.name}</h1>
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted sm:justify-start">
                      <MapPinIcon className="h-4 w-4 text-mint" />
                      {person.city || 'Spontii member'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2 sm:mb-2 sm:justify-end">
                  {person.blocked && (
                    <div className="flex flex-col items-center gap-2 sm:items-end">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold text-muted">
                        You blocked {person.name.split(' ')[0]}
                      </span>
                      <button type="button" disabled={working} onClick={() => void setBlocked(person.id, false)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-text transition hover:border-mint/40 hover:text-mint disabled:opacity-50">
                        {working ? 'Unblocking…' : 'Unblock'}
                      </button>
                    </div>
                  )}
                  {!person.blocked && (person.canMessage || relationship === 'friends') && (
                    <Link to={`/inbox?dm=${person.id}`} className="inline-flex items-center gap-2 self-start rounded-xl border border-mint/40 bg-mint-soft px-5 py-3 text-sm font-extrabold text-mint transition hover:-translate-y-0.5 hover:bg-mint/15">
                      <ChatIcon className="h-4 w-4" /> Message
                    </Link>
                  )}
                  {!person.blocked && relationship === 'none' && (
                    <button type="button" disabled={working} onClick={() => sendRequest(person.id)} className="inline-flex items-center gap-2 rounded-xl bg-mint px-5 py-3 text-sm font-extrabold text-bg shadow-lg shadow-mint/10 transition hover:-translate-y-0.5 hover:bg-mint/90 disabled:opacity-50">
                      <UsersIcon className="h-4 w-4" /> {working ? 'Sending…' : 'Add friend'}
                    </button>
                  )}
                  {!person.blocked && relationship === 'outgoing' && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-mint/25 bg-mint-soft px-4 py-3 text-sm font-bold text-mint">
                        <CheckIcon className="h-4 w-4" /> Request sent
                      </span>
                      <button type="button" disabled={working} onClick={() => void withdrawRequest(person.requestId, person.id)} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50">
                        {working ? 'Withdrawing…' : 'Withdraw'}
                      </button>
                    </div>
                  )}
                  {!person.blocked && relationship === 'friends' && (
                    <div className="flex flex-col items-center gap-2 sm:items-end">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-mint/30 bg-mint-soft px-5 py-3 text-sm font-extrabold text-mint">
                        <UsersIcon className="h-4 w-4" /> You’re friends
                      </span>
                      {!unfriendConfirm ? (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => setUnfriendConfirm(true)}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-900/70 bg-red-950/35 px-3 py-2 text-xs font-bold text-red-200 transition hover:border-red-700 hover:bg-red-950/70 disabled:opacity-50"
                        >
                          Remove friend
                        </button>
                      ) : (
                        <div className="rounded-xl border border-red-900/70 bg-red-950/40 p-3">
                          <p className="text-xs font-semibold text-red-100">Remove {person.name} from your friends?</p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" disabled={working} onClick={() => setUnfriendConfirm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">Keep friend</button>
                            <button type="button" disabled={working} onClick={() => void unfriend(person.id)} className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">{working ? 'Removing…' : 'Unfriend'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!person.blocked && relationship === 'incoming' && (
                    <div className="flex gap-2">
                      <button type="button" disabled={working} onClick={() => respond({ id: person.id, requestId: person.requestId }, 'accept')} className="rounded-xl bg-mint px-4 py-3 text-sm font-bold text-bg disabled:opacity-50">Accept request</button>
                      <button type="button" disabled={working} onClick={() => respond({ id: person.id, requestId: person.requestId }, 'reject')} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-muted hover:border-danger/40 hover:text-danger disabled:opacity-50">Decline</button>
                    </div>
                  )}
                </div>
              </div>

              {!person.blocked && (
                <div className="mt-4 flex justify-center sm:justify-end">
                  {blockConfirm ? (
                    <div className="max-w-sm rounded-xl border border-red-900/70 bg-red-950/40 p-3">
                      <p className="text-xs font-semibold text-red-100">
                        Block {person.name}? You won’t be able to message each other, any friendship ends,
                        and you won’t see their messages in event chats.
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" disabled={working} onClick={() => setBlockConfirm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">Cancel</button>
                        <button type="button" disabled={working} onClick={() => void setBlocked(person.id, true)} className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">{working ? 'Blocking…' : 'Block'}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setBlockConfirm(true)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-danger/10 hover:text-danger">
                      Block {person.name.split(' ')[0]}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-7 grid gap-4 border-t border-border pt-6 lg:grid-cols-[minmax(0,1fr)_250px]">
                <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                  <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-muted">
                    <ShieldCheckIcon className="h-4 w-4 text-mint" /> About
                  </h2>
                  {person.tagline && <p className="mt-4 text-lg font-bold leading-snug text-mint">{person.tagline}</p>}
                  {person.bio ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text/80">{person.bio}</p>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-muted">This person hasn’t added a bio yet. Send a friend request to connect.</p>
                  )}
                </section>
                <aside className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface-2 p-5">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">A little more</p>
                  <p className="mt-2 text-sm font-semibold text-text">{person.city || 'City not shared'}</p>
                  <p className="mt-1 text-xs text-muted">Location</p>
                  {Number.isFinite(Number(person.score)) && (
                    <div className="mt-5 border-t border-border pt-4">
                      <p className="text-xl font-extrabold text-mint">{person.score}</p>
                      <p className="mt-1 text-xs text-muted">Spontii community score</p>
                    </div>
                  )}
                </aside>
              </div>

              <section className="mt-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">Interests</h2>
                    <p className="mt-1 text-xs text-muted">Things they enjoy and want to do</p>
                  </div>
                  {person.tags?.length > 0 && <span className="rounded-full bg-mint-soft px-2.5 py-1 text-[10px] font-bold text-mint">{person.tags.length} interests</span>}
                </div>
                {person.tags?.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {person.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-mint/20 bg-mint/5 px-3.5 py-2 text-xs font-semibold text-text transition hover:border-mint/50 hover:bg-mint/10">{tag}</span>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-muted">No interests shared yet.</p>}
              </section>
            </div>
          </article>
        ) : <p className="rounded-2xl border border-dashed border-border py-20 text-center text-sm text-muted">This profile is not available.</p>}
      </main>
    )
  }

  return (
    <main className="wide-screen-container mx-auto max-w-5xl space-y-8 px-5 py-8 sm:px-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">People</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Find your people.</h1>
        <p className="mt-2 text-sm text-muted">Search by name, view profiles, and send friend requests.</p>
      </header>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <label className="flex h-12 items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 focus-within:border-mint/60">
        <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="sr-only">Search people by name</span>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setError('') }} placeholder="Search people by name…" className="h-full min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted" />
      </label>

      {query.trim().length >= 2 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Search results</h2>
          {results.length ? <div className="grid gap-3 sm:grid-cols-2">
            {results.map((result) => (
              <div key={result.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4">
                <Link to={`/people/${result.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar person={result} size="h-12 w-12" />
                  <span className="min-w-0"><span className="block truncate text-sm font-bold">{result.name}</span><span className="block truncate text-xs text-muted">{result.city || 'Spontii member'}</span></span>
                </Link>
                {result.relationship === 'none' && <button type="button" disabled={working} onClick={() => sendRequest(result.id)} className="rounded-full bg-mint px-3 py-2 text-xs font-bold text-bg">Add friend</button>}
                {result.relationship === 'outgoing' && (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void withdrawRequest(result.requestId, result.id)}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                )}
                {result.relationship === 'incoming' && <Link to="/people?tab=requests" className="text-xs font-bold text-mint">Respond</Link>}
                {result.relationship === 'friends' && <span className="text-xs font-bold text-mint">Friends</span>}
              </div>
            ))}
          </div> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">No matching people found.</p>}
        </section>
      )}

      {!query.trim() && !loading && (
        <section className="space-y-6">
          {(requestsTab || incomingRequests.length > 0) && (
            <div>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-mint">Friend requests</h2>
              {incomingRequests.length ? <div className="grid gap-3 sm:grid-cols-2">
                {incomingRequests.map((request) => (
                  <div key={request.requestId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4">
                    <Link to={`/people/${request.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar person={request} size="h-12 w-12" />
                      <span className="min-w-0"><span className="block truncate text-sm font-bold">{request.name}</span><span className="block truncate text-xs text-muted">{request.city || 'Spontii member'}</span></span>
                    </Link>
                    <button type="button" disabled={working} onClick={() => respond(request, 'accept')} className="rounded-lg bg-mint px-3 py-2 text-xs font-bold text-bg">Accept</button>
                    <button type="button" disabled={working} onClick={() => respond(request, 'reject')} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted">Decline</button>
                  </div>
                ))}
              </div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">No pending requests.</p>}
            </div>
          )}
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Your friends</h2>
            {friends.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {friends.map((friend) => <Link key={friend.id} to={`/people/${friend.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4 transition-colors hover:border-mint/40">
                <Avatar person={friend} size="h-12 w-12" />
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{friend.name}</span><span className="block truncate text-xs text-muted">{friend.city || 'Spontii member'}</span></span>
              </Link>)}
            </div> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">You have no accepted friends yet. Search above to connect.</p>}
          </div>
        </section>
      )}
    </main>
  )
}
