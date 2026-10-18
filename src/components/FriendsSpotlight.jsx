import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiRequest } from '../lib/api'
import avatarPlaceholder from '../assets/avatar-placeholder.svg'

export default function FriendsSpotlight() {
  const { isAuthenticated } = useAuth()
  const [friends, setFriends] = useState([])
  const [error, setError] = useState('')

  const loadFriends = useCallback(async () => {
    try {
      const result = await apiRequest('/friends')
      setFriends(result.friends)
      setError('')
    } catch (loadError) {
      console.error('Failed to load homepage friends:', loadError)
      setError(loadError.message)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return undefined
    const initialLoad = window.setTimeout(loadFriends, 0)
    window.addEventListener('spontii:friends-changed', loadFriends)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener('spontii:friends-changed', loadFriends)
    }
  }, [isAuthenticated, loadFriends])

  if (!isAuthenticated) return null

  return (
    <section aria-labelledby="friends-spotlight-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">Your circle</p>
          <h2 id="friends-spotlight-title" className="mt-1 text-2xl font-extrabold">People you want to interact with</h2>
        </div>
        <Link to="/people" className="shrink-0 text-sm font-semibold text-muted hover:text-text">Find people</Link>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-border p-4 text-sm text-muted">Your friends could not be loaded. Try again from Find people.</p>
      ) : friends.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {friends.slice(0, 6).map((person) => (
            <Link key={person.id} to={`/people/${person.id}`} className="relative flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4 pr-20 transition-colors hover:border-mint/40">
              <img src={person.avatar || avatarPlaceholder} alt="" className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{person.name}</span>
                <span className="block truncate text-xs text-muted">{person.city || 'Spontii member'}</span>
              </span>
              <span className="absolute right-3 top-3 rounded-full border border-mint/25 bg-mint/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-mint">Friend</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 p-6 text-center">
          <p className="text-sm text-muted">People you accept as friends will appear here.</p>
          <Link to="/people" className="mt-3 inline-flex rounded-full bg-mint px-4 py-2 text-xs font-bold text-bg">Find people</Link>
        </div>
      )}
    </section>
  )
}
