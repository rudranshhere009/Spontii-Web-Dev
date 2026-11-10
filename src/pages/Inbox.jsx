import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { updates as seedUpdates } from '../data/mockData'
import ChatThread from '../components/ChatThread'
import { useChatEvent, useChatThread } from '../hooks/useChatThread'
import { apiRequest } from '../lib/api'
import { firstName, formatThreadTime, threadKey } from '../lib/chat'
import avatarPlaceholder from '../assets/avatar-placeholder.svg'
import logo from '../assets/logo.png'
import { socket } from '../lib/socket'
import {
  ArrowLeftIcon,
  BellIcon,
  ChatIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  FlagIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserIcon,
} from '../components/NavIcons'

const ICONS = { check: CheckIcon, chat: ChatIcon }

/* Updates saved before links existed still find their action. */
const SEED_LINKS = Object.fromEntries(
  seedUpdates.filter((u) => u.to).map((u) => [u.id, u.to]),
)

/* Only what the app actually does today; no new guarantees. */
const TRUST_POINTS = [
  {
    id: 'trust',
    icon: ShieldCheckIcon,
    title: 'Look for Verified',
    text: 'Check for the Verified badge on hosts and people before you meet.',
    more: 'It appears on activity pages and profiles. Hosts approve who joins each plan.',
  },
  {
    id: 'report',
    icon: FlagIcon,
    title: 'Keep it about the plan',
    text: 'You can message friends, and your host or guests while an event is on.',
    more: "Everyone else talks in the event's live chat. Report a message or block someone if anything feels off, and avoid sharing your address or phone number.",
  },
  {
    id: 'privacy',
    icon: LockIcon,
    title: 'Location stays approximate',
    text: 'The exact meeting point is shared once the host confirms you.',
    more: 'Until then, activity pages only show the general area.',
  },
]

function previewText(lastMessage, meId, kind) {
  if (!lastMessage) return 'No messages yet'
  const content = lastMessage.text || 'Sent an attachment'
  if (lastMessage.senderId === meId) return `You: ${content}`
  return kind === 'event' ? `${firstName(lastMessage.senderName)}: ${content}` : content
}

function ThreadRow({ id, selected, onOpen, image, round, title, preview, time, unread }) {
  return (
    <li>
      <button
        id={id}
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={`inbox-conversation-row group flex w-full items-center gap-2 px-2 py-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 ${
          selected
            ? 'is-selected bg-mint/[0.08]'
            : 'hover:bg-surface-3/60'
        }`}
      >
        <span className="inbox-avatar-frame relative h-9 w-9 shrink-0">
          <img src={image} alt="" className={`h-9 w-9 object-cover ring-1 ring-white/10 ${round ? 'rounded-full' : 'rounded-xl'}`} />
          {unread > 0 && <span className="inbox-avatar-unread absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface-2 bg-mint" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`truncate text-[0.86rem] text-text ${unread ? 'font-extrabold' : 'font-bold'}`}>{title}</p>
            <span className={`shrink-0 text-[10px] ${unread ? 'font-semibold text-mint' : 'text-muted'}`}>{time}</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className={`min-w-0 flex-1 truncate text-[0.74rem] ${unread ? 'text-text' : 'text-muted'}`}>{preview}</p>
            {unread > 0 && (
              <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-mint px-1 text-[9px] font-extrabold text-bg">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </div>
        </div>
        <ChevronRightIcon
          className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${selected ? 'text-mint' : 'text-muted'}`}
        />
      </button>
    </li>
  )
}

/* One open conversation: header (title, block, close) around the shared ChatThread. */
function ThreadPanel({ kind, threadId, summary, meId, onClose, onChanged, panelRef }) {
  const thread = useChatThread(kind, threadId)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [presence, setPresence] = useState(null)
  const isEvent = kind === 'event'
  const person = thread.person || summary?.person
  const personId = person?.id
  const title = isEvent ? thread.title || summary?.title || 'Event chat' : person?.name || 'Conversation'
  const image = isEvent ? summary?.image : person?.avatar || avatarPlaceholder
  const canBlock = !isEvent && person && thread.status === 'ready' && thread.reason !== 'blocked'

  function openProfile() {
    setProfile(null)
    setProfileError('')
    setProfileLoading(true)
    setProfileOpen(true)
  }

  useEffect(() => {
    if (!profileOpen || isEvent) return undefined
    let active = true
    apiRequest(`/people/${threadId}`)
      .then(({ person: loadedPerson }) => {
        if (active) setProfile(loadedPerson)
      })
      .catch((error) => {
        if (active) setProfileError(error.message)
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })
    return () => { active = false }
  }, [profileOpen, isEvent, threadId])

  useEffect(() => {
    if (isEvent || personId == null) return undefined
    const userId = String(personId)
    const onPresence = (payload) => {
      if (String(payload.userId) === userId) setPresence(Boolean(payload.online))
    }
    const watch = () => socket.emit('presence:watch', { userId })
    socket.on('presence:update', onPresence)
    if (socket.connected) watch()
    else socket.on('connect', watch)
    return () => {
      socket.off('presence:update', onPresence)
      socket.off('connect', watch)
      if (socket.connected) socket.emit('presence:unwatch', { userId })
    }
  }, [isEvent, personId])

  async function block() {
    setBlocking(true)
    setBlockError('')
    try {
      await apiRequest(`/blocks/${threadId}`, { method: 'POST' })
      setConfirmBlock(false)
      await thread.reload()
      onChanged()
    } catch (error) {
      setBlockError(error.message)
    } finally {
      setBlocking(false)
    }
  }

  return (
    <div
      ref={panelRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (profileOpen) setProfileOpen(false)
          else onClose()
        }
      }}
      className="inbox-thread-panel animate-rise-in flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg"
    >
      <div className="inbox-thread-header flex items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to chats"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 xl:hidden"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        {isEvent ? (
          <>
            <img src={image || avatarPlaceholder} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
            <Link to={`/activities/${threadId}`} className="min-w-0 flex-1 truncate font-bold hover:text-mint">{title}</Link>
          </>
        ) : (
          <button type="button" onClick={openProfile} aria-label={`View ${title}'s profile and chat options`} className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60">
            <img
              src={image}
              alt=""
              onError={(event) => { event.currentTarget.src = avatarPlaceholder }}
              className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-mint/15"
            />
            <span className="min-w-0">
              <span className="block truncate font-bold text-text transition-colors group-hover:text-mint">{title}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <span className={`h-2 w-2 rounded-full ${presence === true ? 'bg-mint' : 'bg-muted-2'}`} />
                {presence === true ? 'Online' : presence === false ? 'Offline' : 'Checking status'}
              </span>
            </span>
          </button>
        )}
        {isEvent && <p className="min-w-0 flex-1 truncate text-xs text-muted">Live chat · host and approved guests</p>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 xl:flex"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <ChatThread
        thread={thread}
        meId={meId}
        placeholder={isEvent ? 'Message the group…' : `Message ${firstName(person?.name)}…`}
      />
      {profileOpen && !isEvent && (
        <aside className="inbox-profile-drawer" aria-label={`${title}'s profile`}>
          <div className="inbox-profile-drawer-header">
            <span className="text-sm font-bold">Contact info</span>
            <button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile panel" className="rounded-full p-2 text-muted transition hover:bg-surface-3 hover:text-text">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="inbox-profile-drawer-content">
            <img src={profile?.avatar || image} alt="" onError={(event) => { event.currentTarget.src = avatarPlaceholder }} className="mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-mint/10" />
            <h2 className="mt-4 text-center text-lg font-extrabold">{profile?.name || title}</h2>
            <p className="mt-1 flex items-center justify-center gap-2 text-xs text-muted">
              <span className={`h-2 w-2 rounded-full ${presence === true ? 'bg-mint' : 'bg-muted-2'}`} />
              {presence === true ? 'Online' : presence === false ? 'Offline' : 'Checking status'}
            </p>
            {profileLoading && <p className="mt-5 text-center text-sm text-muted">Loading profile…</p>}
            {profileError && <p role="alert" className="mt-5 text-sm text-danger">{profileError}</p>}
            {profile && (
              <div className="mt-7 space-y-4">
                {profile.tagline && <p className="text-center text-sm text-text">{profile.tagline}</p>}
                {profile.city && <p className="rounded-xl bg-surface-3 px-3 py-2 text-sm text-text">{profile.city}</p>}
                {profile.bio && <p className="text-sm leading-relaxed text-muted">{profile.bio}</p>}
                {profile.tags?.length > 0 && <div className="flex flex-wrap gap-2">{profile.tags.map((tag) => <span key={tag} className="rounded-full bg-mint/10 px-2.5 py-1 text-xs font-semibold text-mint">{tag}</span>)}</div>}
              </div>
            )}
            <Link to={`/people/${threadId}`} className="mt-5 flex items-center justify-center rounded-xl bg-mint px-4 py-2.5 text-sm font-bold text-bg transition hover:bg-mint/90">
              Show full profile
            </Link>
            {canBlock && !confirmBlock && (
              <button type="button" onClick={() => setConfirmBlock(true)} className="mt-6 w-full rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-bold text-danger transition hover:bg-danger/15">
                Block {firstName(person?.name)}
              </button>
            )}
            {confirmBlock && (
              <div className="mt-6 rounded-xl bg-danger/10 p-3">
                <p className="text-xs leading-relaxed text-text">
                  Block {firstName(person?.name)}? You won’t be able to message each other, any friendship
                  between you ends, and you won’t see their messages in event chats.
                </p>
                {blockError && <p role="alert" className="mt-2 text-xs text-danger">{blockError}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setConfirmBlock(false)} className="flex-1 rounded-lg bg-surface-3 px-3 py-2 text-xs font-semibold text-text">Cancel</button>
                  <button type="button" disabled={blocking} onClick={block} className="flex-1 rounded-lg bg-danger px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{blocking ? 'Blocking…' : 'Block user'}</button>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

export default function Inbox() {
  const { currentUser, updates, markUpdatesRead, markUpdateRead } = useApp()
  const { user } = useAuth()
  const meId = user?.id
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [inbox, setInbox] = useState(null)
  const [inboxError, setInboxError] = useState('')
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [openTrust, setOpenTrust] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchText, setSearchText] = useState('')
  const panelRef = useRef(null)
  const refreshTimer = useRef(null)

  const routeThread = location.pathname.match(/^\/inbox\/(event|dm)\/([^/]+)$/)
  const eventParam = routeThread?.[1] === 'event' ? routeThread[2] : searchParams.get('event')
  const dmParam = routeThread?.[1] === 'dm' ? routeThread[2] : searchParams.get('dm')
  const active = eventParam
    ? { kind: 'event', threadId: eventParam }
    : dmParam && /^\d+$/.test(dmParam)
      ? { kind: 'direct', threadId: dmParam }
      : null
  const activeKey = active ? threadKey(active.kind, active.threadId) : null

  const loadInbox = useCallback(async () => {
    try {
      const data = await apiRequest('/inbox')
      setInbox(data)
      setInboxError('')
    } catch (error) {
      console.error('Failed to load inbox:', error)
      setInboxError('Your conversations could not be loaded. Please try again.')
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadInbox, 0)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearTimeout(refreshTimer.current)
    }
  }, [loadInbox])

  /* Several messages in a burst cause one list refresh. */
  function scheduleRefresh() {
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(loadInbox, 400)
  }
  useChatEvent('message:new', scheduleRefresh)
  useChatEvent('message:deleted-for-me', scheduleRefresh)
  useChatEvent('message:deleted-for-everyone', scheduleRefresh)
  useChatEvent('thread:access', scheduleRefresh)

  useEffect(() => {
    function updateNotificationCount(event) {
      setUnreadNotificationCount(event.detail?.unreadCount ?? 0)
    }

    window.addEventListener('spontii:notifications-count', updateNotificationCount)
    window.dispatchEvent(new Event('spontii:request-notifications-count'))
    return () => window.removeEventListener('spontii:notifications-count', updateNotificationCount)
  }, [])

  function openThread(kind, threadId) {
    const routeKind = kind === 'event' ? 'event' : 'dm'
    navigate(`/inbox/${routeKind}/${encodeURIComponent(String(threadId))}`)
  }

  function closeThread() {
    const key = activeKey
    if (routeThread) {
      navigate('/inbox')
    } else {
      setSearchParams({})
    }
    loadInbox()
    // Return keyboard focus to the row that opened the chat.
    requestAnimationFrame(() => document.getElementById(`thread-row-${key}`)?.focus())
  }

  // Below xl the conversation replaces the list, so bring it into view.
  useEffect(() => {
    if (!activeKey || !window.matchMedia('(max-width: 1279px)').matches) return
    panelRef.current?.scrollIntoView({ block: 'start' })
  }, [activeKey])

  const eventChats = inbox?.eventChats ?? []
  const directMessages = inbox?.directMessages ?? []
  const normalizedSearch = searchText.trim().toLocaleLowerCase()
  const visibleEventChats = eventChats.filter((chat) => (
    `${chat.title} ${previewText(chat.lastMessage, meId, 'event')}`.toLocaleLowerCase().includes(normalizedSearch)
  ))
  const visibleDirectMessages = directMessages.filter((chat) => (
    `${chat.person.name} ${previewText(chat.lastMessage, meId, 'direct')}`.toLocaleLowerCase().includes(normalizedSearch)
  ))
  // The open thread is being read, so it never shows as unread.
  const unreadOf = (kind, threadId, count) => (threadKey(kind, threadId) === activeKey ? 0 : count)
  const unreadThreads = [
    ...eventChats.map((chat) => unreadOf('event', chat.activityId, chat.unreadCount)),
    ...directMessages.map((chat) => unreadOf('direct', chat.person.id, chat.unreadCount)),
  ].filter(Boolean).length
  const filteredEventChats = visibleEventChats.filter((chat) => (
    activeTab !== 'unread' || unreadOf('event', chat.activityId, chat.unreadCount) > 0
  ))
  const filteredDirectMessages = activeTab === 'groups'
    ? []
    : visibleDirectMessages.filter((chat) => (
      activeTab !== 'unread' || unreadOf('direct', chat.person.id, chat.unreadCount) > 0
    ))
  const filteredConversationCount = filteredEventChats.length + filteredDirectMessages.length
  const activeSummary = active?.kind === 'event'
    ? eventChats.find((chat) => chat.activityId === active.threadId)
    : directMessages.find((chat) => String(chat.person.id) === active?.threadId)

  const unreadUpdates = updates.filter((u) => !u.read).length
  const totalConversations = eventChats.length + directMessages.length
  const viewerFirstName = firstName(currentUser.name)

  return (
    <div className="inbox-shell h-full min-h-0 bg-bg text-text">
      <div className="flex h-full min-h-0">
        <aside className={`inbox-sidebar flex min-h-0 w-full shrink-0 flex-col border-r border-border/70 bg-surface-2 md:w-[380px] xl:w-[420px] 2xl:w-[440px] ${
          active ? 'hidden md:flex' : 'flex'
        }`}>
          <header className="inbox-sidebar-header border-b border-border px-3.5 pb-2.5 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-base font-extrabold tracking-tight">Chats</h1>
                <p className="mt-0.5 text-[11px] text-muted">{totalConversations} conversations</p>
              </div>
              <div className="mt-1 flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('spontii:open-notifications'))}
                  aria-label={unreadNotificationCount ? `Open notifications, ${unreadNotificationCount} unread` : 'Open notifications'}
                  title="Notifications"
                  className="inbox-updates-button relative flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface text-muted transition hover:border-mint/50 hover:text-mint"
                >
                  <BellIcon className="h-3.5 w-3.5" />
                  {unreadNotificationCount > 0 && <span className="inbox-updates-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
                </button>
                <Link to="/people" aria-label="New message" title="New message" className="inbox-new-message flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface text-text transition hover:border-mint/50 hover:text-mint">
                  <PlusIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <div className="inbox-tabs mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg/55 p-1" role="tablist" aria-label="Filter conversations">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                onClick={() => setActiveTab('all')}
                className={`relative rounded-lg py-1 text-xs font-bold transition-colors ${
                  activeTab === 'all' ? 'inbox-tab-active bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'unread'}
                onClick={() => setActiveTab('unread')}
                className={`relative rounded-lg py-1 text-xs font-bold transition-colors ${
                  activeTab === 'unread' ? 'inbox-tab-active bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                Unread{unreadThreads > 0 && <span className="ml-1.5 text-xs text-mint">{unreadThreads}</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'groups'}
                onClick={() => setActiveTab('groups')}
                className={`relative rounded-lg py-1 text-xs font-bold transition-colors ${
                  activeTab === 'groups' ? 'inbox-tab-active bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                Groups
              </button>
            </div>
          </header>

          {activeTab !== 'updates' ? (
            <>
              <label className="inbox-search mx-3 mt-2.5 flex h-9 items-center gap-2 rounded-xl border border-border bg-bg/55 px-3 text-muted transition focus-within:border-mint/35 focus-within:ring-2 focus-within:ring-mint/10">
                <SearchIcon className="h-4 w-4 shrink-0" />
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search messages"
                  aria-label="Search conversations"
                  className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted-2"
                />
                <span className="shrink-0 text-xs">{filteredConversationCount}</span>
              </label>

              {inboxError && (
                <p role="alert" className="mx-4 mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{inboxError}</p>
              )}

              <div className="inbox-conversation-list min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 pt-3">
                {!inbox && !inboxError && <p className="px-3 py-4 text-sm text-muted">Loading conversations…</p>}
                {inbox && totalConversations === 0 && activeTab !== 'unread' && (
                  <div className="inbox-empty-conversations mx-2 rounded-2xl border border-border p-4">
                    <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-mint/10 text-mint"><ChatIcon className="h-5 w-5" /></span>
                    <p className="text-sm font-bold text-text">No conversations yet</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">Message a friend from their profile, or your host once you’re approved. Plans you host or get approved for open a live chat here.</p>
                    <Link to="/people" className="inbox-find-people mt-4 inline-flex items-center gap-1.5 rounded-lg border border-mint/20 bg-mint/5 px-3 py-2 text-xs font-bold text-mint transition hover:bg-mint/10">
                      Find people <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
                {inbox && filteredConversationCount === 0 && (totalConversations > 0 || activeTab === 'unread') && (
                  <p className="mx-2 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
                    {activeTab === 'unread'
                      ? 'You’re all caught up. No unread messages.'
                      : activeTab === 'groups'
                        ? 'No group conversations yet.'
                        : `No conversations match “${searchText}”.`}
                  </p>
                )}
                {filteredEventChats.length > 0 && (
                  <section aria-labelledby="event-chats-heading" className="mb-5">
                    <h2 id="event-chats-heading" className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-2">Event chats</h2>
                    <ul>
                      {filteredEventChats.map((chat) => (
                        <ThreadRow
                          key={chat.activityId}
                          id={`thread-row-${threadKey('event', chat.activityId)}`}
                          selected={activeKey === threadKey('event', chat.activityId)}
                          onOpen={() => openThread('event', chat.activityId)}
                          image={chat.image}
                          title={chat.title}
                          preview={previewText(chat.lastMessage, meId, 'event')}
                          time={formatThreadTime(chat.lastMessage?.createdAt)}
                          unread={unreadOf('event', chat.activityId, chat.unreadCount)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
                {filteredDirectMessages.length > 0 && (
                  <section aria-labelledby="direct-messages-heading">
                    <h2 id="direct-messages-heading" className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-2">Messages</h2>
                    <ul>
                      {filteredDirectMessages.map((chat) => (
                        <ThreadRow
                          key={chat.person.id}
                          id={`thread-row-${threadKey('direct', chat.person.id)}`}
                          selected={activeKey === threadKey('direct', chat.person.id)}
                          onOpen={() => openThread('direct', chat.person.id)}
                          image={chat.person.avatar || avatarPlaceholder}
                          round
                          title={chat.person.name}
                          preview={previewText(chat.lastMessage, meId, 'direct')}
                          time={formatThreadTime(chat.lastMessage?.createdAt)}
                          unread={unreadOf('direct', chat.person.id, chat.unreadCount)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <BellIcon className="h-4 w-4 text-muted" />
                  Updates
                  {unreadUpdates > 0 && <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-bold text-mint">{unreadUpdates} new</span>}
                </h2>
                <button
                  type="button"
                  onClick={markUpdatesRead}
                  disabled={unreadUpdates === 0}
                  className="rounded-md px-1.5 py-2 text-xs font-semibold text-muted transition-colors hover:text-text disabled:cursor-default disabled:text-muted-2"
                >
                  Mark read
                </button>
              </div>
              {updates.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-6 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint/10 text-mint"><CheckIcon className="h-5 w-5" /></span>
                  <p className="mt-3 text-sm font-bold">You're all caught up, {viewerFirstName}.</p>
                  <p className="mt-1 text-xs text-muted">New plan updates will show up here.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {updates.map((u) => {
                    const Icon = ICONS[u.icon] ?? BellIcon
                    const to = u.to ?? SEED_LINKS[u.id]
                    const rowClass = `group flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                      u.read ? 'border-transparent bg-surface text-muted hover:text-text' : 'border-mint/25 bg-mint/[0.06] text-text hover:border-mint/45'
                    }`
                    const body = (
                      <>
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${u.read ? 'text-muted-2' : 'text-mint'}`} />
                        <span className="min-w-0 flex-1">{u.text}</span>
                        {to ? <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> : !u.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mint" />}
                        {!u.read && <span className="sr-only">(unread)</span>}
                      </>
                    )
                    return (
                      <li key={u.id}>
                        {to ? (
                          <Link to={to} onClick={() => markUpdateRead(u.id)} className={rowClass}>{body}</Link>
                        ) : (
                          <button type="button" onClick={() => markUpdateRead(u.id)} disabled={u.read} className={`${rowClass} disabled:cursor-default`}>{body}</button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <section aria-labelledby="trust-heading" className="mt-6 border-t border-border pt-5">
                <h2 id="trust-heading" className="font-bold">Meet with confidence.</h2>
                <p className="mt-1 text-sm text-muted">A few things that keep plans comfortable for everyone.</p>
                <ul className="mt-3 divide-y divide-border">
                  {TRUST_POINTS.map(({ id, icon: Icon, title, text, more }) => {
                    const open = openTrust === id
                    return (
                      <li key={id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-mint"><Icon className="h-4 w-4" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
                            {open && <p id={`trust-more-${id}`} className="mt-1.5 text-xs leading-relaxed text-muted">{more}</p>}
                            <button type="button" onClick={() => setOpenTrust(open ? null : id)} aria-expanded={open} aria-controls={open ? `trust-more-${id}` : undefined} className="mt-1 inline-flex items-center gap-1 py-1 text-xs font-semibold text-mint hover:text-mint/80">
                              {open ? 'Show less' : 'Learn more'}
                              <ChevronDownIcon className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </div>
          )}

          <Link to="/profile" aria-label={`Your profile: ${currentUser.name}`} className="inbox-current-profile flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-3 transition">
            <img src={currentUser.avatar || avatarPlaceholder} alt="" className="h-10 w-10 rounded-full object-cover" />
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{currentUser.name}</span>
            <UserIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
          </Link>
        </aside>

        <main className={`min-h-0 min-w-0 flex-1 ${
          active ? 'flex' : 'hidden md:flex'
        }`}>
          {active ? (
            <ThreadPanel
              key={activeKey}
              kind={active.kind}
              threadId={active.threadId}
              summary={activeSummary}
              meId={meId}
              onClose={closeThread}
              onChanged={loadInbox}
              panelRef={panelRef}
            />
          ) : (
            <div className="inbox-welcome flex h-full w-full items-center justify-center px-4 py-5 sm:px-8">
              <div className="inbox-welcome-content w-full text-center">
                <img src={logo} alt="Spontii" className="inbox-welcome-logo mx-auto" />
                <h2 className="mt-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Your conversations, together</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">Choose a conversation from your inbox to start chatting, or find people and make a plan together.</p>
                <Link to="/people" className="inbox-find-people mt-7 inline-flex items-center gap-2 rounded-xl bg-mint px-5 py-3 text-sm font-extrabold text-bg transition hover:-translate-y-0.5 hover:bg-mint/90">
                  <PlusIcon className="h-4 w-4" />
                  Find people
                </Link>
                <p className="inbox-welcome-hint mt-8 border-t border-border pt-5 text-xs text-muted-2">Your conversations will appear here</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
